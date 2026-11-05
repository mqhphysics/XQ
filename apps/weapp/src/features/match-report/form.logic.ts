import type { ReportFields, ReportEvent } from './repository.weapp'
export const creditedSide = (e: ReportEvent) =>
  e.kind === 'OWN_GOAL' ? (e.side === 'HOME' ? 'AWAY' : 'HOME') : e.side
export function resizeGoals(
  fields: ReportFields,
  side: 'HOME' | 'AWAY',
  value: string,
  id: () => string,
): ReportFields {
  const next = {
    ...fields,
    [side === 'HOME' ? 'homeScore' : 'awayScore']: value,
    events: [...fields.events],
  }
  if (!/^\d{1,2}$/.test(value)) return next
  const rows = next.events.filter(
    (e) => (e.kind === 'GOAL' || e.kind === 'OWN_GOAL') && creditedSide(e) === side,
  )
  const remove = new Set(rows.slice(Number(value)).map((e) => e.clientEventId))
  next.events = next.events.filter((e) => !remove.has(e.clientEventId))
  for (let i = rows.length; i < Number(value); i++)
    next.events.push({
      clientEventId: id(),
      kind: 'GOAL',
      side,
      minute: '',
      addedMinute: '',
      playerId: '',
      relatedPlayerId: '',
    })
  return next
}
