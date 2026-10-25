export interface TouchParticle {
  x: number
  y: number
  vx: number
  vy: number
}

export function canvasTouchPosition(
  point: { x?: number; y?: number; clientX?: number; clientY?: number },
  bounds: { left: number; top: number },
): [number, number] | null {
  const x = point.x ?? (point.clientX === undefined ? NaN : point.clientX - bounds.left)
  const y = point.y ?? (point.clientY === undefined ? NaN : point.clientY - bounds.top)
  return Number.isFinite(x) && Number.isFinite(y) ? [x, y] : null
}

/** The same critically damped return used by the existing desktop artwork. */
export function advanceTouchParticle(
  point: TouchParticle,
  targetX: number,
  targetY: number,
  dt: number,
): void {
  const omega = 18
  const decay = Math.exp(-omega * dt)
  const errorX = point.x - targetX
  const errorY = point.y - targetY
  const auxiliaryX = point.vx + omega * errorX
  const auxiliaryY = point.vy + omega * errorY
  point.x = targetX + (errorX + auxiliaryX * dt) * decay
  point.y = targetY + (errorY + auxiliaryY * dt) * decay
  point.vx = (point.vx - omega * auxiliaryX * dt) * decay
  point.vy = (point.vy - omega * auxiliaryY * dt) * decay
  if (
    Math.abs(point.x - targetX) < 0.025 &&
    Math.abs(point.y - targetY) < 0.025 &&
    Math.abs(point.vx) < 0.6 &&
    Math.abs(point.vy) < 0.6
  ) {
    point.x = targetX
    point.y = targetY
    point.vx = 0
    point.vy = 0
  }
}

export function touchRepulsion(
  dx: number,
  dy: number,
  radius: number,
  seed: number,
): [number, number] {
  const distance = Math.hypot(dx, dy)
  if (distance >= radius) return [0, 0]
  const strength = radius * 0.82 * Math.pow(1 - distance / radius, 1.55)
  if (distance < 0.001) {
    const angle = seed * 2.399963229728653
    return [Math.cos(angle) * strength, Math.sin(angle) * strength]
  }
  return [(dx / distance) * strength, (dy / distance) * strength]
}

export function loginViewportHeight(
  windowHeight: number,
  screenHeight: number,
  keyboardHeight: number,
): number {
  return Math.max(1, Math.min(windowHeight, screenHeight - Math.max(0, keyboardHeight)))
}
