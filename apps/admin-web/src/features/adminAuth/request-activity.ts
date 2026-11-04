let active = 0
const subscribers = new Set<() => void>()
export const requestActivity = {
  snapshot: () => active,
  subscribe: (listener: () => void) => {
    subscribers.add(listener)
    return () => {
      subscribers.delete(listener)
    }
  },
}
export function beginAdminRequest() {
  active++
  for (const listener of subscribers) listener()
  return () => {
    active = Math.max(0, active - 1)
    for (const listener of subscribers) listener()
  }
}
