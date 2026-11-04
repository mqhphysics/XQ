import { createHash, randomUUID } from 'node:crypto'
import { HttpStatus, Inject, Injectable, Optional } from '@nestjs/common'
import { ERROR_CODES } from '@xiaoqiu/contracts'
import { isUUID } from 'class-validator'
import { AuthService, type AuthenticatedSession } from '../auth/auth.service'
import { ApiHttpException } from '../common/api-http.exception'
import { isDemoFixtureOrganization } from '../common/demo-fixture-organization'
import { PrismaService } from '../database/prisma.service'
import type { Prisma, MatchEvent } from '../generated/prisma/client'
import { ResultsService } from '../results/results.service'
import type {
  MediaPurpose,
  MediaVisibilityDto,
  ReviewMediaDto,
  SubmitMediaDto,
} from './managed-media.dto'
import { invalidMedia, validateMedia } from './media-image'
import { MediaStorage } from './media-storage'
import { goalMediaEnabled, mediaPermissions } from './media-policy'
import { DEFAULT_COVERS, defaultAvatar, defaultCover } from '../media/default-media'
import { AiModerationService } from '../ai-moderation/ai-moderation.service'
import { syncLinkedPlayerAvatar } from '../media/linked-player-avatar'

interface MediaRow {
  id: string
  organization_id: string
  uploader_user_id: string
  client_submission_id: string
  purpose: MediaPurpose
  target_id: string
  target_label: string
  match_id: string | null
  event_signature: string | null
  checksum: string
  mime_type: string
  bytes: number
  width: number
  height: number
  frames: number
  duration_ms: number
  status: 'PENDING' | 'APPROVED' | 'REJECTED'
  visibility: 'ACTIVE' | 'HIDDEN' | 'DELETED'
  review_reason: string | null
  reviewed_at: Date | null
  visibility_changed_by_user_id: string | null
  version: number
  created_at: Date
}
type Database = Prisma.TransactionClient

