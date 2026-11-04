import { useEffect, useRef, useState } from 'react'
import { productRepository, createClientActionId } from '../../features/product/product.repository'
import type { AuthUser, BadgePreferenceResponse } from '../../features/product/product.types'
import { identityLabels } from '../../features/product/identity-badges'
import { updateBadgeDisplay } from '../../features/product/badge-display.h5'
import { VerificationBadge } from '../verification-badge/index.h5'
import './index.h5.scss'

export function BadgeManager({ user, onClose }: { user: AuthUser; onClose: () => void }) {
  const [data, setData] = useState<BadgePreferenceResponse | null>(null),
    [choice, setChoice] = useState(''),
    [error, setError] = useState(''),
    [saving, setSaving] = useState(false)
  const pending = useRef<{ fingerprint: string; id: string } | null>(null)
  const load = () =>
    productRepository.getBadgePreference().then((result) => {
      setData(result)
      setChoice(
        result.availableKinds.some((kind) => kind === result.preferredKind)
          ? (result.preferredKind ?? '')
          : '',
      )
      updateBadgeDisplay(user.id, result.displayedKind)
    })
  useEffect(() => {
    let active = true
    void productRepository
      .getBadgePreference()
      .then((result) => {
        if (active) {
          setData(result)
          setChoice(
            result.availableKinds.some((kind) => kind === result.preferredKind)
              ? (result.preferredKind ?? '')
              : '',
          )
          updateBadgeDisplay(user.id, result.displayedKind)
        }
      })
      .catch((issue) => {
        if (active) setError(issue instanceof Error ? issue.message : '标志设置读取失败')
      })
    return () => {
      active = false
    }
  }, [user.id])
  const save = async () => {
    if (!data || saving) return
    setSaving(true)
    setError('')
    const fingerprint = JSON.stringify([choice, data.version])
    if (pending.current?.fingerprint !== fingerprint)
      pending.current = { fingerprint, id: createClientActionId('badge') }
    try {
      const result = await productRepository.setBadgePreference(
        choice || null,
        data.version,
        pending.current.id,
      )
      setData(result)
      pending.current = null
      updateBadgeDisplay(user.id, result.displayedKind)
      onClose()
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : '保存失败，请重试')
      void load().catch(() => undefined)
    } finally {
      setSaving(false)
    }
  }
  return (
    <div className="badge-manager">
      <p>选择一个已认证身份展示在名字旁。</p>
      {error && (
        <p className="badge-manager__error" role="alert">
          {error}
        </p>
      )}
      {!data ? (
        <div role="status">
          正在读取可用身份
          {error && (
            <button
              type="button"
              data-profile-button
              onClick={() => void load().catch((issue) => setError(issue.message))}
            >
              重试
            </button>
          )}
        </div>
      ) : (
        <>
          <div className="badge-manager__choices" role="radiogroup" aria-label="选择展示标志">
            <label data-badge-choice className={choice === '' ? 'is-selected' : ''}>
              <input
                type="radio"
                data-xq-radio=""
                name="display-badge"
                value=""
                checked={choice === ''}
                disabled={saving}
                onChange={() => setChoice('')}
              />
              <span>自动选择</span>
              <small>身份变化后自动调整</small>
            </label>
            {data.availableKinds.map((kind) => (
              <label data-badge-choice key={kind} className={choice === kind ? 'is-selected' : ''}>
                <input
                  type="radio"
                  data-xq-radio=""
                  name="display-badge"
                  value={kind}
                  checked={choice === kind}
                  disabled={saving}
                  onChange={() => setChoice(kind)}
                />
                <VerificationBadge
                  level={user.verificationLevel}
                  roles={user.roles}
                  displayedKind={kind}
                />
                <span>{identityLabels[kind]}</span>
              </label>
            ))}
          </div>
          {!data.availableKinds.length && (
            <p>当前没有可选择的认证身份，后续获得身份后会自动展示。</p>
          )}
          <div className="badge-manager__actions">
            <button
              type="button"
              data-profile-button
              className="profile-button profile-button--outline"
              disabled={saving}
              onClick={onClose}
            >
              取消
            </button>
            <button
              type="button"
              data-profile-button
              className="profile-button profile-button--primary"
              disabled={saving}
              onClick={() => void save()}
            >
              {saving ? '保存中' : '保存展示身份'}
            </button>
          </div>
        </>
      )}
    </div>
  )
}
