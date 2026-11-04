import { useEffect, useState } from 'react'

const deadlines = new Map<string, number>(),
  listeners = new Set<() => void>()
export function useEmailResendCountdown(email: string) {
  const key = email.trim().toLowerCase()
  const [deadline, setDeadline] = useState(() => deadlines.get(key) ?? 0),
    [now, setNow] = useState(Date.now)
  useEffect(() => {
    const update = () => {
      setDeadline(deadlines.get(key) ?? 0)
      setNow(Date.now())
    }
    update()
    listeners.add(update)
    return () => {
      listeners.delete(update)
    }
  }, [key])
  useEffect(() => {
    if (deadline <= Date.now()) return
    const timer = window.setInterval(() => setNow(Date.now()), 250)
    return () => window.clearInterval(timer)
  }, [deadline])
  return {
    remaining: Math.max(0, Math.ceil((deadline - now) / 1000)),
    start: (seconds = 60) => {
      const now = Date.now()
      for (const [mail, expiry] of deadlines) if (expiry <= now) deadlines.delete(mail)
      deadlines.set(key, now + Math.max(1, seconds) * 1000)
      for (const notify of listeners) notify()
    },
  }
}
