import type { MatchClockDto } from './match-clock.dto'
import type { AuthenticatedSession } from '../auth/auth.service'

export const AUTO_START_GRACE_MS = 10 * 60000
export const AUTO_START_OFFSET_MS = 5 * 60000
export type ClockMatch = {
  id: string
  organizationId: string
  tournamentId: string
  status: string
  scheduledStartAt: Date | null
  actualStartedAt: Date | null
  actualEndedAt: Date | null
}
export function clockAdministrator(
  session: AuthenticatedSession | null | undefined,
  match: ClockMatch,
) {
  return (
    session?.organizationId === match.organizationId &&
    session.user.roles.some(
      (role) =>
        (role.role === 'PLATFORM_ADMIN' && role.scopeType === 'PLATFORM') ||
        (role.role === 'ORGANIZATION_ADMIN' &&
          role.scopeType === 'ORGANIZATION' &&
          role.scopeId.toLowerCase() === match.organizationId) ||
        (role.role === 'TOURNAMENT_ADMIN' &&
          role.scopeType === 'TOURNAMENT' &&
          role.scopeId.toLowerCase() === match.tournamentId),
    )
  )
}
export function clockStartPermission(
  session: AuthenticatedSession | null | undefined,
  match: ClockMatch,
  now: number,
) {
  if (
    !session ||
    session.organizationId !== match.organizationId ||
    !['SCHEDULED', 'LIVE'].includes(match.status)
  )
    return false
  if (clockAdministrator(session, match)) return true
  return (
    !!match.scheduledStartAt &&
    now >= match.scheduledStartAt.getTime() - 30 * 60000 &&
    session.user.roles.some(
      (role) =>
        role.role === 'MATCH_REPORTER' &&
        ((role.scopeType === 'MATCH' && role.scopeId.toLowerCase() === match.id) ||
          (role.scopeType === 'TOURNAMENT' && role.scopeId.toLowerCase() === match.tournamentId)),
    )
  )
}
export function matchClockView(
  match: ClockMatch,
  rules: unknown,
  now = Date.now(),
  permitted = false,
): MatchClockDto {
  const config = (
    rules as {
      match?: { periods?: number; periodMinutes?: number; intervalMinutes?: number }
    } | null
  )?.match
  const periodMinutes = config?.periodMinutes ?? 45,
    periods = config?.periods ?? 2,
    intervalMinutes = config?.intervalMinutes ?? (periodMinutes <= 20 ? 10 : 20)
  const planned = match.scheduledStartAt?.getTime() ?? null
  const autoStartsAt = planned === null ? null : planned + AUTO_START_GRACE_MS
  const started =
    match.actualStartedAt?.getTime() ??
    (autoStartsAt !== null && now >= autoStartsAt ? planned! + AUTO_START_OFFSET_MS : null)
  const startSource = match.actualStartedAt ? 'MANUAL' : started !== null ? 'AUTO' : 'PENDING'
  const basis = started ?? (planned === null ? null : planned + AUTO_START_OFFSET_MS)
  const period = periodMinutes * 60000,
    interval = intervalMinutes * 60000
  const end = basis === null ? null : basis + periods * period + Math.max(0, periods - 1) * interval
  const firstEnd = periods > 1 && basis !== null ? basis + period : null
  const secondStart = firstEnd === null ? null : firstEnd + interval
  const unavailable = ['DRAFT', 'POSTPONED', 'CANCELLED'].includes(match.status)
  const ended =
    match.actualEndedAt?.getTime() ??
    (end !== null && (now >= end || match.status === 'FINISHED') ? end : null)
  let phase: MatchClockDto['phase'] = unavailable
    ? 'UNAVAILABLE'
    : ended !== null
      ? 'FINISHED'
      : started === null
        ? 'PENDING'
        : 'FIRST_HALF'
  let playing = 0,
    phaseElapsed = 0
  if (started !== null) {
    let remaining = Math.max(0, Math.min(now, ended ?? now) - started)
    for (let index = 0; index < periods; index++) {
      const used = Math.min(period, remaining)
      playing += used
      phaseElapsed = used
      if (remaining < period) {
        if (phase !== 'UNAVAILABLE' && phase !== 'FINISHED')
          phase = index === 0 ? 'FIRST_HALF' : 'SECOND_HALF'
        break
      }
      remaining -= period
      if (index < periods - 1) {
        if (remaining < interval) {
          phaseElapsed = remaining
          if (phase !== 'UNAVAILABLE' && phase !== 'FINISHED') phase = 'HALF_TIME'
          break
        }
        remaining -= interval
      }
    }
  }
  const iso = (value: number | null) => (value === null ? null : new Date(value).toISOString())
  return {
    serverNow: new Date(now).toISOString(),
    scheduledStartAt: iso(planned),
    autoStartsAt: iso(autoStartsAt),
    startedAt: iso(started),
    startSource,
    phase,
    periodMinutes,
    intervalMinutes,
    periods,
    elapsedSeconds: Math.floor(playing / 1000),
    phaseElapsedSeconds: Math.floor(phaseElapsed / 1000),
    expectedEndAt: iso(end),
    halfTimeStartsAt: iso(firstEnd),
    secondHalfStartsAt: iso(secondStart),
    endedAt: iso(ended),
    canStart: permitted && phase === 'PENDING' && !unavailable,
  }
}