@Injectable()
export class ManagedMediaService {
  private readonly storage = new MediaStorage()
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(ResultsService) private readonly results: ResultsService,
    @Optional() @Inject(AiModerationService) private readonly aiModeration?: AiModerationService,
  ) {}

  async submit(authorization: string | undefined, body: SubmitMediaDto, requestId: string) {
    const session = await this.requireActor(authorization)
    this.requireEnabled()
    const targetId = objectId(body.targetId)
    const capabilities = mediaPermissions(session)
    if (
      (body.purpose === 'USER_AVATAR' || body.purpose === 'USER_BACKGROUND') &&
      targetId !== session.userId &&
      !capabilities.canReview
    )
      throw forbidden('只能上传本人的头像或个人背景')
    if (
      ['PLAYER_PORTRAIT', 'PLAYER_AVATAR', 'PLAYER_BACKGROUND'].includes(body.purpose) &&
      targetId !== capabilities.linkedPlayerId &&
      !capabilities.canManageAnyPlayerPortrait
    )
      throw forbidden('只能投稿本人已关联的球员照片')
    if (
      (body.purpose === 'TEAM_CREST' || body.purpose === 'TEAM_BACKGROUND') &&
      !capabilities.canManageAnyTeamProfile &&
      !session.user.roles.some(
        (role) =>
          role.role === 'TEAM_CAPTAIN' && role.scopeType === 'TEAM' && role.scopeId === targetId,
      )
    )
      throw forbidden('只有本队队长或管理员可以更换队徽或球队背景')
    const media = await validateMedia(body.dataUrl, body.purpose, body.posterDataUrl)
    const id = randomUUID()
    try {
      const row = await this.prisma.$transaction(
        async (tx) => {
          // Serialize quota/idempotency and per-target profile selection across requests.
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${session.organizationId + session.userId}, 0))`
          const existing = await tx.$queryRaw<
            MediaRow[]
          >`SELECT * FROM managed_media_assets WHERE organization_id=${session.organizationId}::uuid AND uploader_user_id=${session.userId}::uuid AND client_submission_id=${body.clientSubmissionId}`
          if (existing[0]) {
            if (
              existing[0].checksum !== media.checksum ||
              existing[0].target_id !== targetId ||
              existing[0].purpose !== body.purpose
            )
              throw conflict('同一投稿标识不能用于不同文件或事件')
            return existing[0]
          }
          const quota = await tx.$queryRaw<
            { count: number }[]
          >`SELECT count(*)::int AS count FROM managed_media_assets WHERE organization_id=${session.organizationId}::uuid AND uploader_user_id=${session.userId}::uuid AND created_at > now() - interval '24 hours'`
          if (quota[0]!.count >= (capabilities.canDirectPublish ? 200 : 30))
            throw invalidMedia('今日投稿数量已达上限，请稍后再试')
          const target = await this.requireTarget(
            tx,
            session.organizationId,
            body.purpose,
            targetId,
            true,
          )
          await this.storage.store(session.organizationId, id, media)
          const preReview = await this.aiModeration?.requiresPreReview(
            tx,
            session.organizationId,
            body.purpose,
          )
          const status = 'APPROVED'
          const inserted = await tx.$queryRaw<MediaRow[]>`INSERT INTO managed_media_assets
          (id,organization_id,uploader_user_id,client_submission_id,purpose,target_id,target_label,match_id,event_signature,checksum,mime_type,bytes,width,height,frames,duration_ms,status,reviewed_by_user_id,reviewed_at)
          VALUES (${id}::uuid,${session.organizationId}::uuid,${session.userId}::uuid,${body.clientSubmissionId},${body.purpose},${targetId}::uuid,${target.label},${target.matchId}::uuid,${target.signature},${media.checksum},${media.mimeType},${media.body.length},${media.width},${media.height},${media.frames},${media.durationMs},${status},${capabilities.canDirectPublish ? session.userId : null}::uuid,${capabilities.canDirectPublish ? new Date() : null}) RETURNING *`
          const insertedRow = inserted[0]!
          if (preReview) {
            await tx.managedMediaAsset.update({
              where: { id: insertedRow.id },
              data: { visibility: 'HIDDEN', reviewedAt: null, reviewedByUserId: null },
            })
            insertedRow.visibility = 'HIDDEN'
            insertedRow.reviewed_at = null
          } else await this.syncProfile(tx, insertedRow)
          await this.audit(
            tx,
            session,
            insertedRow,
            'MEDIA_SUBMITTED',
            requestId,
            preReview ? '资料已保存，等待AI审核后公开' : '上传内容已生效，待人工复核',
          )
          await this.aiModeration?.enqueue(tx, session.organizationId, 'MEDIA', insertedRow.id)
          return insertedRow
        },
        { timeout: 20_000 },
      )
      return this.toDto(row, session, await this.targetIsCurrent(this.prisma, row))
    } catch (error) {
      await this.storage.abort(session.organizationId, id)
      throw error
    }
  }

  async mine(authorization?: string, before?: string) {
    const session = await this.requireActor(authorization)
    const boundary = cursor(before)
    const rows = await this.prisma.$queryRaw<
      MediaRow[]
    >`SELECT * FROM managed_media_assets WHERE organization_id=${session.organizationId}::uuid AND uploader_user_id=${session.userId}::uuid AND (created_at,id) < (${boundary.date},${boundary.id}::uuid) ORDER BY created_at DESC,id DESC LIMIT 51`
    return this.listDto(rows, session)
  }

  // Campus profile edits already run inside a fresh, versioned admin transaction.
  async submitProfile(
    tx: Database,
    session: AuthenticatedSession,
    purpose: MediaPurpose,
    targetId: string,
    dataUrl: string,
    requestId: string,
  ) {
    if (!mediaPermissions(session).canReview) throw forbidden('仅管理员可更新其他人的资料图片')
    if (['GOAL_GIF', 'EVENT_CLIP'].includes(purpose)) throw invalidMedia('此入口仅支持资料图片')
    const target = await this.requireTarget(tx, session.organizationId, purpose, targetId)
    const media = await validateMedia(dataUrl, purpose),
      id = randomUUID()
    await this.storage.store(session.organizationId, id, media)
    try {
      const pre = await this.aiModeration?.requiresPreReview(tx, session.organizationId, purpose)
      await tx.managedMediaAsset.create({
        data: {
          id,
          organizationId: session.organizationId,
          uploaderUserId: session.userId,
          clientSubmissionId: 'campus:' + id,
          purpose,
          targetId,
          targetLabel: target.label,
          checksum: media.checksum,
          mimeType: media.mimeType,
          bytes: media.body.length,
          width: media.width,
          height: media.height,
          frames: media.frames,
          durationMs: media.durationMs,
          status: 'APPROVED',
          visibility: pre ? 'HIDDEN' : 'ACTIVE',
        },
      })
      const rows = await tx.$queryRaw<
        MediaRow[]
      >`SELECT * FROM managed_media_assets WHERE id=${id}::uuid`
      if (!pre) await this.syncProfile(tx, rows[0]!)
      await this.audit(
        tx,
        session,
        rows[0]!,
        'MEDIA_SUBMITTED',
        requestId,
        pre ? '等待AI审核后公开' : '管理员上传资料图片',
      )
      await this.aiModeration?.enqueue(tx, session.organizationId, 'MEDIA', id)
      return { id, url: this.url(rows[0]!), publicationState: pre ? 'PENDING_REVIEW' : 'PUBLISHED' }
    } catch (error) {
      await this.storage.abort(session.organizationId, id)
      throw error
    }
  }

  abortProfile(organizationId: string, id: string) {
    return this.storage.abort(organizationId, id)
  }

  async queue(authorization?: string, before?: string) {
    const session = await this.requireActor(authorization)
    if (!mediaPermissions(session).canReview) throw forbidden('仅授权媒体审核者可查看审核队列')
    const boundary = cursor(before)
    const rows = await this.prisma.$queryRaw<
      MediaRow[]
    >`SELECT * FROM managed_media_assets WHERE organization_id=${session.organizationId}::uuid AND (created_at,id) < (${boundary.date},${boundary.id}::uuid) ORDER BY created_at DESC,id DESC LIMIT 51`
    const result = await this.listDto(rows, session)
    const reviews = this.aiModeration
      ? await this.prisma.aiModerationReview.findMany({
          where: {
            organizationId: session.organizationId,
            resourceType: 'MEDIA',
            targetId: { in: rows.map((row) => row.id) },
            status: { not: 'STALE' },
          },
          select: { id: true, targetId: true },
        })
      : []
    return {
      ...result,
      items: result.items.map((item) => ({
        ...item,
        aiReviewId: reviews.find((review) => review.targetId === item.id)?.id,
      })),
    }
  }

  async review(
    authorization: string | undefined,
    id: string,
    body: ReviewMediaDto,
    requestId: string,
  ) {
    const session = await this.requireActor(authorization)
    this.requireEnabled()
    if (!mediaPermissions(session).canReview) throw forbidden('仅授权媒体审核者可审核投稿')
    const reason = body.reason?.trim() ?? ''
    if (body.action === 'REJECT' && reason.length < 2)
      throw invalidMedia('请填写至少两个字的驳回原因')
    const row = await this.prisma.$transaction(async (tx) => {
      const previous = await this.row(tx, session.organizationId, id, true)
      if (previous.version !== body.expectedVersion) throw conflict('投稿已更新，请刷新后重试')
      if (previous.visibility === 'DELETED') throw conflict('请先恢复已删除投稿')
      if (body.action === 'APPROVE') {
        const target = await this.requireTarget(
          tx,
          session.organizationId,
          previous.purpose,
          previous.target_id,
          true,
        )
        if (target.signature !== previous.event_signature)
          throw conflict('进球事件已更正或撤销，请重新投稿')
      }
      const status = body.action === 'APPROVE' ? 'APPROVED' : 'REJECTED'
      const rows = await tx.$queryRaw<
        MediaRow[]
      >`UPDATE managed_media_assets SET status=${status},review_reason=${reason || null},reviewed_by_user_id=${session.userId}::uuid,reviewed_at=now(),version=version+1,updated_at=now() WHERE id=${previous.id}::uuid AND organization_id=${session.organizationId}::uuid RETURNING *`
      const next = rows[0]!
      await this.syncProfile(tx, next)
      if (this.aiModeration)
        await tx.aiModerationReview.updateMany({
          where: {
            organizationId: session.organizationId,
            resourceType: 'MEDIA',
            targetId: next.id,
            reviewedAt: null,
          },
          data: {
            status: 'DONE',
            needsHumanReview: false,
            reviewedAt: new Date(),
            reviewedByUserId: session.userId,
            leaseUntil: null,
          },
        })
      if (body.action === 'REJECT')
        await tx.userNotification.createMany({
          data: [
            {
              organizationId: session.organizationId,
              recipientUserId: next.uploader_user_id,
              actorUserId: session.userId,
              type: 'SYSTEM_MESSAGE',
              title: '资料图片审核通知',
              body: reason || '你上传的图片已暂停公开，请更换合适的图片。',
              linkPath: '/pages/me/index',
              deduplicationKey: 'media-review:' + next.id + ':' + next.version,
            },
          ],
          skipDuplicates: true,
        })
      await this.audit(tx, session, next, `MEDIA_${status}`, requestId, reason || '审核通过')
      return next
    })
    return this.toDto(row, session, await this.targetIsCurrent(this.prisma, row))
  }

  async visibility(
    authorization: string | undefined,
    id: string,
    body: MediaVisibilityDto,
    requestId: string,
  ) {
    const session = await this.requireActor(authorization)
    // Owners must be able to withdraw content even while uploading is disabled.
    const row = await this.prisma.$transaction(async (tx) => {
      const previous = await this.row(tx, session.organizationId, id, true)
      if (previous.uploader_user_id !== session.userId && !mediaPermissions(session).canReview)
        throw forbidden('只能管理本人投稿')
      if (previous.version !== body.expectedVersion) throw conflict('投稿已更新，请刷新后重试')
      if (
        body.action === 'RESTORE' &&
        previous.visibility_changed_by_user_id &&
        previous.visibility_changed_by_user_id !== session.userId &&
        !mediaPermissions(session).canReview
      )
        throw forbidden('审核者隐藏或删除的内容只能由审核者恢复')
      if (
        body.action === 'RESTORE' &&
        previous.status === 'APPROVED' &&
        !(await this.targetIsCurrent(tx, previous))
      )
        throw conflict('目标已更正或撤销，不能恢复公开展示')
      const visibility = { HIDE: 'HIDDEN', DELETE: 'DELETED', RESTORE: 'ACTIVE' }[body.action]
      const rows = await tx.$queryRaw<
        MediaRow[]
      >`UPDATE managed_media_assets SET visibility=${visibility},visibility_changed_by_user_id=${session.userId}::uuid,version=version+1,updated_at=now() WHERE id=${previous.id}::uuid AND organization_id=${session.organizationId}::uuid RETURNING *`
      const next = rows[0]!
      await this.syncProfile(tx, next)
      await this.audit(
        tx,
        session,
        next,
        `MEDIA_${body.action}`,
        requestId,
        body.reason?.trim() || '管理媒体可见性',
      )
      return next
    })
    return this.toDto(row, session, await this.targetIsCurrent(this.prisma, row))
  }

  async forMatch(authorization: string | undefined, matchId: string) {
    const session = await this.requireActor(authorization)
    if (!goalMediaEnabled()) return { items: [] }
    const match = await this.prisma.match.findFirst({
      where: {
        id: objectId(matchId),
        organizationId: session.organizationId,
        status: { notIn: ['DRAFT', 'CANCELLED'] },
        tournament: { status: 'PUBLISHED' },
      },
      select: { id: true },
    })
    if (!match) throw notFound()
    await this.requirePublishedGoalMatch(this.prisma, session.organizationId, match.id)
    const rows = await this.prisma.$queryRaw<
      MediaRow[]
    >`SELECT DISTINCT ON (target_id) * FROM managed_media_assets WHERE organization_id=${session.organizationId}::uuid AND match_id=${match.id}::uuid AND purpose IN ('GOAL_GIF','EVENT_CLIP') AND status='APPROVED' AND visibility='ACTIVE' ORDER BY target_id,created_at DESC,id DESC LIMIT 200`
    const events = await this.prisma.matchEvent.findMany({
      where: {
        organizationId: session.organizationId,
        matchId: match.id,
        id: { in: rows.map((row) => row.target_id) },
      },
    })
    const byId = new Map(events.map((event) => [event.id, event]))
    const items = rows
      .filter((row) => {
        const event = byId.get(row.target_id)
        if (!event || eventSignature(event) !== row.event_signature) return false
        return row.purpose === 'EVENT_CLIP' || ['GOAL', 'OWN_GOAL'].includes(event.type)
      })
      .map((row) => this.toDto(row))
    return { items }
  }

  async presentation(authorization: string | undefined, userId: string) {
    const session = await this.requireActor(authorization)
    if (!goalMediaEnabled()) return { backgroundUrl: null }
    const member = await this.prisma.organizationMembership.findFirst({
      where: {
        organizationId: session.organizationId,
        userId: objectId(userId),
        status: 'ACTIVE',
        user: { status: 'ACTIVE' },
      },
      select: { id: true, user: { select: { coverUrl: true } } },
    })
    if (!member) throw notFound()
    return {
      backgroundUrl: defaultCover('user', member.user.coverUrl),
    }
  }

  async content(authorization: string | undefined, id: string, poster: boolean) {
    this.requireEnabled()
    const session = authorization ? await this.requireActor(authorization) : undefined
    const rows = await this.prisma.$queryRaw<
      MediaRow[]
    >`SELECT * FROM managed_media_assets WHERE id=${objectId(id)}::uuid`
    const row = rows[0]
    if (!row || (session && row.organization_id !== session.organizationId)) throw notFound()
    const privileged =
      session && (session.userId === row.uploader_user_id || mediaPermissions(session).canReview)
    if (
      !privileged &&
      (row.status !== 'APPROVED' ||
        row.visibility !== 'ACTIVE' ||
        !(await this.targetIsCurrent(this.prisma, row)))
    )
      throw notFound()
    try {
      const body = await this.storage.read(row.organization_id, row.id, poster)
      return { body, mimeType: poster ? 'image/webp' : row.mime_type }
    } catch {
      throw notFound()
    }
  }

  private async requireTarget(
    tx: Database,
    organizationId: string,
    purpose: MediaPurpose,
    targetId: string,
    lock = false,
  ): Promise<{ matchId: string | null; signature: string | null; label: string }> {
    if (purpose === 'GOAL_GIF' || purpose === 'EVENT_CLIP') {
      const event = await tx.matchEvent.findFirst({
        where: {
          id: targetId,
          organizationId,
          ...(purpose === 'GOAL_GIF' ? { type: { in: ['GOAL', 'OWN_GOAL'] } } : {}),
          match: {
            organizationId,
            status: { notIn: ['DRAFT', 'CANCELLED'] },
            tournament: { status: 'PUBLISHED' },
          },
        },
        include: {
          match: { select: { title: true } },
          player: { select: { displayName: true } },
          team: { select: { name: true, shortName: true } },
        },
      })
      if (!event)
        throw notFound(
          purpose === 'GOAL_GIF' ? '已公开进球事件不存在或已撤销' : '比赛事件不存在或已撤销',
        )
      await this.requirePublishedGoalMatch(tx, organizationId, event.matchId)
      if (lock) {
        // Blocks concurrent report confirmation/deletion until the association is committed.
        await tx.$queryRaw`SELECT id FROM matches WHERE id=${event.matchId}::uuid AND organization_id=${organizationId}::uuid FOR SHARE`
        const current = await tx.matchEvent.findFirst({ where: { id: targetId, organizationId } })
        if (!current || eventSignature(current) !== eventSignature(event))
          throw conflict('比赛事件已更新，请刷新后重试')
      }
      return {
        matchId: event.matchId,
        signature: eventSignature(event),
        label:
          `${event.match.title} · ${event.minute}${event.stoppageMinute ? '+' + event.stoppageMinute : ''}′ · ${event.player?.displayName ?? event.team.shortName ?? event.team.name}`.slice(
            0,
            320,
          ),
      }
    }
    if (['PLAYER_PORTRAIT', 'PLAYER_AVATAR', 'PLAYER_BACKGROUND'].includes(purpose)) {
      const player = await tx.playerProfile.findFirst({
        where: { id: targetId, organizationId },
        select: { displayName: true },
      })
      if (!player) throw notFound('球员档案不存在')
      return { matchId: null, signature: null, label: player.displayName }
    } else if (purpose === 'TEAM_CREST' || purpose === 'TEAM_BACKGROUND') {
      const team = await tx.team.findFirst({
        where: { id: targetId, organizationId },
        select: { name: true },
      })
      if (!team) throw notFound('球队不存在')
      return { matchId: null, signature: null, label: team.name }
    } else {
      const member = await tx.organizationMembership.findFirst({
        where: { userId: targetId, organizationId, status: 'ACTIVE', user: { status: 'ACTIVE' } },
        select: { user: { select: { displayName: true } } },
      })
      if (!member) throw notFound('账户不存在')
      return { matchId: null, signature: null, label: member.user.displayName }
    }
  }

  private async targetIsCurrent(tx: Database, row: MediaRow) {
    try {
      const target = await this.requireTarget(tx, row.organization_id, row.purpose, row.target_id)
      return target.signature === row.event_signature && target.matchId === row.match_id
    } catch (error) {
      if (error instanceof ApiHttpException) return false
      throw error
    }
  }

  private async requirePublishedGoalMatch(tx: Database, organizationId: string, matchId: string) {
    const match = await tx.match.findFirst({
      where: { id: matchId, organizationId },
      include: { tournament: true },
    })
    if (!match) throw notFound()
    const legacyDemo =
      isDemoFixtureOrganization(organizationId) &&
      /^DEMO-GREEN-CUP-(2025|2026)$/.test(match.tournament.tournamentCode) &&
      (await tx.match.count({
        where: { organizationId, tournamentId: match.tournamentId, reportVersion: { gt: 0 } },
      })) === 0
    if (legacyDemo) return
    const official = await this.results.readTournamentResults(
      organizationId,
      match.tournamentId,
      tx,
    )
    if (
      !official.confirmedResults.some((fact) => fact.id === matchId && fact.status === 'CONFIRMED')
    )
      throw notFound('比赛事件尚未正式确认或已撤销')
  }

  private async syncProfile(tx: Database, row: MediaRow) {
    if (
      ![
        'USER_AVATAR',
        'USER_BACKGROUND',
        'PLAYER_PORTRAIT',
        'PLAYER_AVATAR',
        'PLAYER_BACKGROUND',
        'TEAM_CREST',
        'TEAM_BACKGROUND',
      ].includes(row.purpose)
    )
      return
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${row.organization_id + row.purpose + row.target_id}, 0))`
    const rows = await tx.$queryRaw<
      MediaRow[]
    >`SELECT * FROM managed_media_assets WHERE organization_id=${row.organization_id}::uuid AND target_id=${row.target_id}::uuid AND purpose=${row.purpose} AND status='APPROVED' AND visibility='ACTIVE' ORDER BY created_at DESC,id DESC LIMIT 1`
    const nextUrl = rows[0] ? this.url(rows[0]) : null
    if (row.purpose === 'TEAM_CREST' || row.purpose === 'TEAM_BACKGROUND') {
      const field = row.purpose === 'TEAM_CREST' ? 'crestUrl' : 'coverUrl'
      const team = await tx.team.findFirst({
        where: { id: row.target_id, organizationId: row.organization_id },
        select: { crestUrl: true, coverUrl: true },
      })
      // Falls back to the previous managed image, or clears a managed URL when none is left.
      if (team && (nextUrl || team[field]?.startsWith('/api/media-assets/')))
        await tx.team.update({
          where: { id: row.target_id },
          data: { [field]: nextUrl ?? (field === 'coverUrl' ? DEFAULT_COVERS.team : null) },
        })
    } else if (row.purpose === 'USER_AVATAR' || row.purpose === 'USER_BACKGROUND') {
      const field = row.purpose === 'USER_AVATAR' ? 'avatarUrl' : 'coverUrl'
      const user = await tx.user.findUnique({
        where: { id: row.target_id },
        select: { avatarUrl: true, coverUrl: true },
      })
      if (nextUrl || user?.[field]?.startsWith('/api/media-assets/')) {
        const replacement =
          nextUrl ??
          (field === 'coverUrl' ? DEFAULT_COVERS.user : defaultAvatar('user', row.target_id))
        await tx.user.update({
          where: { id: row.target_id },
          data: {
            [field]: replacement,
          },
        })
        if (field === 'avatarUrl')
          await syncLinkedPlayerAvatar(
            tx,
            row.organization_id,
            row.target_id,
            user?.avatarUrl ?? null,
            replacement,
          )
      }
    } else {
      const field =
        row.purpose === 'PLAYER_AVATAR'
          ? 'avatarUrl'
          : row.purpose === 'PLAYER_BACKGROUND'
            ? 'coverUrl'
            : 'portraitUrl'
      const player = await tx.playerProfile.findFirst({
        where: { id: row.target_id, organizationId: row.organization_id },
        select: { portraitUrl: true, avatarUrl: true, coverUrl: true },
      })
      if (nextUrl || player?.[field]?.startsWith('/api/media-assets/'))
        await tx.playerProfile.update({
          where: { id: row.target_id },
          data: {
            [field]:
              nextUrl ??
              (field === 'coverUrl'
                ? DEFAULT_COVERS.player
                : field === 'avatarUrl'
                  ? defaultAvatar('player', row.target_id)
                  : null),
          },
        })
    }
  }

  private async row(tx: Database, organizationId: string, id: string, lock = false) {
    const rows = lock
      ? await tx.$queryRaw<
          MediaRow[]
        >`SELECT * FROM managed_media_assets WHERE id=${objectId(id)}::uuid AND organization_id=${organizationId}::uuid FOR UPDATE`
      : await tx.$queryRaw<
          MediaRow[]
        >`SELECT * FROM managed_media_assets WHERE id=${objectId(id)}::uuid AND organization_id=${organizationId}::uuid`
    if (!rows[0]) throw notFound()
    return rows[0]
  }

  private async listDto(rows: MediaRow[], session: AuthenticatedSession) {
    const page = rows.slice(0, 50)
    return {
      items: await Promise.all(
        page.map(async (row) =>
          this.toDto(row, session, await this.targetIsCurrent(this.prisma, row)),
        ),
      ),
      nextCursor:
        rows.length > 50 ? `${page.at(-1)!.created_at.toISOString()}|${page.at(-1)!.id}` : null,
    }
  }

  private toDto(row: MediaRow, privateViewer?: AuthenticatedSession, current?: boolean) {
    return {
      id: row.id,
      purpose: row.purpose,
      targetId: row.target_id,
      targetLabel: row.target_label,
      matchId: row.match_id,
      contentUrl: this.url(row),
      posterUrl: this.url(row, true),
      mimeType: row.mime_type,
      bytes: row.bytes,
      width: row.width,
      height: row.height,
      frames: row.frames,
      durationMs: row.duration_ms,
      ...(privateViewer
        ? {
            uploaderUserId: row.uploader_user_id,
            status: row.status,
            visibility: row.visibility,
            reviewReason: row.review_reason,
            awaitingReview: row.status === 'APPROVED' && !row.reviewed_at,
            version: row.version,
            canRestore:
              (!row.visibility_changed_by_user_id ||
                row.visibility_changed_by_user_id === privateViewer.userId ||
                mediaPermissions(privateViewer).canReview) &&
              (row.status !== 'APPROVED' || current),
            associationState: current ? 'CURRENT' : 'REMOVED_OR_CHANGED',
          }
        : {}),
      createdAt: row.created_at.toISOString(),
    }
  }

  private url(row: MediaRow, poster = false) {
    return `/api/media-assets/${row.id}/${poster ? 'poster' : 'content'}`
  }
  private async requireActor(authorization: string | undefined): Promise<AuthenticatedSession> {
    const session = await this.auth.requireSession(authorization)
    const roles = await this.prisma.roleAssignment.findMany({
      where: {
        userId: session.userId,
        revokedAt: null,
        grantedAt: { lte: new Date() },
        OR: [
          { organizationId: session.organizationId, role: { not: 'PLATFORM_ADMIN' } },
          { organizationId: null, role: 'PLATFORM_ADMIN', scopeType: 'PLATFORM' },
        ],
      },
      select: { role: true, scopeType: true, scopeId: true },
    })
    return { ...session, user: { ...session.user, roles } }
  }
  private requireEnabled() {
    if (!goalMediaEnabled()) throw forbidden('功能暂未开放')
  }
  private async audit(
    tx: Database,
    session: AuthenticatedSession,
    row: MediaRow,
    action: string,
    requestId: string,
    reason: string,
  ) {
    await tx.auditLog.create({
      data: {
        organizationId: session.organizationId,
        actorType: mediaPermissions(session).canReview ? 'ADMIN' : 'USER',
        actorUserId: session.userId,
        actorRoleSnapshot: session.user.roles.map(({ role, scopeType, scopeId }) => ({
          role,
          scopeType,
          scopeId,
        })),
        action,
        targetType: 'ManagedMediaAsset',
        targetId: row.id,
        afterSummary: {
          purpose: row.purpose,
          targetId: row.target_id,
          status: row.status,
          visibility: row.visibility,
          version: row.version,
        },
        reason,
        requestId,
        source: 'API',
      },
    })
  }
}

