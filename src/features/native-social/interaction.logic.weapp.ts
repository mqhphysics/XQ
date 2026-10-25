export function keyboardViewport(baseline: number, current: number, keyboard: number) {
  return Math.max(180, keyboard > 0 ? Math.min(current, baseline - keyboard) : current)
}
export function draftStorageKey(organization: string, user: string, scope: string) {
  return `xiaoqiu:weapp:draft:v1:${organization}:${user}:${scope}`
}
export function appendEmoji(body: string, emoji: string, cursor: number, maximum: number) {
  const at = Math.max(0, Math.min(body.length, cursor < 0 ? body.length : cursor))
  if (body.length + emoji.length > maximum) return { body, cursor: at }
  return { body: body.slice(0, at) + emoji + body.slice(at), cursor: at + emoji.length }
}
export function drawerRelease(x: number, velocity: number, width: number) {
  return x + velocity * 0.17 < -width * 0.32 ? -width : 0
}
/** Analytical critical damping keeps elapsed time correct after timer throttling. */
export function drawerSpring(
  origin: number,
  initialVelocity: number,
  target: number,
  seconds: number,
) {
  const omega = 24,
    time = Math.max(0, seconds)
  const displacement = origin - target,
    coefficient = initialVelocity + omega * displacement
  const decay = Math.exp(-omega * time)
  return {
    position: target + (displacement + coefficient * time) * decay,
    velocity: (initialVelocity - omega * coefficient * time) * decay,
  }
}
