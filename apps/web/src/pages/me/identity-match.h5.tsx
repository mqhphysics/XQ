import { useEffect, useRef, useState } from 'react'
import {
  identityRepository,
  identityActionId,
  identityLabels,
  type IdentitySnapshot,
} from '../../features/identity/identity.repository.h5'
import { productRepository } from '../../features/product/product.repository'
import { readSession } from '../../features/product/session.h5'
import { updateBadgeDisplay } from '../../features/product/badge-display.h5'
import type { AuthUser } from '../../features/product/product.types'
import { ProfileDialog } from './profile-dialog.h5'
import './identity-match.h5.scss'

export function IdentityMatchDialog({
  onClose,
  onResolved,
  onApply,
}: {
  onClose: () => void
  onResolved: (user: AuthUser, kind: string | null) => void
  onApply: () => void
}) {
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<IdentitySnapshot | null>(null)
  const [user, setUser] = useState<AuthUser | null>(null)
  const [kind, setKind] = useState<string | null>(null)
  const [choice, setChoice] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [saving, setSaving] = useState(false)
  const [round, setRound] = useState(0)
  const initial = useRef(readSession())
  const pending = useRef<{ id: string; key: string } | null>(null)
  useEffect(() => {
    let active = true
    const session = initial.current
    if (!session) {
      onClose()
      return
    }
    const key = `xiaoqiu.identity-check.v1:${session.user.organizationId}:${session.user.id}`
    let first = true
    try {
      first = !sessionStorage.getItem(key)
    } catch {
      /* Matching does not require browser storage. */
    }
    setLoading(true)
    setError('')
    setSuccess(false)
    void Promise.all([
      identityRepository.get(),
      productRepository.getMe(),
      productRepository.getBadgePreference(),
      new Promise((resolve) => setTimeout(resolve, first ? 800 : 100)),
    ])
      .then(([snapshot, current, badge]) => {
        if (!active || readSession()?.accessToken !== session.accessToken) return
        try {
          sessionStorage.setItem(key, 'checked')
        } catch {
          /* Optional visual preference. */
        }
        setData(snapshot)
        setUser(current)
        setKind(badge.displayedKind)
        updateBadgeDisplay(current.id, badge.displayedKind)
        setChoice(snapshot.verifiedCandidates?.[0]?.id ?? '')
        if (!snapshot.verifiedCandidates?.length) onResolved(current, badge.displayedKind)
      })
      .catch((issue) => {
        if (active) setError(issue instanceof Error ? issue.message : '身份匹配暂时不可用')
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [round])
  const confirm = async () => {
    const record = data?.verifiedCandidates?.find((item) => item.id === choice)
    if (!record || saving) return
    setSaving(true)
    setError('')
    if (pending.current?.id !== record.id)
      pending.current = { id: record.id, key: identityActionId() }
    try {
      await identityRepository.confirm(
        record.id.replace(/^record:/, ''),
        record.expectedVersion,
        pending.current.key,
      )
      const [current, badge] = await Promise.all([
        productRepository.getMe(),
        productRepository.getBadgePreference(),
      ])
      if (readSession()?.accessToken !== initial.current?.accessToken) return
      setUser(current)
      setKind(badge.displayedKind)
      updateBadgeDisplay(current.id, badge.displayedKind)
      setSuccess(true)
      window.dispatchEvent(new CustomEvent('xiaoqiu:identity:changed', { detail: current }))
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : '认证暂时未完成，请重新匹配')
    } finally {
      setSaving(false)
    }
  }
  return (
    <ProfileDialog
      title={loading ? '正在核对你的身份' : success ? '恭喜，认证成功' : '找到已核验的身份'}
      onClose={() => {
        if (!saving) onClose()
      }}
    >
      {loading ? (
        <div className="identity-match-loading" role="status">
          <i />
          <strong>正在查找与你对应的身份…</strong>
          <p>核对已认证身份和管理员实名名单。</p>
        </div>
      ) : success ? (
        <div className="identity-match-success">
          <span>✓</span>
          <p>你的身份已认证，可以选择展示身份并使用对应功能。</p>
          <button
            data-profile-button
            className="profile-button profile-button--primary"
            onClick={() => {
              if (user) onResolved(user, kind)
            }}
          >
            前往我的身份
          </button>
        </div>
      ) : (
        <>
          {error && (
            <p className="profile-error" role="alert">
              {error}
            </p>
          )}
          {data?.verifiedCandidates?.length ? (
            <>
              <p className="identity-match-note">
                以下身份已由管理员核验并关联到你的账号。确认后即可完成认证。
              </p>
              <div className="identity-match-options">
                {data.verifiedCandidates.map((item) => (
                  <label key={item.id}>
                    <input
                      type="radio"
                      data-xq-radio=""
                      name="verified-identity"
                      checked={choice === item.id}
                      disabled={saving}
                      onChange={() => setChoice(item.id)}
                    />
                    <span>
                      <strong>{identityLabels[item.kind]}</strong>
                      <small>
                        {item.displayName}
                        {item.teamName ? ` · ${item.teamName}` : ''}
                      </small>
                    </span>
                  </label>
                ))}
              </div>
              <div className="profile-dialog__actions">
                <button
                  data-profile-button
                  className="profile-button profile-button--outline"
                  disabled={saving}
                  onClick={() => setRound((value) => value + 1)}
                >
                  重新匹配
                </button>
                <button
                  data-profile-button
                  className="profile-button profile-button--primary"
                  disabled={saving || !choice}
                  onClick={() => void confirm()}
                >
                  {saving ? '正在确认…' : '确认认证'}
                </button>
              </div>
            </>
          ) : (
            <div className="profile-dialog__actions">
              <button
                data-profile-button
                className="profile-button profile-button--outline"
                onClick={() => setRound((value) => value + 1)}
              >
                重新匹配
              </button>
              <button
                data-profile-button
                className="profile-button profile-button--primary"
                onClick={onApply}
              >
                前往申请认证
              </button>
            </div>
          )}
        </>
      )}
    </ProfileDialog>
  )
}
