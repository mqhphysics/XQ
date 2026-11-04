export function swipeDestination(
  anchor: number,
  position: number,
  velocity: number,
  width: number,
  min: number,
  max: number,
) {
  const delta = position - anchor
  const flick = Math.abs(velocity) > 0.35 && Math.abs(delta) > 0.035
  const projected = delta + (velocity * 120) / Math.max(1, width)
  const direction = flick
    ? Math.sign(velocity)
    : Math.abs(projected) >= 0.24
      ? Math.sign(projected)
      : 0
  return Math.max(min, Math.min(max, anchor + direction))
}

/** Start timing when the view receives its target, not before React has rendered. */
export function createSettlingMotion(
  draw: (position: number, duration: number, immediate?: boolean) => void,
  nextFrame: (callback: () => void) => void,
  now = Date.now,
) {
  let motion = { from: -1, to: -1, at: 0, duration: 0 },
    generation = 0
  const position = () => {
    const t = motion.duration ? Math.max(0, Math.min(1, (now() - motion.at) / motion.duration)) : 1
    return motion.from + (motion.to - motion.from) * (1 - (1 - t) ** 3)
  }
  const drag = (value: number) => {
    generation++
    motion = { from: value, to: value, at: now(), duration: 0 }
    draw(value, 0)
  }
  return {
    position,
    drag,
    cancel: () => {
      generation++
    },
    animate: (to: number) => {
      const from = position(),
        ticket = ++generation,
        distance = Math.abs(to - from)
      motion = { from, to: from, at: now(), duration: 0 }
      draw(from, 0, true)
      nextFrame(() => {
        if (ticket !== generation) return
        const duration = distance < 0.001 ? 0 : Math.max(180, Math.min(320, 160 + distance * 140))
        motion = { from, to, at: now(), duration }
        draw(to, duration, true)
      })
    },
  }
}
