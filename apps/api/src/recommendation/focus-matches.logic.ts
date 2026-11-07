export type FocusCandidate = {
  id: string
  status: string
  statusReason?: string | null
  scheduledStartAt: string | null
  homeTeam: { id: string; collegeName: string | null } | null
  awayTeam: { id: string; collegeName: string | null } | null
  focusGender: string
}
export type FocusPreferences = {
  primaryTeams: string[]
  followedTeams: string[]
  college: string
  gender: string
  history: Array<{ teamIds: string[]; gender: string; count: number; viewedAt: Date }>
}
export const emptyFocusPreferences = (): FocusPreferences => ({
  primaryTeams: [],
  followedTeams: [],
  college: '',
  gender: '',
  history: [],
})
export function focusGender(value: string) {
  if (['MALE', 'MEN', '男'].includes(value)) return 'MEN'
  if (['FEMALE', 'WOMEN', '女'].includes(value)) return 'WOMEN'
  return ''
}

/** Explicit affiliations lead; repeated recent reading can outweigh the gender default.
 * Recency prevents old results or distant fixtures displacing the current matchday. */
export function rankFocusMatches<T extends FocusCandidate>(
  candidates: T[],
  preferences: FocusPreferences,
  now = Date.now(),
): T[] {
  const day = 86400000
  const items = candidates.filter(
    (item) =>
      ['SCHEDULED', 'LIVE', 'FINISHED'].includes(item.status) &&
      !item.statusReason?.startsWith('组委会裁定'),
  )
  const timestamp = (item: T) => (item.scheduledStartAt ? Date.parse(item.scheduledStartAt) : NaN)
  const current = items.filter(
    (item) =>
      item.status === 'LIVE' ||
      (item.status === 'SCHEDULED' &&
        timestamp(item) >= now - day &&
        timestamp(item) <= now + 7 * day) ||
      (item.status === 'FINISHED' && timestamp(item) >= now - 3 * day && timestamp(item) <= now),
  )
  // Between seasons, retain the newest results / nearest scheduled round rather than a blank card.
  const pool = current.length >= 2 ? current : items
  const currentIds = new Set(current.map((item) => item.id))
  const teamInterest = new Map<string, number>(),
    genderInterest = new Map<string, number>()
  for (const entry of preferences.history) {
    const age = (now - entry.viewedAt.getTime()) / day
    if (age < 0 || age > 30) continue
    const weight = Math.min(8, entry.count) * Math.pow(0.5, age / 10)
    for (const id of entry.teamIds) teamInterest.set(id, (teamInterest.get(id) || 0) + weight)
    const gender = focusGender(entry.gender)
    if (gender) genderInterest.set(gender, (genderInterest.get(gender) || 0) + weight)
  }
  const score = (item: T) => {
    const teams = [item.homeTeam, item.awayTeam].filter((t) => t !== null)
    const gender = focusGender(item.focusGender)
    const hours = (timestamp(item) - now) / 3600000
    let points =
      item.status === 'LIVE'
        ? 150
        : !Number.isFinite(hours)
          ? -100
          : item.status === 'SCHEDULED'
            ? 100 - Math.abs(hours) * 0.6
            : 65 - Math.abs(hours) * 0.8
    if (currentIds.has(item.id)) points += 200
    if (teams.some((t) => preferences.primaryTeams.includes(t.id))) points += 110
    if (teams.some((t) => preferences.followedTeams.includes(t.id))) points += 45
    if (preferences.college && teams.some((t) => t.collegeName?.trim() === preferences.college))
      points += 65
    points += Math.min(85, Math.max(0, ...teams.map((t) => teamInterest.get(t.id) || 0)) * 9)
    points += Math.min(55, (genderInterest.get(gender) || 0) * 7)
    if (gender && gender === focusGender(preferences.gender)) points += 12
    return points
  }
  return [...pool].sort(
    (a, b) =>
      score(b) - score(a) ||
      Math.abs(timestamp(a) - now) - Math.abs(timestamp(b) - now) ||
      a.id.localeCompare(b.id),
  )
}
