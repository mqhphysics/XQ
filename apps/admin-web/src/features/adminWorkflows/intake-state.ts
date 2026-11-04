export function intakeState(
  match: {
    status: string
    scheduledStartAt: string | null
    confirmedReportVersion?: number | null
    tournamentName?: string
    recorded?: boolean
  },
  now = Date.now(),
) {
  if (match.recorded || (match.confirmedReportVersion ?? 0) > 0 || match.status === 'CONFIRMED')
    return { kind: 'complete', label: '已录入' } as const
  if (match.status === 'POSTPONED' || !match.scheduledStartAt)
    return {
      kind: 'upcoming',
      label: match.status === 'POSTPONED' ? '已延期' : '时间待定',
    } as const
  // Scheduled windows include the half-time interval; no result is inferred from this hint.
  const minutes = /女足/.test(match.tournamentName ?? '') ? 50 : 80
  if (Date.parse(match.scheduledStartAt) + minutes * 60000 < now)
    return { kind: 'due', label: '待补录' } as const
  return { kind: 'upcoming', label: match.status === 'LIVE' ? '进行中' : '未到录入时间' } as const
}
