import type { Prisma } from '../generated/prisma/client'

type Reader = Pick<Prisma.TransactionClient, 'auditLog' | 'teamMembership' | 'studentRecord'>
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value)
const uuid = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(value)
export interface FixedCaptainFact { teamId: string; playerId: string; matchId: string | null; auditId: string }

/** Signed team identity is independent of match starters, lineups and account roles. */
export async function fixedCaptainFacts(tx: Reader, organizationId: string, teamIds?: string[]): Promise<FixedCaptainFact[]> {
  const logs = await tx.auditLog.findMany({ where: {
    organizationId, action: 'TEAM_FIXED_CAPTAIN_CONFIRMED', actorType: 'ADMIN', source: 'OFFICIAL_MATCH_DOCUMENT', targetType: 'Team',
    ...(teamIds ? { targetId: { in: teamIds } } : {}),
  }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 4000,
    select: { id: true, targetId: true, afterSummary: true } })
  const latest = new Map<string, FixedCaptainFact>()
  for (const log of logs) {
    const data = log.afterSummary
    if (latest.has(log.targetId) || !record(data) || data.teamId !== log.targetId || !uuid(data.playerId)) continue
    latest.set(log.targetId, { teamId: log.targetId, playerId: data.playerId,
      matchId: uuid(data.sourceMatchId) ? data.sourceMatchId : null, auditId: log.id })
  }
  if (!latest.size) return []
  const memberships = await tx.teamMembership.findMany({ where: {
    organizationId, status: 'ACTIVE', OR: [...latest.values()].map(fact => ({ teamId: fact.teamId, playerProfileId: fact.playerId })),
    playerProfile: { organizationId },
  }, select: { teamId: true, playerProfileId: true } })
  return [...latest.values()].filter(fact => memberships.some(member => member.teamId === fact.teamId && member.playerProfileId === fact.playerId))
}

export const OFFICIAL_ROLES = ['REFEREE', 'ASSISTANT_REFEREE_1', 'ASSISTANT_REFEREE_2', 'FOURTH_OFFICIAL'] as const
export async function matchOfficials(tx: Reader, organizationId: string, matchId: string) {
  const log = await tx.auditLog.findFirst({ where: { organizationId, action: 'MATCH_OFFICIALS_RECORDED',
    targetType: 'Match', targetId: matchId, actorType: 'ADMIN', source: 'OFFICIAL_MATCH_DOCUMENT' },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], select: { afterSummary: true } })
  const data = log?.afterSummary
  if (!record(data) || data.matchId !== matchId || !Array.isArray(data.officials)) return []
  const rows = (data.officials as unknown[]).filter((item): item is Record<string, unknown> => record(item) && uuid(item.studentRecordId) &&
    OFFICIAL_ROLES.includes(item.role as typeof OFFICIAL_ROLES[number]))
  if (!rows.length) return []
  const students = await tx.studentRecord.findMany({ where: { organizationId, status: 'ACTIVE',
    id: { in: rows.map(row => row.studentRecordId as string) } }, select: { id: true, realName: true, player: { select: { id: true } } } })
  return rows.flatMap(row => {
    const student = students.find(item => item.id === row.studentRecordId)
    return student ? [{ role: row.role as typeof OFFICIAL_ROLES[number], displayName: student.realName,
      playerId: student.player?.id ?? null }] : []
  })
}
