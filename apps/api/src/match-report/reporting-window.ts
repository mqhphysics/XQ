import { AUTO_START_OFFSET_MS } from '../schedule/match-clock.logic'
const MINUTE = 60000

/** Entry windows use the match clock, never the calendar day or a mutable updatedAt value. */
export function reportingWindow(
  start: Date | null,
  rules: unknown,
  now = Date.now(),
  actualEndedAt: Date | null = null,
  status?: string,
  actualStartedAt: Date | null = null,
) {
  if (!start && !actualStartedAt) return null
  const match = (
    rules as {
      match?: { periods?: number; periodMinutes?: number; intervalMinutes?: number }
    } | null
  )?.match
  const period = match?.periodMinutes ?? 45
  const periods = match?.periods ?? 2
  const interval = match?.intervalMinutes ?? (period <= 20 ? 10 : 20)
  const startedAt = actualStartedAt ?? new Date(start!.getTime() + AUTO_START_OFFSET_MS)
  const estimatedEndAt =
    startedAt.getTime() + (periods * period + (periods - 1) * interval) * MINUTE
  const finalizableAt = estimatedEndAt + 30 * MINUTE
  const opensAt = (start ?? actualStartedAt)!.getTime() - 30 * MINUTE
  const endedAt = actualEndedAt?.getTime() ?? estimatedEndAt
  const technicalClosesAt = endedAt + 30 * MINUTE
  return {
    opensAt,
    estimatedEndAt,
    finalizableAt,
    endedAt,
    endedAtSource: actualEndedAt ? ('ACTUAL' as const) : ('ESTIMATED' as const),
    technicalClosesAt,
    opened: now >= opensAt,
    technicalOpen:
      now >= opensAt &&
      now < technicalClosesAt &&
      !['DRAFT', 'CANCELLED', 'POSTPONED'].includes(status || ''),
    started: now >= startedAt.getTime(),
  }
}
