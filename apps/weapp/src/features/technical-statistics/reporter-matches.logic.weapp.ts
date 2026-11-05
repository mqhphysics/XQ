export type ReporterMatchState = {
  status: string
  scheduledStartAt: string | null
  homeScore: number | null
  awayScore: number | null
  recordingComplete?: boolean
}
export function reporterMatchKind(match: ReporterMatchState) {
  if (match.status === 'LIVE') return 'live'
  if (['FINISHED', 'CONFIRMED'].includes(match.status))
    return match.homeScore !== null && match.awayScore !== null && match.recordingComplete === true
      ? 'recorded'
      : 'pending'
  if (['SCHEDULED', 'CHECK_IN', 'POSTPONED'].includes(match.status)) return 'upcoming'
  return 'inactive'
}
export function reporterMatchLabel(match: ReporterMatchState) {
  return {
    live: '进行中',
    pending: '已结束 · 待录入',
    upcoming: match.status === 'POSTPONED' ? '已延期' : '未开始',
    recorded: '已录入',
    inactive: '已取消',
  }[reporterMatchKind(match)]
}
export function sortReporterMatches<T extends ReporterMatchState>(matches: T[]) {
  const rank = { live: 0, pending: 1, upcoming: 2, recorded: 3, inactive: 4 }
  return [...matches].sort((a, b) => {
    const type = reporterMatchKind(a),
      other = reporterMatchKind(b),
      group = rank[type] - rank[other]
    if (group) return group
    if (!a.scheduledStartAt) return b.scheduledStartAt ? 1 : 0
    if (!b.scheduledStartAt) return -1
    return (
      (Date.parse(a.scheduledStartAt) - Date.parse(b.scheduledStartAt)) *
      (type === 'pending' || type === 'recorded' ? -1 : 1)
    )
  })
}
