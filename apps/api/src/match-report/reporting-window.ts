const MINUTE = 60000
const DAY = 86400000
const UTC8 = 8 * 60 * MINUTE

/** Competition-local day and the scheduled playing window, including half-time. */
export function reportingWindow(start: Date | null, rules: unknown, now = Date.now()) {
  if (!start) return null
  const match = (
    rules as {
      match?: { periods?: number; periodMinutes?: number; intervalMinutes?: number }
    } | null
  )?.match
  const period = match?.periodMinutes ?? 45
  const periods = match?.periods ?? 2
  const interval = match?.intervalMinutes ?? (period <= 20 ? 10 : 20)
  const estimatedEndAt = start.getTime() + (periods * period + (periods - 1) * interval) * MINUTE
  const finalizableAt = estimatedEndAt + 30 * MINUTE
  const dayEndsAt = Math.floor((start.getTime() + UTC8) / DAY) * DAY + DAY - UTC8
  return {
    estimatedEndAt,
    finalizableAt,
    dayEndsAt,
    started: now >= start.getTime(),
    expired: now >= dayEndsAt,
    finalSave: now >= finalizableAt,
  }
}
