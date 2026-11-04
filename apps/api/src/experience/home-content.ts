type HomePost = { type: string; tags: Array<{ key: string }> }
export function competitionAnnouncementKey(code: string, seasonCode: string) {
  return `competition-announcement:${code.split('-')[0]!.replace(/_(?:MEN|WOMEN)$/, '')}:${seasonCode}`
}
export function isMatchBulletin(post: HomePost) {
  return post.type === 'OFFICIAL' && post.tags.some((tag) => tag.key.startsWith('match-report:'))
}
export function homeContent<T extends HomePost>(posts: T[]) {
  return {
    announcements: posts
      .filter((post) => post.type === 'OFFICIAL' && !isMatchBulletin(post))
      .slice(0, 3),
    feed: posts.filter((post) => post.type === 'COMMUNITY' || isMatchBulletin(post)),
  }
}

export function featuredHomeMatches<
  T extends {
    id: string
    status: string
    scheduledStartAt: Date | null
    statusReason?: string | null
  },
>(matches: T[], now = new Date()) {
  matches = matches.filter((m) => !m.statusReason?.startsWith('组委会裁定'))
  const day = (date: Date) => date.toLocaleDateString('en-CA', { timeZone: 'Asia/Shanghai' })
  const today = day(now)
  const live = matches.filter((m) => m.status === 'LIVE')
  const current = matches
    .filter((m) => m.scheduledStartAt && day(m.scheduledStartAt) === today)
    .sort((a, b) => Number(b.status === 'FINISHED') - Number(a.status === 'FINISHED'))
  const upcoming = matches.filter((m) => m.status === 'SCHEDULED')
  const finished = matches
    .filter((m) => m.status === 'FINISHED')
    .sort((a, b) => (b.scheduledStartAt?.getTime() ?? 0) - (a.scheduledStartAt?.getTime() ?? 0))
  return [
    ...new Map([...live, ...current, ...upcoming, ...finished].map((m) => [m.id, m])).values(),
  ].slice(0, 5)
}

export function periodMinutes(document: unknown) {
  const value = (document as { match?: { periodMinutes?: unknown } } | null)?.match?.periodMinutes
  return Number.isInteger(value) && Number(value) > 0 && Number(value) <= 60 ? Number(value) : 45
}
