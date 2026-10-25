export type NativeSection = 'home' | 'schedule' | 'team' | 'data' | 'me'
export const nativeSections: NativeSection[] = ['home', 'schedule', 'team', 'data', 'me']
export const nativeTabPaths: Record<NativeSection, string> = {
  home: '/pages/index/index',
  schedule: '/pages/readonly-schedule/index',
  team: '/pages/my-team/index',
  data: '/pages/data-center/index',
  me: '/pages/me/index',
}
export function swipeDirection(
  start: { x: number; y: number; at: number },
  end: { x: number; y: number; at: number },
): -1 | 0 | 1 {
  const dx = end.x - start.x,
    dy = end.y - start.y
  return end.at - start.at > 1000 || Math.abs(dx) < 56 || Math.abs(dx) < Math.abs(dy) * 1.6
    ? 0
    : dx < 0
      ? 1
      : -1
}
export interface DetailEntry {
  id: number
  url: string
  scroll: number
  state: Record<string, unknown>
}
export interface DetailHistory {
  entries: DetailEntry[]
  cursor: number
}
export function appendDetail(history: DetailHistory, entry: DetailEntry): DetailHistory {
  return {
    entries: [...history.entries.slice(0, history.cursor + 1), entry],
    cursor: history.cursor + 1,
  }
}
export function moveDetail(history: DetailHistory, direction: -1 | 1): DetailHistory {
  const cursor = history.cursor + direction
  return cursor >= -1 && cursor < history.entries.length ? { ...history, cursor } : history
}
export interface IndicatorMotion {
  from: number
  to: number
  at: number
  duration: number
}
export function indicatorPosition(motion: IndicatorMotion, at: number) {
  const progress = motion.duration
    ? Math.max(0, Math.min(1, (at - motion.at) / motion.duration))
    : 1
  return motion.from + (motion.to - motion.from) * (1 - (1 - progress) ** 3)
}
export function nextIndicatorMotion(
  previous: IndicatorMotion,
  to: number,
  at: number,
): IndicatorMotion {
  return { from: indicatorPosition(previous, at), to, at, duration: 240 }
}