export function eventSignature(event: MatchEvent) {
  return createHash('sha256')
    .update(
      JSON.stringify([
        event.id,
        event.organizationId,
        event.matchId,
        event.teamId,
        event.playerId,
        event.relatedPlayerId,
        event.type,
        event.minute,
        event.stoppageMinute,
        event.description,
        event.sortOrder,
        event.createdAt.toISOString(),
      ]),
    )
    .digest('hex')
}
function objectId(value: string) {
  if (!isUUID(value)) throw invalidMedia('对象标识必须为 UUID')
  return value.toLowerCase()
}
function cursor(value?: string) {
  const [timestamp, id = 'ffffffff-ffff-4fff-8fff-ffffffffffff'] = value?.split('|') ?? []
  const date = timestamp ? new Date(timestamp) : new Date('9999-01-01')
  if (!Number.isFinite(date.getTime())) throw invalidMedia('分页游标无效')
  return { date, id: objectId(id) }
}
function forbidden(message: string) {
  return new ApiHttpException(HttpStatus.FORBIDDEN, { code: ERROR_CODES.FORBIDDEN, message })
}
function notFound(message = '媒体不存在或不可见') {
  return new ApiHttpException(HttpStatus.NOT_FOUND, { code: ERROR_CODES.NOT_FOUND, message })
}
function conflict(message: string) {
  return new ApiHttpException(HttpStatus.CONFLICT, { code: ERROR_CODES.CONFLICT, message })
}
