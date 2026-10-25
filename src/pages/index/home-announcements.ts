export interface AnnouncementSlideSource {
  id: string
  title: string | null
  body: string
  imageUrl: string | null
}

/** Hero slides are tournament announcements. Prefer posts that have their own image. */
export function tournamentHeroSlides<T extends AnnouncementSlideSource>(
  announcements: readonly T[],
): T[] {
  const imaged = announcements.filter((item) => Boolean(item.imageUrl))
  return (imaged.length > 0 ? imaged : [...announcements]).slice(0, 3)
}
