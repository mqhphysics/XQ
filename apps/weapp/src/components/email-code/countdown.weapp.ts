import Taro, { useDidShow } from '@tarojs/taro'
import { useEffect, useState } from 'react'
import {
  emailCooldownDeadline,
  emailCooldownKey,
  emailCooldownRemaining,
} from './countdown.logic.weapp'

const storageKey = 'xiaoqiu:weapp:email-cooldowns:v1'
const changed = 'xiaoqiu:weapp:email-cooldown'
function readDeadline(email: string): number {
  const stored = Taro.getStorageSync<Record<string, number>>(storageKey)
  return Number(stored?.[emailCooldownKey(email)]) || 0
}
export function startEmailCooldown(email: string, seconds = 60) {
  const now = Date.now()
  const stored = Taro.getStorageSync<Record<string, number>>(storageKey) || {}
  const next = Object.fromEntries(Object.entries(stored).filter(([, expiry]) => expiry > now))
  next[emailCooldownKey(email)] = Math.max(readDeadline(email), emailCooldownDeadline(seconds, now))
  Taro.setStorageSync(storageKey, next)
  Taro.eventCenter.trigger(changed)
}
export function useEmailResendCountdown(email: string) {
  const key = emailCooldownKey(email)
  const [remaining, setRemaining] = useState(() => emailCooldownRemaining(readDeadline(key)))
  const update = () => setRemaining(emailCooldownRemaining(readDeadline(key)))
  useDidShow(update)
  useEffect(() => {
    const update = () => setRemaining(emailCooldownRemaining(readDeadline(key)))
    update()
    Taro.eventCenter.on(changed, update)
    return () => {
      Taro.eventCenter.off(changed, update)
    }
  }, [key])
  useEffect(() => {
    if (!remaining) return
    const timer = setTimeout(update, 1000)
    return () => clearTimeout(timer)
  }, [key, remaining])
  return { remaining, start: (seconds = 60) => startEmailCooldown(key, seconds) }
}
