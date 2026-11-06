/** Public schedule scores describe published reports, independently of the match clock. */
export function matchRecording(match: {
  confirmedReportVersion?: number | null
  homeScore?: number | null
  awayScore?: number | null
}) {
  const confirmedReportVersion = match.confirmedReportVersion ?? null
  const score = (value: number | null | undefined) =>
    typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : null
  const homeScore = confirmedReportVersion !== null ? score(match.homeScore) : null
  const awayScore = confirmedReportVersion !== null ? score(match.awayScore) : null
  return {
    recorded: homeScore !== null && awayScore !== null,
    confirmedReportVersion,
    homeScore,
    awayScore,
  }
}
