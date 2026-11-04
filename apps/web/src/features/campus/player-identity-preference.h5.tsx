import { useEffect, useRef, useState } from 'react'
import { readSession, subscribeToSessionChanges } from '../product/session.h5'
import { updatePublicProfile } from '../product/email-change.repository.h5'
import type { AuthUser } from '../product/product.types'
import './player-identity-preference.h5.scss'

export function usePlayerIdentityVisibility(user: AuthUser) {
  const [visible, setVisible] = useState(user.showPlayerIdentity !== false)
  useEffect(() => {
    setVisible(user.showPlayerIdentity !== false)
    return subscribeToSessionChanges(() => {
      const fresh = readSession()?.user
      if (fresh?.id === user.id) setVisible(fresh.showPlayerIdentity !== false)
    })
  }, [user.id, user.showPlayerIdentity])
  return visible
}
export function PlayerIdentityPreference({ onChanged }: { onChanged?: (user: AuthUser) => void }) {
  const [user, setUser] = useState(() => readSession()?.user),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('')
  const locked = useRef(false)
  useEffect(() => subscribeToSessionChanges(() => setUser(readSession()?.user)), [])
  if (!user) return null
  const visible = user.showPlayerIdentity !== false
  const toggle = async () => {
    if (locked.current) return
    locked.current = true
    setBusy(true)
    setError('')
    try {
      const fresh = await updatePublicProfile({ showPlayerIdentity: !visible })
      setUser(fresh)
      onChanged?.(fresh)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '保存未完成，请重试')
    } finally {
      locked.current = false
      setBusy(false)
    }
  }
  return (
    <div className="player-identity-preference">
      <div>
        <strong>在用户主页显示球员身份</strong>
        <p>显示可点开的球员档案入口；用户头像、背景和动态独立保存。</p>
        {error && <p role="alert">{error}</p>}
      </div>
      <button
        type="button"
        role="switch"
        aria-label="在用户主页显示球员身份"
        aria-checked={visible}
        disabled={busy}
        onClick={() => void toggle()}
      >
        <span />
      </button>
    </div>
  )
}
