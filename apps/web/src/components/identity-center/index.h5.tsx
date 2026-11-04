import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ReporterQualityPanel } from '../campus-context/reporter-quality.h5'
import { StudentIdentitySummary } from '../campus-context/student-identity.h5'
import '../campus-context/index.h5.scss'
import Taro from '@tarojs/taro'
import { useOverlayFocus } from '../overlay-focus'
import {
  identityActionId,
  identityLabels,
  identityRepository,
  type IdentityKind,
  type IdentitySnapshot,
} from '../../features/identity/identity.repository.h5'
import type { AuthUser } from '../../features/product/product.types'
import { productRepository } from '../../features/product/product.repository'
import { roleLabel } from '../../features/product/product.format'
import { identityEntryActions } from '../../features/identity/entry-actions.h5'
import { productConfigRepository } from '../../features/product-config/product-config.repository'
import { useProductConfiguration } from '../../features/product-config/use-product-config.h5'
import {
  readSession,
  saveSession,
  subscribeToSessionChanges,
} from '../../features/product/session.h5'
import './index.h5.scss'

export function IdentityEntry({
  user,
  onUserChange,
  actions,
}: {
  user: AuthUser
  onUserChange?: (user: AuthUser) => void
  actions?: { informationEntry?: () => void; administrationEntry?: () => void }
}) {
  useEffect(() => {
    const changed = (event: Event) => {
      const refreshed = (event as CustomEvent<AuthUser>).detail
      if (refreshed.id === user.id && refreshed.organizationId === user.organizationId)
        onUserChange?.(refreshed)
    }
    window.addEventListener('xiaoqiu:identity:changed', changed)
    return () => window.removeEventListener('xiaoqiu:identity:changed', changed)
  }, [user.id, user.organizationId, onUserChange])
  const roles = user.roles.filter((r) =>
    [
      'TEAM_COACH',
      'TEAM_CAPTAIN',
      'MATCH_REPORTER',
      'TOURNAMENT_ADMIN',
      'ORGANIZATION_ADMIN',
      'PLATFORM_ADMIN',
    ].includes(r.role),
  )
  const teamIds = [
    ...new Set(
      roles
        .filter((r) => ['TEAM_COACH', 'TEAM_CAPTAIN'].includes(r.role) && r.scopeType === 'TEAM')
        .map((r) => r.scopeId),
    ),
  ]
  const isAdmin = roles.some(
    (r) =>
      (r.role === 'PLATFORM_ADMIN' && r.scopeType === 'PLATFORM') ||
      (r.role === 'ORGANIZATION_ADMIN' &&
        r.scopeType === 'ORGANIZATION' &&
        r.scopeId === user.organizationId),
  )
  const canReport =
    isAdmin ||
    roles.some(
      (r) =>
        (r.role === 'MATCH_REPORTER' && ['MATCH', 'TOURNAMENT'].includes(r.scopeType)) ||
        (r.role === 'TOURNAMENT_ADMIN' && r.scopeType === 'TOURNAMENT'),
    )
  return (
    <section className="identity-entry" aria-label="身份与认证">
      <div>
        <strong>我的身份</strong>
        <span>
          {[
            ...(user.linkedPlayer ? ['球员'] : []),
            ...new Set(
              roles.map((r) => identityLabels[r.role as IdentityKind] ?? roleLabel(r.role)),
            ),
          ].join(' · ') || '暂无认证身份'}
        </span>
      </div>
      <div className="identity-entry-actions">
        <button
          data-identity-button
          type="button"
          onClick={() => void identityEntryActions.identity()}
        >
          我的身份 <span aria-hidden="true">→</span>
        </button>
        {teamIds.length > 0 && (
          <button
            data-identity-button
            type="button"
            onClick={() => void identityEntryActions.teamManagement()}
          >
            球队管理
          </button>
        )}
        {canReport && (
          <button
            data-identity-button
            type="button"
            onClick={
              actions?.informationEntry ?? (() => void identityEntryActions.informationEntry())
            }
          >
            信息录入
          </button>
        )}
        {isAdmin && (
          <button
            data-identity-button
            type="button"
            onClick={
              actions?.administrationEntry ??
              (() => void identityEntryActions.administrationEntry())
            }
          >
            管理中心
          </button>
        )}
      </div>
    </section>
  )
}

