import type { MatchClockDto } from '../../../../../packages/api-client/src/generated'
export type MatchClockSnapshot = MatchClockDto
export type MatchClockPhase = MatchClockDto['phase']
const timestamp = (value: string | null) => (value ? Date.parse(value) : NaN)
export function projectMatchClock(clock: MatchClockSnapshot, elapsedSinceRead: number) {
  if (
    clock.phase === 'PENDING' ||
    clock.phase === 'UNAVAILABLE' ||
    clock.phase === 'FINISHED' ||
    clock.endedAt ||
    !clock.startedAt
  )
    return {
      phase: clock.phase,
      elapsedSeconds: clock.elapsedSeconds,
      phaseElapsedSeconds: clock.phaseElapsedSeconds,
    }
  const now = timestamp(clock.serverNow) + Math.max(0, elapsedSinceRead),
    start = timestamp(clock.startedAt)
  if (!Number.isFinite(now) || !Number.isFinite(start))
    return {
      phase: clock.phase,
      elapsedSeconds: clock.elapsedSeconds,
      phaseElapsedSeconds: clock.phaseElapsedSeconds,
    }
  const end = timestamp(clock.expectedEndAt)
  const period = Math.max(0, clock.periodMinutes * 60)
  if (Number.isFinite(end) && now >= end)
    return {
      phase: 'FINISHED' as const,
      elapsedSeconds: period * clock.periods,
      phaseElapsedSeconds: period,
    }
  let remaining = Math.max(0, Math.floor((now - start) / 1000)),
    playing = 0
  const interval = Math.max(0, clock.intervalMinutes * 60)
  for (let index = 0; index < clock.periods; index++) {
    const used = Math.min(period, remaining)
    playing += used
    if (remaining < period)
      return {
        phase: index === 0 ? ('FIRST_HALF' as const) : ('SECOND_HALF' as const),
        elapsedSeconds: playing,
        phaseElapsedSeconds: used,
      }
    remaining -= period
    if (index < clock.periods - 1) {
      if (remaining < interval)
        return {
          phase: 'HALF_TIME' as const,
          elapsedSeconds: playing,
          phaseElapsedSeconds: remaining,
        }
      remaining -= interval
    }
  }
  return { phase: 'FINISHED' as const, elapsedSeconds: playing, phaseElapsedSeconds: period }
}
export function clockDigits(seconds: number) {
  const safe = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0
  return `${String(Math.floor(safe / 60)).padStart(2, '0')}:${String(safe % 60).padStart(2, '0')}`
}
