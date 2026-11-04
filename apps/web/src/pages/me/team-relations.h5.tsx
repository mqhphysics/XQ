import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useOverlayFocus } from '../../components/overlay-focus'
import { TeamCrest } from '../../components/product-ui'
import { productRepository, createClientActionId } from '../../features/product/product.repository'
import { readSession, subscribeToSessionChanges } from '../../features/product/session.h5'
import { productConfigRepository } from '../../features/product-config/product-config.repository'
import { openTeam } from '../../features/product/team-navigation'
import { openCaptainManage } from '../../features/captain-roster/captain-manage-navigation.h5'
import type { TeamRelationshipResponse, TeamSummary } from '../../features/product/product.types'
import { ProfileIcon } from './profile-icons.h5'

interface TeamRelation {
  team: TeamSummary
  relationship: TeamRelationshipResponse
}
export function TeamRelationsDialog({
  teams,
  tournamentId,
  managedIds,
  onClose,
}: {
  teams: TeamSummary[]
  tournamentId: string
  managedIds: string[]
  onClose: () => void
}) {
  const [items, setItems] = useState<TeamRelation[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [mode, setMode] = useState<'overview' | 'join' | 'transfer'>('overview')
  const [source, setSource] = useState('')
  const [target, setTarget] = useState('')
  const [message, setMessage] = useState('')
  const [query, setQuery] = useState('')
  const [success, setSuccess] = useState('')
  const [busy, setBusy] = useState(false)
  const lock = useRef(false)
  const sequence = useRef(0)
  const session = useRef(readSession())
  const reportId = useRef<{ fingerprint: string; id: string } | null>(null)
  const close = () => {
    if (!lock.current) onClose()
  }
  useOverlayFocus(true, '.profile-team-relations', close)
  useEffect(
    () =>
      subscribeToSessionChanges(() => {
        if (readSession()?.accessToken !== session.current?.accessToken) onClose()
      }),
    [onClose],
  )
  const current = () => {
    if (!session.current || readSession()?.accessToken !== session.current.accessToken)
      throw new Error('账号已变更，请重新打开球队窗口')
  }
  const load = useCallback(async () => {
    const id = ++sequence.current
    setLoading(true)
    setError('')
    try {
      const result = await Promise.all(
        teams.map(async (team) => ({
          team,
          relationship: await productRepository.getTeamRelationship(team.id),
        })),
      )
      current()
      if (id === sequence.current) setItems(result)
    } catch (issue) {
      if (id === sequence.current)
        setError(issue instanceof Error ? issue.message : '球队关系读取失败')
    } finally {
      if (id === sequence.current) setLoading(false)
    }
  }, [teams])
  useEffect(() => {
    void load()
    return () => {
      sequence.current += 1
    }
  }, [load])
  const memberships = items.filter((item) => item.relationship.membershipStatus === 'ACTIVE')
  const managed = items.filter((item) => managedIds.includes(item.team.id))
  const applications = items.filter(
    (item) => item.relationship.application && item.relationship.membershipStatus !== 'ACTIVE',
  )
  const available = items.filter(
    (item) =>
      item.relationship.membershipStatus !== 'ACTIVE' &&
      `${item.team.name} ${item.team.collegeName ?? ''}`.includes(query.trim()),
  )
  const start = (next: 'join' | 'transfer') => {
    setMode(next)
    setSource(memberships[0]?.team.id ?? '')
    setTarget('')
    setMessage('')
    setSuccess('')
    setError('')
    setQuery('')
  }
  const submit = async () => {
    if (!target || lock.current) return
    lock.current = true
    setBusy(true)
    setError('')
    try {
      current()
      const caps = await productConfigRepository.getCapabilities()
      current()
      if (caps.organizationId !== session.current?.user.organizationId)
        throw new Error('账号组织已变更，请重新打开')
      if (mode === 'transfer') {
        const from = memberships.find((item) => item.team.id === source)
        const to = available.find((item) => item.team.id === target)
        if (!from || !to || message.trim().length < 2)
          throw new Error('请选择原球队、目标球队，并填写转会原因')
        const latest = await productRepository.getTeamRelationship(source)
        current()
        if (latest.membershipStatus !== 'ACTIVE') throw new Error('原球队关系已变更，请刷新后重试')
        const fingerprint = JSON.stringify([source, target, message.trim()])
        if (reportId.current?.fingerprint !== fingerprint)
          reportId.current = { fingerprint, id: createClientActionId('transfer-request') }
        await productRepository.createReport(
          'FEEDBACK',
          '转会申请',
          `原球队：${from.team.name}（${source}）\n目标球队：${to.team.name}（${target}）\n申请原因：${message.trim()}`,
          reportId.current.id,
        )
        setSuccess('转会申请已提交给管理员。可在反馈记录查看回复；当前球队归属保持不变。')
      } else {
        if (!caps.modules.teamManagement?.enabled) throw new Error('球队申请功能暂未开放')
        const relation = await productRepository.applyToTeam(target, '', message)
        current()
        setItems((value) =>
          value.map((item) =>
            item.team.id === target ? { ...item, relationship: relation } : item,
          ),
        )
        setSuccess('入队申请已提交，等待队长或教练处理。')
      }
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : '申请提交失败')
    } finally {
      lock.current = false
      setBusy(false)
    }
  }
  const manage = async (teamId: string) => {
    if (lock.current) return
    lock.current = true
    setBusy(true)
    setError('')
    try {
      current()
      const caps = await productConfigRepository.getCapabilities()
      current()
      const capability = caps.actions['teams.manage']
      if (
        !caps.modules.teamManagement?.enabled ||
        !capability?.enabled ||
        !capability.scopes.some(
          (scope) =>
            (scope.type === 'TEAM' && scope.id === teamId) ||
            (scope.type === 'ORGANIZATION' && scope.id === caps.organizationId),
        )
      )
        throw new Error('当前账号没有该球队的管理权限')
      openCaptainManage({ teamId, tournamentId })
      onClose()
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : '球队管理暂时不可用')
    } finally {
      lock.current = false
      setBusy(false)
    }
  }
  return createPortal(
    <div
      className="profile-dialog-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) close()
      }}
    >
      <section
        className="profile-dialog profile-team-relations"
        role="dialog"
        aria-modal="true"
        aria-label={managedIds.length ? '管理球队' : '我的球队'}
        tabIndex={-1}
      >
        <header>
          <div>
            <h2>{managedIds.length ? '管理球队' : '我的球队'}</h2>
            <p>查看本人球队关系、入队申请与转会申请。</p>
          </div>
          <button data-profile-button aria-label="关闭球队窗口" disabled={busy} onClick={close}>
            <ProfileIcon name="close" />
          </button>
        </header>
        <div className="profile-dialog__body">
          {loading ? (
            <p role="status">正在读取球队关系…</p>
          ) : (
            <>
              <div className="profile-team-tabs" role="tablist" aria-label="球队关系选项">
                {(['overview', 'join', 'transfer'] as const).map((value) => (
                  <button
                    data-profile-button
                    role="tab"
                    key={value}
                    aria-selected={mode === value}
                    disabled={busy || (value === 'transfer' && !memberships.length)}
                    onClick={() => {
                      if (value === 'overview') {
                        setMode(value)
                        setError('')
                        setSuccess('')
                      } else start(value)
                    }}
                  >
                    {value === 'overview' ? '我的球队' : value === 'join' ? '加入球队' : '申请转会'}
                  </button>
                ))}
              </div>
              {mode === 'overview' ? (
                <>
                  {(memberships.length ? memberships : []).map((item) => (
                    <div className="profile-relation-team" key={item.team.id}>
                      <TeamCrest team={item.team} size="small" />
                      <div>
                        <strong>{item.team.name}</strong>
                        <small>
                          正式成员{managedIds.includes(item.team.id) ? ' · 拥有管理权限' : ''}
                        </small>
                      </div>
                      <button
                        data-profile-button
                        onClick={() => {
                          onClose()
                          void openTeam(item.team.id, tournamentId)
                        }}
                      >
                        查看球队
                      </button>
                    </div>
                  ))}
                  {!memberships.length && (
                    <p className="profile-team-empty">
                      你还没有加入球队，可以在这里选择球队并提交入队申请。
                    </p>
                  )}
                  {managed.length > 0 && (
                    <div className="profile-relation-managed">
                      <h3>可管理的球队</h3>
                      {managed.map((item) => (
                        <button
                          data-profile-button
                          key={item.team.id}
                          disabled={busy}
                          onClick={() => void manage(item.team.id)}
                        >
                          <span>{item.team.name}</span>
                          <span>管理 →</span>
                        </button>
                      ))}
                    </div>
                  )}
                  {applications.length > 0 && (
                    <div className="profile-team-applications">
                      <h3>我的入队申请</h3>
                      {applications.map((item) => (
                        <div key={item.team.id}>
                          <strong>{item.team.name}</strong>
                          <span>
                            {item.relationship.application?.status === 'PENDING'
                              ? '待审核'
                              : item.relationship.application?.status === 'APPROVED'
                                ? '已通过'
                                : '未通过'}
                          </span>
                          {item.relationship.application?.decisionNote && (
                            <small>{item.relationship.application.decisionNote}</small>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <>
                  {mode === 'transfer' && (
                    <>
                      <p className="profile-transfer-note">
                        转会申请交由管理员审核。审核与成员调整完成前，你仍属于原球队，赛事报名名单不会自动变化。
                      </p>
                      <label className="profile-team-source">
                        原球队
                        <select
                          data-profile-input
                          aria-label="原球队"
                          value={source}
                          disabled={busy || !!success}
                          onChange={(event) => setSource(event.target.value)}
                        >
                          {memberships.map((item) => (
                            <option key={item.team.id} value={item.team.id}>
                              {item.team.name}
                            </option>
                          ))}
                        </select>
                      </label>
                    </>
                  )}
                  <input
                    data-profile-input
                    aria-label="搜索目标球队"
                    placeholder="搜索目标球队"
                    value={query}
                    disabled={busy || !!success}
                    onChange={(event) => setQuery(event.target.value)}
                  />
                  <div className="profile-team-targets" role="radiogroup" aria-label="目标球队">
                    {available.map((item) => (
                      <button
                        data-profile-button
                        role="radio"
                        aria-checked={target === item.team.id}
                        key={item.team.id}
                        disabled={
                          busy || !!success || item.relationship.application?.status === 'PENDING'
                        }
                        onClick={() => setTarget(item.team.id)}
                      >
                        <TeamCrest team={item.team} size="small" />
                        <span>{item.team.name}</span>
                        <small>
                          {item.relationship.application?.status === 'PENDING'
                            ? '已有待审申请'
                            : target === item.team.id
                              ? '已选择'
                              : '选择'}
                        </small>
                      </button>
                    ))}
                    {!available.length && <p>没有匹配的可申请球队</p>}
                  </div>
                  <label className="profile-team-reason">
                    {mode === 'transfer' ? '转会原因' : '入队说明（选填）'}
                    <textarea
                      data-profile-textarea
                      aria-label={mode === 'transfer' ? '转会原因' : '入队说明'}
                      maxLength={500}
                      rows={3}
                      value={message}
                      disabled={busy || !!success}
                      onChange={(event) => setMessage(event.target.value)}
                    />
                  </label>
                  {success ? (
                    <p className="profile-team-success" role="status">
                      {success}
                    </p>
                  ) : (
                    <div className="profile-dialog__actions">
                      <button
                        data-profile-button
                        className="profile-button profile-button--primary"
                        disabled={
                          !target || busy || (mode === 'transfer' && message.trim().length < 2)
                        }
                        onClick={() => void submit()}
                      >
                        {busy ? '提交中…' : mode === 'transfer' ? '提交转会申请' : '提交入队申请'}
                      </button>
                    </div>
                  )}
                </>
              )}
            </>
          )}
          {error && (
            <div className="profile-error" role="alert">
              {error}
              <button data-profile-button disabled={busy} onClick={() => void load()}>
                刷新球队关系
              </button>
            </div>
          )}
        </div>
      </section>
    </div>,
    document.body,
  )
}
