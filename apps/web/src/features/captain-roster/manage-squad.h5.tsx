import { PlayerAvatar } from '../../components/player-avatar.h5'
import { useEffect, useMemo, useRef, useState } from 'react'
import Taro from '@tarojs/taro'
import { UserAvatar } from '../../components/product-ui'
import { positionLabel } from '../product/product.format'
import { createClientActionId, productRepository } from '../product/product.repository'
import type { CaptainWorkspaceResponse, TeamDashboardResponse } from '../product/product.types'
import { RosterApiError, rosterRepository, type RosterWorkflowView } from './roster.repository'
import { teamManagementRepository } from './team-management.repository'
import { Icon } from './manage-icons.h5'
import '../../components/interactions/interactions.h5.scss'

type Member = CaptainWorkspaceResponse['members'][number]
const EDITABLE = ['', 'DRAFT', 'RETURNED', 'REOPENED']
const POSITIONS = [
  ['GOALKEEPER', '门将'],
  ['DEFENDER', '后卫'],
  ['MIDFIELDER', '中场'],
  ['FORWARD', '前锋'],
] as const

const formatDeadline = (value: string) => {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return `${date.getMonth() + 1}月${date.getDate()}日`
}

export function ManageSquadSection({
  teamId,
  tournamentId,
  captain,
  dashboard,
  roster,
  rosterError,
  onCaptainChange,
  onRosterChange,
}: {
  teamId: string
  tournamentId: string
  captain: CaptainWorkspaceResponse
  dashboard: TeamDashboardResponse | null
  roster: RosterWorkflowView | null
  rosterError: string
  onCaptainChange: (next: CaptainWorkspaceResponse) => void
  onRosterChange: (next: RosterWorkflowView) => void
}) {
  const status = roster?.status ?? ''
  const editable = Boolean(roster?.policy) && EDITABLE.includes(status)
  const [entries, setEntries] = useState<Map<string, string | null>>(new Map())
  const [dirty, setDirty] = useState(false)
  const [autosave, setAutosave] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [submitting, setSubmitting] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState('')
  const rosterRef = useRef(roster)
  const checkDelays = useRef(new Map<string, number>())
  const stampedChecks = useRef(false)
  rosterRef.current = roster

  useEffect(() => {
    if (!roster || dirty) return
    setEntries(new Map(roster.players.map((player) => [player.playerId, player.shirtNumber])))
  }, [roster, dirty])

  const shirtFallback = useMemo(
    () => new Map((dashboard?.roster ?? []).map((player) => [player.id, player.shirtNumber])),
    [dashboard],
  )
  const eligible = useMemo(
    () =>
      new Map((roster?.availablePlayers ?? []).map((player) => [player.playerId, player.eligible])),
    [roster],
  )

  const command = (action: 'SAVE' | 'SUBMIT', current: RosterWorkflowView) =>
    rosterRepository.execute(
      tournamentId,
      teamId,
      {
        action,
        expectedVersion: current.version,
        players: [...entries].map(([playerId, shirtNumber]) => ({
          playerId,
          shirtNumber: shirtNumber?.trim() || null,
        })),
      },
      createClientActionId(`roster-${action.toLowerCase()}`),
    )

  // Draft autosave: debounce edits and persist with the roster SAVE command.
  useEffect(() => {
    if (!dirty || !editable || !roster) return
    const timer = window.setTimeout(async () => {
      const current = rosterRef.current
      if (!current) return
      setAutosave('saving')
      try {
        const next = await command('SAVE', current)
        setDirty(false)
        onRosterChange(next)
        setAutosave('saved')
      } catch (issue) {
        setAutosave('error')
        setError(
          issue instanceof RosterApiError && issue.status === 409
            ? '名单已在别处更新，请关闭后重新打开'
            : issue instanceof Error
              ? issue.message
              : '自动保存失败',
        )
      }
    }, 900)
    return () => window.clearTimeout(timer)
  }, [entries, dirty, editable])

  const toggleEntry = (playerId: string) => {
    if (!editable) return
    setEntries((current) => {
      const next = new Map(current)
      if (next.has(playerId)) next.delete(playerId)
      else next.set(playerId, shirtFallback.get(playerId) ?? null)
      return next
    })
    setDirty(true)
    setError('')
  }
  const setShirt = (playerId: string, value: string) => {
    setEntries((current) => new Map(current).set(playerId, value.replace(/\D/g, '').slice(0, 2)))
    setDirty(true)
  }

  const submit = async () => {
    if (!roster || submitting) return
    const answer = await Taro.showModal({
      title: '确认大名单',
      content: `共 ${entries.size} 人，提交后由赛事管理员审核，审核期间不可修改。`,
      confirmText: '提交审核',
    })
    if (!answer.confirm) return
    setSubmitting(true)
    setError('')
    try {
      const next = await command('SUBMIT', roster)
      setDirty(false)
      onRosterChange(next)
      void Taro.showToast({ title: '已提交审核', icon: 'success' })
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : '提交失败')
    } finally {
      setSubmitting(false)
    }
  }

  const runMember = async (key: string, action: () => Promise<CaptainWorkspaceResponse>) => {
    if (busy) return
    setBusy(key)
    setError('')
    try {
      onCaptainChange(await action())
    } catch (issue) {
      setError(
        issue instanceof RosterApiError && issue.status === 409
          ? '成员资料已被他人修改，请重新打开后再试'
          : issue instanceof Error
            ? issue.message
            : '操作失败',
      )
    } finally {
      setBusy(null)
    }
  }

  const updatePosition = (member: Member, position: string) =>
    void runMember(`position:${member.id}`, () =>
      teamManagementRepository.updateMember(
        teamId,
        member.id,
        position,
        member.updatedAt,
        '队长调整成员位置',
        createClientActionId('team-member'),
      ),
    )

  const removeMember = async (member: Member) => {
    const answer = await Taro.showModal({
      title: '移出球队',
      content: `确认将 ${member.displayName} 移出球队？`,
      confirmText: '移出',
      confirmColor: '#b3261e',
    })
    if (!answer.confirm) return
    await runMember(`member:${member.id}`, () =>
      teamManagementRepository.removeMember(
        teamId,
        member.id,
        member.updatedAt,
        '队长移除球队成员',
        createClientActionId('team-member'),
      ),
    )
  }

  const review = async (applicationId: string, decision: 'APPROVED' | 'REJECTED') => {
    if (decision === 'REJECTED') {
      const answer = await Taro.showModal({
        title: '拒绝申请',
        content: '结果会通知申请人。',
        confirmText: '拒绝',
      })
      if (!answer.confirm) return
    }
    await runMember(`application:${applicationId}`, () =>
      productRepository.reviewTeamApplication(teamId, applicationId, decision),
    )
    void Taro.showToast({ title: decision === 'APPROVED' ? '已批准入队' : '已拒绝', icon: 'none' })
  }

  const members = [...captain.members].sort((a, b) => {
    const ia = a.playerId && entries.has(a.playerId) ? 0 : 1
    const ib = b.playerId && entries.has(b.playerId) ? 0 : 1
    return ia - ib || Number(b.isCaptain) - Number(a.isCaptain)
  })
  if (!stampedChecks.current && entries.size > 0) {
    stampedChecks.current = true
    members.forEach((member, index) => {
      if (member.playerId && entries.has(member.playerId)) {
        checkDelays.current.set(member.id, Math.min(index, 10) * 24)
      }
    })
  }
  const pending = captain.applications.filter((item) => item.status === 'PENDING')
  const policy = roster?.policy ?? null
  const count = entries.size
  const inRange = policy ? count >= policy.minPlayers && count <= policy.maxPlayers : false

  const state = (() => {
    if (!roster || !policy)
      return {
        tone: 'muted',
        label: '未开放报名',
        hint: rosterError || '赛事开放报名后可在这里提交大名单',
      }
    if (status === 'SUBMITTED')
      return { tone: 'pending', label: '审核中', hint: '审核通过后，阵容可用球员会同步更新' }
    if (status === 'APPROVED')
      return { tone: 'pending', label: '已通过 · 待锁定', hint: '锁定后阵容可用球员会同步更新' }
    if (status === 'LOCKED')
      return {
        tone: 'done',
        label: `已确认 v${roster.lockedSnapshot?.version ?? roster.version}`,
        hint: '阵容按此名单排兵布阵 · 补报请联系赛事管理员',
      }
    const draftLabel =
      autosave === 'saving'
        ? '草稿 · 保存中…'
        : autosave === 'error'
          ? '草稿 · 保存失败'
          : dirty
            ? '草稿 · 有改动'
            : '草稿 · 已自动保存'
    return {
      tone: status === 'RETURNED' ? 'warn' : 'draft',
      label: status === 'RETURNED' ? '已退回 · 请修改' : draftLabel,
      hint: roster.decisionReason
        ? `退回原因：${roster.decisionReason}`
        : '确认后提交审核，审核通过后阵容可用球员才会更新',
    }
  })()

  return (
    <>
      <div className={`cmx-status is-${state.tone}`}>
        <div className="cmx-status__main">
          <span className="cmx-status__pill">
            <i />
            {state.label}
          </span>
          <div className="cmx-status__meta">
            {roster ? <strong>{roster.tournamentName}</strong> : null}
            {policy ? (
              <span>
                已选 <b className={inRange ? '' : 'is-off'}>{count}</b> 人 · 需 {policy.minPlayers}–
                {policy.maxPlayers} 人 · {formatDeadline(policy.submissionDeadline)}截止
              </span>
            ) : null}
          </div>
        </div>
        <span className="cmx-status__hint">{state.hint}</span>
        <button
          type="button"
          className="cmx-btn cmx-btn--primary"
          disabled={!editable || !inRange || submitting || autosave === 'saving'}
          title={
            !editable
              ? '当前状态不可提交'
              : inRange
                ? '提交赛事管理员审核'
                : `人数需在 ${policy?.minPlayers}–${policy?.maxPlayers} 人之间`
          }
          onClick={() => void submit()}
        >
          <Icon name="check" size={14} />
          {submitting ? '提交中…' : '确认大名单'}
        </button>
      </div>
      {error ? (
        <p className="cmx-error cmx-error--block" role="alert">
          {error}
        </p>
      ) : null}
      <div className="cmx-squad">
        <div className="cmx-card cmx-roster">
          <div className="cmx-card__head">
            <h4>
              球队成员<span>{captain.members.length}</span>
            </h4>
            <span className="cmx-legend">
              <i className="is-in" />
              大名单 {count}
            </span>
          </div>
          <ul className="cmx-roster__list">
            {members.map((member) => {
              const playerId = member.playerId
              const inRoster = Boolean(playerId && entries.has(playerId))
              const shirt = playerId
                ? (entries.get(playerId) ?? shirtFallback.get(playerId) ?? null)
                : null
              const canRegister = Boolean(playerId) && (eligible.get(playerId ?? '') ?? true)
              return (
                <li key={member.id} className={`cmx-row ${inRoster ? 'is-in' : 'is-out'}`}>
                  <UserAvatar name={member.displayName} avatarUrl={member.avatarUrl} size="small" />
                  <div className="cmx-row__name">
                    <strong>{member.displayName}</strong>
                    {member.isCaptain ? <span className="cmx-tag cmx-tag--gold">队长</span> : null}
                  </div>
                  {editable && inRoster && playerId ? (
                    <label className="cmx-number" title="球衣号码">
                      #
                      <input
                        className="cmx-number__input"
                        value={shirt ?? ''}
                        inputMode="numeric"
                        maxLength={2}
                        aria-label={`${member.displayName}球衣号码`}
                        onChange={(event) => setShirt(playerId, event.target.value)}
                      />
                    </label>
                  ) : (
                    <span className="cmx-number is-static">{shirt ? `#${shirt}` : '—'}</span>
                  )}
                  <span className="cmx-select cmx-select--chip">
                    <select
                      value={member.position ?? ''}
                      aria-label={`${member.displayName}的位置`}
                      disabled={Boolean(busy)}
                      onChange={(event) => updatePosition(member, event.target.value)}
                    >
                      <option value="" disabled>
                        位置
                      </option>
                      {POSITIONS.map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                    <Icon name="chevron" size={11} />
                  </span>
                  {editable ? (
                    <button
                      type="button"
                      className={`cmx-toggle ${inRoster ? 'is-on' : ''}`}
                      style={
                        inRoster
                          ? { animationDelay: `${checkDelays.current.get(member.id) ?? 0}ms` }
                          : undefined
                      }
                      disabled={!canRegister && !inRoster}
                      title={
                        !playerId ? '尚未建立球员档案' : inRoster ? '移出大名单' : '加入大名单'
                      }
                      onClick={() => playerId && toggleEntry(playerId)}
                    >
                      {inRoster ? <Icon name="check" size={12} /> : <Icon name="plus" size={12} />}
                      {inRoster ? '已报名' : '报名'}
                    </button>
                  ) : (
                    <span className="cmx-row__state">
                      {inRoster ? null : <span className="cmx-toggle is-static">未报名</span>}
                    </span>
                  )}
                  <button
                    type="button"
                    className="cmx-row__remove"
                    title={member.isCaptain ? '队长不能移出' : '移出球队'}
                    aria-label={`将${member.displayName}移出球队`}
                    disabled={member.isCaptain || Boolean(busy)}
                    onClick={() => void removeMember(member)}
                  >
                    <Icon name="trash" size={14} />
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
        <div className="cmx-squad__side">
          <div className="cmx-card">
            <div className="cmx-card__head">
              <h4>
                入队申请{pending.length ? <span className="is-alert">{pending.length}</span> : null}
              </h4>
            </div>
            {pending.length ? (
              <ul className="cmx-apps">
                {pending.map((application) => {
                  const name = application.player?.displayName ?? application.applicant.displayName
                  const Avatar = application.player ? PlayerAvatar : UserAvatar
                  return (
                    <li key={application.id} className="cmx-app">
                      <Avatar
                        name={name}
                        avatarUrl={
                          application.player
                            ? application.player.avatarUrl
                            : application.applicant.avatarUrl
                        }
                        size="small"
                      />
                      <div className="cmx-app__text">
                        <strong>
                          {name}
                          <span className="cmx-tag">
                            {positionLabel(application.requestedPosition)}
                          </span>
                        </strong>
                        {application.message ? (
                          <small title={application.message}>{application.message}</small>
                        ) : null}
                      </div>
                      <div className="cmx-app__actions">
                        <button
                          type="button"
                          className="cmx-btn cmx-btn--ghost cmx-btn--xs"
                          disabled={Boolean(busy)}
                          onClick={() => void review(application.id, 'REJECTED')}
                        >
                          拒绝
                        </button>
                        <button
                          type="button"
                          className="cmx-btn cmx-btn--primary cmx-btn--xs"
                          disabled={Boolean(busy)}
                          onClick={() => void review(application.id, 'APPROVED')}
                        >
                          批准
                        </button>
                      </div>
                    </li>
                  )
                })}
              </ul>
            ) : (
              <div className="cmx-empty">
                <Icon name="check" size={18} />
                暂无新的入队申请
              </div>
            )}
          </div>
          <InviteCard teamId={teamId} teamName={captain.team.name} members={captain.members} />
        </div>
      </div>
    </>
  )
}

interface InviteHit {
  key: string
  kind: 'user' | 'player'
  id: string
  displayName: string
  avatarUrl: string | null
  detail: string
  member: boolean
}

function InviteCard({
  teamId,
  teamName,
  members,
}: {
  teamId: string
  teamName: string
  members: Member[]
}) {
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<InviteHit[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState<Record<string, string>>({})
  const [inviting, setInviting] = useState<string | null>(null)
  const [error, setError] = useState('')
  const seq = useRef(0)
  const memberUsers = useMemo(
    () => new Set(members.map((m) => m.userId).filter(Boolean)),
    [members],
  )
  const memberPlayers = useMemo(
    () => new Set(members.map((m) => m.playerId).filter(Boolean)),
    [members],
  )

  const search = async () => {
    const q = query.trim()
    if (!q) return
    const id = ++seq.current
    setBusy(true)
    setError('')
    try {
      // Registered users (message directory) + player profiles (public search).
      // Gap: no campus-wide student directory and no captain-side membership invite API yet;
      // invites go out as a direct message (or a tracked feedback record when DM is closed).
      const [directory, players] = await Promise.all([
        productRepository.getMessageDirectory(q).catch(() => ({
          items: [] as Array<{ id: string; displayName: string; avatarUrl: string | null }>,
        })),
        productRepository.search(q, 'PLAYER').catch(() => ({
          players: [] as Array<{
            id: string
            displayName: string
            avatarUrl: string | null
            team: { name: string } | null
            position: string | null
          }>,
        })),
      ])
      if (id !== seq.current) return
      setHits(
        [
          ...directory.items.map((user) => ({
            key: `user:${user.id}`,
            kind: 'user' as const,
            id: user.id,
            displayName: user.displayName,
            avatarUrl: user.avatarUrl,
            detail: memberUsers.has(user.id) ? '已在本队' : '晓球用户',
            member: memberUsers.has(user.id),
          })),
          ...players.players.map((player) => ({
            key: `player:${player.id}`,
            kind: 'player' as const,
            id: player.id,
            displayName: player.displayName,
            avatarUrl: player.avatarUrl,
            detail: memberPlayers.has(player.id)
              ? '已在本队'
              : [player.team?.name ?? '暂无球队', positionLabel(player.position)].join(' · '),
            member: memberPlayers.has(player.id),
          })),
        ].slice(0, 12),
      )
    } catch (issue) {
      if (id === seq.current) setError(issue instanceof Error ? issue.message : '搜索失败')
    } finally {
      if (id === seq.current) setBusy(false)
    }
  }

  const invite = async (hit: InviteHit) => {
    if (hit.kind === 'player') {
      setSent((current) => ({ ...current, [hit.key]: '待注册' }))
      void Taro.showToast({ title: '对方注册后即可申请入队', icon: 'none' })
      return
    }
    setInviting(hit.key)
    try {
      try {
        await productRepository.sendMessage(
          hit.id,
          `【入队邀请】你好，我是「${teamName}」队长，诚邀你加入球队。打开晓球 → 我的 → 加入球队即可申请，我会尽快通过。`,
          createClientActionId('team-invite'),
        )
      } catch {
        await productRepository.createReport(
          'FEEDBACK',
          `入队邀请 · ${hit.displayName}`,
          `队长邀请用户 ${hit.displayName}（userId=${hit.id}）加入「${teamName}」（teamId=${teamId}）。`,
          createClientActionId('team-invite-report'),
        )
      }
      setSent((current) => ({ ...current, [hit.key]: '已邀请' }))
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : '邀请失败')
    } finally {
      setInviting(null)
    }
  }

  return (
    <div className="cmx-card cmx-invite">
      <div className="cmx-card__head">
        <h4>邀请球员</h4>
      </div>
      <form
        className="cmx-search"
        onSubmit={(event) => {
          event.preventDefault()
          void search()
        }}
      >
        <Icon name="search" size={15} />
        <input
          className="cmx-search__input"
          value={query}
          maxLength={40}
          placeholder="输入姓名搜索用户或球员"
          aria-label="搜索姓名"
          onChange={(event) => setQuery(event.target.value)}
        />
        <button
          type="submit"
          className="cmx-btn cmx-btn--soft cmx-btn--xs"
          disabled={busy || !query.trim()}
        >
          {busy ? '搜索中' : '搜索'}
        </button>
      </form>
      {error ? <p className="cmx-error">{error}</p> : null}
      {hits === null ? null : hits.length ? (
        <ul className="cmx-hits">
          {hits.map((hit) => (
            <li key={hit.key} className="cmx-hit">
              {hit.kind === 'player' ? (
                <PlayerAvatar name={hit.displayName} avatarUrl={hit.avatarUrl} size="small" />
              ) : (
                <UserAvatar name={hit.displayName} avatarUrl={hit.avatarUrl} size="small" />
              )}
              <div className="cmx-hit__text">
                <strong>
                  {hit.displayName}
                  <span
                    className={`cmx-tag ${hit.kind === 'user' ? 'cmx-tag--green' : 'cmx-tag--blue'}`}
                  >
                    {hit.kind === 'user' ? '已注册' : '球员档案'}
                  </span>
                </strong>
                <small>{hit.detail}</small>
              </div>
              {hit.member ? (
                <span className="cmx-hit__state">队员</span>
              ) : sent[hit.key] ? (
                <span className="cmx-hit__state is-sent">{sent[hit.key]}</span>
              ) : (
                <button
                  type="button"
                  className="cmx-btn cmx-btn--soft cmx-btn--xs"
                  disabled={inviting === hit.key}
                  onClick={() => void invite(hit)}
                >
                  邀请
                </button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <div className="cmx-empty">没有找到「{query.trim()}」</div>
      )}
    </div>
  )
}
