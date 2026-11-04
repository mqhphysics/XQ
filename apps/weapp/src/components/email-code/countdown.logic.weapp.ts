export function emailCooldownKey(email: string): string {
  return email.trim().toLowerCase()
}

export function emailCooldownDeadline(seconds = 60, now = Date.now()): number {
  return now + (Number.isFinite(seconds) && seconds > 0 ? Math.ceil(seconds) : 60) * 1000
}

export function emailCooldownRemaining(deadline: number, now = Date.now()): number {
  return Math.max(0, Math.ceil((deadline - now) / 1000))
}