export function IdentityCenterHost() {
  const { configuration } = useProductConfiguration()
  const identityEnabled = configuration?.modules.identityApplications.enabled === true
  const [token, setToken] = useState(() => readSession()?.accessToken ?? null)
  const [open, setOpen] = useState(false)
  const [data, setData] = useState<IdentitySnapshot | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const [kind, setKind] = useState<IdentityKind | ''>('')
  const [teamId, setTeamId] = useState('')
  const [message, setMessage] = useState('')
  const [saving, setSaving] = useState(false)
  const pending = useRef<{ body: string; key: string } | null>(null)
  const sequence = useRef(0)
  const activeToken = useRef(token)
  activeToken.current = token
  const close = () => {
    if (!saving) setOpen(false)
  }
  useOverlayFocus(open, '.identity-dialog', close)
  const load = useCallback(async () => {
    const current = ++sequence.current
    setLoading(true)
    setError('')
    try {
      const capabilities = await productConfigRepository.getCapabilities()
      if (!capabilities.actions['identityApplications.submit'].enabled)
        throw new Error(
          capabilities.actions['identityApplications.submit'].reason ?? '功能暂未开放',
        )
      const [snapshot, user] = await Promise.all([
        identityRepository.get(),
        productRepository.getMe(),
      ])
      if (current === sequence.current && readSession()?.accessToken === token) {
        setData(snapshot)
        const stored = readSession()
        if (stored) saveSession({ ...stored, user })
        window.dispatchEvent(new CustomEvent('xiaoqiu:identity:changed', { detail: user }))
      }
      return snapshot
    } catch (issue) {
      if (current === sequence.current)
        setError(issue instanceof Error ? issue.message : '认证信息读取失败')
      return null
    } finally {
      if (current === sequence.current) setLoading(false)
    }
  }, [token])
  useEffect(() => subscribeToSessionChanges(() => setToken(readSession()?.accessToken ?? null)), [])
  useEffect(() => {
    setOpen(false)
    setData(null)
    setMessage('')

    setTeamId('')
    pending.current = null
    if (!token || !identityEnabled) return
    return () => {
      sequence.current++
    }
  }, [token, load, identityEnabled])
  useEffect(() => {
    const show = () => {
      setOpen(true)
      void load()
    }
    window.addEventListener('xiaoqiu:identity:open', show)
    return () => window.removeEventListener('xiaoqiu:identity:open', show)
  }, [load])
  const submit = async () => {
    if (saving) return
    setError('')
    if (message.trim().length < 8) {
      setError('请填写至少8个字的申请原因，帮助管理员核实身份。')
      return
    }
    if (!kind) {
      setError('请选择要申请的身份')
      return
    }
    const body = {
      kind,

      ...(teamId ? { teamId } : {}),
      message: message.trim(),
    }
    const fingerprint = JSON.stringify(body)
    if (pending.current?.body !== fingerprint)
      pending.current = { body: fingerprint, key: identityActionId() }
    setSaving(true)
    const submittingToken = token
    try {
      await identityRepository.apply(body, pending.current.key)
      if (activeToken.current !== submittingToken) return
      pending.current = null
      setMessage('')
      const refreshed = await load()
      if (activeToken.current !== submittingToken) return
      if (!refreshed) setError((issue) => `申请已提交，但状态刷新失败：${issue}`)
      await Taro.showToast({ title: '申请已提交，等待管理员核实', icon: 'none' })
    } catch (issue) {
      if (activeToken.current === submittingToken)
        setError(issue instanceof Error ? issue.message : '申请提交失败，请重试')
    } finally {
      setSaving(false)
    }
  }
  if (!open || !token) return null
  return createPortal(
    <div className="identity-backdrop" onClick={close}>
      <section
        className="identity-dialog xq-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="identity-title"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="xq-dialog__header">
          <div>
            <small>身份与认证</small>
            <h2 id="identity-title">我的身份</h2>
          </div>
          <button data-identity-button type="button" aria-label="关闭认证窗口" onClick={close}>
            ×
          </button>
        </header>
        <div className="xq-dialog__body">
          <StudentIdentitySummary />
          <ReporterQualityPanel />
          <p>选择要申请的身份并说明原因。申请结果会通过系统消息通知你。</p>
          {error && (
            <p className="identity-error" role="alert">
              {error}
            </p>
          )}
          {loading && <p role="status">正在读取认证记录…</p>}
          {!loading && !data && (
            <button data-identity-button type="button" onClick={() => void load()}>
              重试连接
            </button>
          )}
          {data && (
            <>
              <form
                onSubmit={(e) => {
                  e.preventDefault()
                  void submit()
                }}
              >
                {data.hasMoreCandidates && <p>同名候选较多，请主动申请并向管理员提供核实说明。</p>}
                {
                  <label data-identity-field>
                    申请身份
                    <select
                      data-identity-control
                      value={kind}
                      onChange={(e) => {
                        setKind(e.target.value as IdentityKind)
                        setTeamId('')
                      }}
                    >
                      <option value="">请选择要申请的身份</option>
                      {Object.entries(identityLabels).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </label>
                }
                {['TEAM_COACH', 'TEAM_CAPTAIN'].includes(kind) && (
                  <label data-identity-field>
                    所属球队
                    <select
                      data-identity-control
                      required
                      value={teamId}
                      onChange={(e) => setTeamId(e.target.value)}
                    >
                      <option value="">请选择球队</option>
                      {data.teams.map((team) => (
                        <option key={team.id} value={team.id}>
                          {team.name}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                <label data-identity-field>
                  申请原因
                  <textarea
                    data-identity-control="textarea"
                    required
                    minLength={8}
                    maxLength={1000}
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="说明申请身份和所属球队，提供方便管理员核实的线索。"
                  />
                </label>
                <button
                  data-identity-button
                  className="identity-submit"
                  type="submit"
                  disabled={saving}
                >
                  {saving ? '正在提交…' : '提交认证申请'}
                </button>
              </form>
              <div className="identity-history">
                <h3>我的申请</h3>
                <button data-identity-button type="button" onClick={() => void load()}>
                  刷新状态
                </button>
                {data.applications.length ? (
                  data.applications.map((a) => (
                    <article key={a.id}>
                      <strong>
                        {identityLabels[a.kind]}
                        {a.team ? ` · ${a.team.name}` : ''}
                      </strong>
                      <span>
                        {{ PENDING: '待审核', APPROVED: '已批准', REJECTED: '未通过' }[a.status]}
                      </span>
                      {a.decisionNote && <p>{a.decisionNote}</p>}
                    </article>
                  ))
                ) : (
                  <p>还没有申请。未匹配到名单也可以主动申请。</p>
                )}
              </div>
            </>
          )}
        </div>
      </section>
    </div>,
    document.body,
  )
}
