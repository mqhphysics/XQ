/** Soft springs from the interaction notes: drag stiffness 300 / damping 25, settle 400 / 30. */

export const SPRING = {
  liftMs: 150,
  drag: { stiffness: 300, damping: 25 },
  settle: { stiffness: 400, damping: 30 },
} as const

export function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

export function stepSpring(
  value: number,
  velocity: number,
  target: number,
  dt: number,
  stiffness: number,
  damping: number,
): { value: number; velocity: number } {
  const omega = Math.sqrt(stiffness)
  const zeta = damping / (2 * omega)
  const offset = value - target
  if (zeta < 1) {
    const alpha = zeta * omega
    const wd = omega * Math.sqrt(1 - zeta * zeta)
    const envelope = Math.exp(-alpha * dt)
    const cos = Math.cos(wd * dt)
    const sin = Math.sin(wd * dt)
    const amplitude = offset
    const blend = (velocity + alpha * offset) / wd
    const nextOffset = envelope * (amplitude * cos + blend * sin)
    const nextVelocity =
      -alpha * nextOffset + envelope * (-amplitude * wd * sin + blend * wd * cos)
    return { value: target + nextOffset, velocity: nextVelocity }
  }
  let nextValue = value
  let nextVelocity = velocity
  const step = dt / 4
  for (let index = 0; index < 4; index += 1) {
    const accel = -stiffness * (nextValue - target) - damping * nextVelocity
    nextVelocity += accel * step
    nextValue += nextVelocity * step
  }
  return { value: nextValue, velocity: nextVelocity }
}

export function springSettled(value: number, velocity: number, target: number): boolean {
  return Math.abs(value - target) < 0.4 && Math.abs(velocity) < 0.4
}

export type ItemBox = { id: string; top: number; height: number }

/** Drop index from the dragged item's center, compared with each other item's midpoint. */
export function reorderTargetIndex(boxes: ItemBox[], from: number, centerY: number): number {
  const origin = boxes[from]
  if (!origin || from < 0 || from >= boxes.length) return Math.max(0, from)
  let target = from
  if (centerY >= origin.top + origin.height / 2) {
    for (let index = from + 1; index < boxes.length; index += 1) {
      const box = boxes[index]
      if (!box) break
      const mid = box.top + box.height / 2
      if (centerY > mid) target = index
      else break
    }
  } else {
    for (let index = from - 1; index >= 0; index -= 1) {
      const box = boxes[index]
      if (!box) break
      const mid = box.top + box.height / 2
      if (centerY < mid) target = index
      else break
    }
  }
  return target
}

/**
 * Height plus the gap that collapses with the dragged row.
 * Uses the following gap when one exists, otherwise the gap above a last row.
 */
export function occupiedStride(boxes: ItemBox[], from: number): number {
  const box = boxes[from]
  if (!box) return 0
  const next = boxes[from + 1]
  if (next) return next.top - box.top
  const prev = boxes[from - 1]
  if (prev) return box.height + Math.max(0, box.top - (prev.top + prev.height))
  return box.height
}

/** How far a non-dragged row must travel while `from` is moving to `to`. */
export function itemShift(index: number, from: number, to: number, boxes: ItemBox[]): number {
  if (index === from || from === to || from < 0 || to < 0) return 0
  const stride = occupiedStride(boxes, from)
  if (from < to && index > from && index <= to) return -stride
  if (to < from && index >= to && index < from) return stride
  return 0
}

/** Translate that lands the dragged row in its new slot while the DOM order is unchanged. */
export function draggedSlotOffset(boxes: ItemBox[], from: number, to: number): number {
  const origin = boxes[from]
  const slot = boxes[to]
  if (!origin || !slot || from === to) return 0
  if (to > from) return slot.top + slot.height - (origin.top + origin.height)
  return slot.top - origin.top
}

export function moveItem<T>(items: readonly T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= items.length || to >= items.length) {
    return items.slice()
  }
  const next = items.slice()
  const [item] = next.splice(from, 1)
  next.splice(to, 0, item!)
  return next
}
