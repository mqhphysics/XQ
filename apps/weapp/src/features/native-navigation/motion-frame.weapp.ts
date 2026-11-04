type Clock = { now: () => number; schedule: (run: () => void, delay: number) => () => void }
const clock: Clock = {
  now: Date.now,
  schedule: (run, delay) => {
    const timer = setTimeout(run, delay)
    return () => clearTimeout(timer)
  },
}
/** Keep all motion in refs, sending only the latest position once per display frame. */
export function createMotionFrame<T>(write: (value: T) => void, timing: Clock = clock) {
  let last = -Infinity,
    queued: T | undefined,
    hasQueued = false,
    cancel: (() => void) | undefined
  const paint = () => {
    cancel = undefined
    if (!hasQueued) return
    const value = queued!
    hasQueued = false
    queued = undefined
    last = timing.now()
    write(value)
  }
  return {
    push(value: T, immediate = false) {
      queued = value
      hasQueued = true
      const elapsed = timing.now() - last
      if (immediate || elapsed >= 16) {
        cancel?.()
        paint()
      } else if (!cancel) cancel = timing.schedule(paint, 16 - elapsed)
    },
    clear() {
      cancel?.()
      cancel = undefined
      hasQueued = false
      queued = undefined
    },
  }
}
