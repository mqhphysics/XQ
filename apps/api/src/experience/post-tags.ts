import { HttpStatus } from '@nestjs/common'
import { ERROR_CODES } from '@xiaoqiu/contracts'
import { ApiHttpException } from '../common/api-http.exception'
import type { Prisma, PostTagKind } from '../generated/prisma/client'

export interface PostTagInput {
  kind: PostTagKind
  label?: string
  targetId?: string
}

export interface ResolvedPostTag {
  kind: PostTagKind
  key: string
  label: string
  position: number
  teamId: string | null
  playerId: string | null
}

function invalid(message: string): never {
  throw new ApiHttpException(HttpStatus.BAD_REQUEST, { code: ERROR_CODES.BAD_REQUEST, message })
}

export function normalizePostTags(inputs: PostTagInput[] = []): ResolvedPostTag[] {
  if (!Array.isArray(inputs) || inputs.length > 10) invalid('每条动态最多添加 10 个标签')
  const tags = new Map<string, Omit<ResolvedPostTag, 'position'>>()
  for (const input of inputs) {
    if (!input || !['TOPIC', 'TEAM', 'PLAYER'].includes(input.kind)) invalid('标签类型无效')
    if (input.kind === 'TOPIC') {
      if (input.targetId !== undefined) invalid('话题标签不能关联球队或球员编号')
      const label = input.label?.normalize('NFKC').trim().replace(/^#+/, '').trim() ?? ''
      if (!label || Array.from(label).length > 30 || /[\p{Cc}\p{Cf}]/u.test(label))
        invalid('话题标签应为 1 至 30 个可见字符')
      const key = `TOPIC:${label.toLocaleLowerCase('zh-CN')}`
      if (!tags.has(key)) tags.set(key, { kind: 'TOPIC', key, label, teamId: null, playerId: null })
    } else {
      const id = input.targetId?.toLowerCase()
      if (!id || !/^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/.test(id))
        invalid('请选择对应的球队或球员标签')
      const key = `${input.kind}:${id}`
      if (!tags.has(key))
        tags.set(key, {
          kind: input.kind,
          key,
          label: '',
          teamId: input.kind === 'TEAM' ? id : null,
          playerId: input.kind === 'PLAYER' ? id : null,
        })
    }
  }
  return [...tags.values()].map((tag, position) => ({ ...tag, position }))
}

export async function resolvePostTags(
  prisma: Prisma.TransactionClient,
  organizationId: string,
  tournamentId: string,
  inputs?: PostTagInput[],
): Promise<ResolvedPostTag[]> {
  const tags = normalizePostTags(inputs)
  if (!tags.length) return tags
  const teamIds = tags.flatMap((tag) => (tag.teamId ? [tag.teamId] : []))
  const playerIds = tags.flatMap((tag) => (tag.playerId ? [tag.playerId] : []))
  const [teams, players] = await Promise.all([
    teamIds.length
      ? prisma.team.findMany({
          where: {
            organizationId,
            id: { in: teamIds },
          },
          select: { id: true, name: true },
        })
      : [],
    playerIds.length
      ? prisma.playerProfile.findMany({
          where: {
            organizationId,
            id: { in: playerIds },
            snapshotEntries: {
              some: {
                organizationId,
                rosterSnapshot: {
                  organizationId,
                  tournamentId,
                  lockedAt: { not: null },
                  teamRegistration: { organizationId, tournamentId, status: 'APPROVED' },
                },
              },
            },
          },
          select: { id: true, displayName: true },
        })
      : [],
  ])
  const teamNames = new Map(teams.map((team) => [team.id, team.name]))
  const playerNames = new Map(players.map((player) => [player.id, player.displayName]))
  return tags.map((tag) => {
    if (tag.teamId) {
      const label = teamNames.get(tag.teamId)
      if (!label) invalid('标签中的球队不在当前组织公开目录中')
      return { ...tag, label }
    }
    if (tag.playerId) {
      const label = playerNames.get(tag.playerId)
      if (!label) invalid('标签中的球员没有当前赛事的公开档案')
      return { ...tag, label }
    }
    return tag
  })
}

export function postTagFingerprint(tags: Array<Pick<ResolvedPostTag, 'key' | 'label'>>): string {
  return JSON.stringify(
    tags.map(({ key, label }) => [key, key.startsWith('TOPIC:') ? label : null]),
  )
}

export function mapPostTags(
  tags: Array<Pick<ResolvedPostTag, 'kind' | 'label' | 'teamId' | 'playerId'>>,
) {
  return tags.map((tag) => ({
    kind: tag.kind,
    label: tag.label,
    ...((tag.teamId ?? tag.playerId) ? { targetId: tag.teamId ?? tag.playerId } : {}),
  }))
}
