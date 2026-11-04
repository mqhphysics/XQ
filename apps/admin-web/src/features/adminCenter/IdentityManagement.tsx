import { useRef, useState } from 'react'
import { requireAdminApi } from '../adminAuth/config'
import { requestAdmin } from '../adminAuth/request'
import type { OrganizationContext } from '../adminSchedule/types'
import { DataState, message, time, useAdminData } from './shared'
import './identity-management.css'

const KINDS = {
  STUDENT: '学生',
  PLAYER: '球员',
  TEAM_CAPTAIN: '队长',
  TEAM_COACH: '教练',
  MATCH_REPORTER: '信息管理员',
  TOURNAMENT_ADMIN: '赛事管理员',
} as const
type Kind = keyof typeof KINDS
type Named = { id: string; name: string }
interface IdentityRecord {
  id: string
  kind: Kind
  displayName: string
  scopeType: string
  scopeId: string
  teamId: string | null
  team: { name: string } | null
  status: string
  linkedUserId: string | null
  version: number
  awaitingConfirmation?: boolean
}
interface Registry {
  items: IdentityRecord[]
  teams: Named[]
  players: { id: string; displayName: string }[]
  tournaments: Named[]
  matches: { id: string; matchCode: string }[]
  users?: { id: string; displayName: string; realName: string | null }[]
}
interface Application {
  id: string
  kind: Kind
  teamId: string | null
  candidateId: string | null
  message: string
  status: string
  version: number
  createdAt: string
  decisionNote: string | null
  team: { name: string } | null
  user: { id: string; displayName: string; realName: string | null }
}

export function IdentityManagement({ context }: { context: OrganizationContext }) {
  const records = useAdminData<Registry>(context, '/admin/identity/records')
  const applications = useAdminData<{ items: Application[]; hasMorePending: boolean }>(
    context,
    '/admin/identity/applications',
  )
  const [kind, setKind] = useState<Kind>('TEAM_COACH'),
    [name, setName] = useState(''),
    [teamId, setTeamId] = useState(''),
    [playerId, setPlayerId] = useState(''),
    [scopeType, setScopeType] = useState('TOURNAMENT'),
    [scopeId, setScopeId] = useState(''),
    [reason, setReason] = useState('')
  const [verifiedUserId, setVerifiedUserId] = useState('')
  const [recordUsers, setRecordUsers] = useState<Record<string, string>>({})
  const [recordReasons, setRecordReasons] = useState<Record<string, string>>({})
  const [notes, setNotes] = useState<Record<string, string>>({}),
    [choices, setChoices] = useState<Record<string, string>>({}),
    [error, setError] = useState(''),
    [busy, setBusy] = useState('')
  const [scopes, setScopes] = useState<Record<string, string>>({})
  const pending = useRef<{ fingerprint: string; key: string } | null>(null)
  const mutate = async (path: string, body: object, label: string) => {
    if (busy) return false
    setError('')
    setBusy(label)
    const fingerprint = JSON.stringify([path, body])
    if (pending.current?.fingerprint !== fingerprint)
      pending.current = { fingerprint, key: crypto.randomUUID() }
    try {
      await requestAdmin(requireAdminApi(), context, path, {
        method: 'POST',
        body,
        headers: { 'Idempotency-Key': pending.current.key },
      })
      pending.current = null
      records.refresh()
      if (label && label !== '录入任职') applications.update(current => current && ({ ...current,
        items: current.items.filter(item => item.id !== label),
      }))
      else applications.refresh()
      return true
    } catch (issue) {
      setError(message(issue))
      return false
    } finally {
      setBusy('')
    }
  }
  const create = async () => {
    const body = {
      kind,
      displayName: name.trim(),
      reason: reason.trim(),
      ...(verifiedUserId ? { verifiedUserId } : {}),
      ...(['TEAM_COACH', 'TEAM_CAPTAIN'].includes(kind) ? { teamId } : {}),
      ...(kind === 'PLAYER' ? { playerProfileId: playerId } : {}),
      ...(kind === 'MATCH_REPORTER' || kind === 'TOURNAMENT_ADMIN' ? { scopeType, scopeId } : {}),
    }
    if (await mutate('/admin/identity/records', body, '录入任职')) {
      setName('')
      setReason('')
      setVerifiedUserId('')
    }
  }
  const review = (a: Application, decision: 'APPROVED' | 'REJECTED') => {
    const selected = choices[a.id] ?? a.candidateId ?? ''
    return mutate(
      `/admin/identity/applications/${a.id}/review`,
      {
        decision,
        expectedVersion: a.version,
        note: notes[a.id]?.trim() ?? '',
        ...(selected && decision === 'APPROVED' ? { resolvedCandidateId: selected } : {}),
        ...(!selected && decision === 'APPROVED' && scopes[a.id] ? {
          scopeType: scopes[a.id]!.split(':')[0], scopeId: scopes[a.id]!.split(':')[1],
        } : {}),
      },
      a.id,
    )
  }
  return (
    <section className="mc-identity">
      <div className="mc-section-title">
        <div>
          <h2>身份认证与任职</h2>
          <p>姓名仅用于候选提示。核对真实报名记录或任职来源，再批准申请；教练不必建立球员档案。</p>
        </div>
      </div>
      {error && (
        <p className="mc-identity-error" role="alert">
          {error}
        </p>
      )}
      <DataState {...records} onRetry={records.refresh} />
      <details className="workspace-identity-tools">
        <summary>
          直接登记身份或任职 <span>用于已有核实依据的名单</span>
        </summary>
        <form
          className="mc-identity-create"
          onSubmit={(e) => {
            e.preventDefault()
            void create()
          }}
        >
          <h3>录入身份名单</h3>
          <label>
            身份
            <select
              value={kind}
              onChange={(e) => {
                setKind(e.target.value as Kind)
                if (e.target.value === 'TOURNAMENT_ADMIN') setScopeType('TOURNAMENT')
                setTeamId('')
                setScopeId('')
              }}
            >
              {Object.entries(KINDS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label>
            姓名
            <input
              required
              minLength={2}
              maxLength={120}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <label>
            已核验的账号（可选）
            <select
              value={verifiedUserId}
              onChange={(event) => {
                setVerifiedUserId(event.target.value)
                const user = records.data?.users?.find((item) => item.id === event.target.value)
                if (user?.realName) setName(user.realName)
              }}
            >
              <option value="">尚未核验账号，由申请流程人工核实</option>
              {records.data?.users?.map((user) => (
                <option key={user.id} value={user.id} disabled={!user.realName}>
                  {user.realName ?? user.displayName} · {user.displayName}
                </option>
              ))}
            </select>
            <small>仅在核实账号本人及身份依据后选择。该账号可匹配此记录，确认后完成认证。</small>
          </label>
          {['TEAM_COACH', 'TEAM_CAPTAIN'].includes(kind) && (
            <label>
              球队
              <select required value={teamId} onChange={(e) => setTeamId(e.target.value)}>
                <option value="">选择球队</option>
                {records.data?.teams.map((team) => (
                  <option key={team.id} value={team.id}>
                    {team.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          {kind === 'PLAYER' && (
            <label>
              球员档案
              <select required value={playerId} onChange={(e) => setPlayerId(e.target.value)}>
                <option value="">选择档案</option>
                {records.data?.players.map((player) => (
                  <option key={player.id} value={player.id}>
                    {player.displayName} · {player.id.slice(-6)}
                  </option>
                ))}
              </select>
            </label>
          )}
          {(kind === 'MATCH_REPORTER' || kind === 'TOURNAMENT_ADMIN') && (
            <>
              <label>
                录入范围
                <select
                  value={scopeType}
                  onChange={(e) => {
                    setScopeType(e.target.value)
                    setScopeId('')
                  }}
                >
                  <option value="TOURNAMENT">指定赛事</option>
                  {kind !== 'TOURNAMENT_ADMIN' && <option value="MATCH">指定比赛</option>}
                </select>
              </label>
              <label>
                授权对象
                <select required value={scopeId} onChange={(e) => setScopeId(e.target.value)}>
                  <option value="">选择对象</option>
                  {scopeType === 'TOURNAMENT'
                    ? records.data?.tournaments.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name}
                        </option>
                      ))
                    : records.data?.matches.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.matchCode}
                        </option>
                      ))}
                </select>
              </label>
            </>
          )}
          <label className="mc-identity-wide">
            来源与录入原因
            <textarea
              required
              minLength={8}
              maxLength={1000}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="记录可核验的名单或任职来源"
            />
          </label>
          <button className="mc-primary" type="submit" disabled={!!busy}>
            {busy === '录入任职' ? '正在录入…' : '录入名单'}
          </button>
        </form>
      </details>
      <h3>认证申请</h3>
      <DataState {...applications} onRetry={applications.refresh} />
      {applications.data?.hasMorePending && (
        <p>当前显示最早的200条待审核申请，处理后刷新可继续查看。</p>
      )}
      <div className="mc-identity-applications">
        {applications.data?.items.map((a) => (
          <article key={a.id}>
            <header>
              <strong>
                {a.user.realName || a.user.displayName} · {KINDS[a.kind]}
                {a.team ? ` · ${a.team.name}` : ''}
              </strong>
              <span>
                {
                  (
                    { PENDING: '待审核', APPROVED: '已批准', REJECTED: '未通过' } as Record<
                      string,
                      string
                    >
                  )[a.status]
                }
              </span>
            </header>
            <small>
              {time(a.createdAt)} · 版本 {a.version}
            </small>
            <p>{a.message}</p>
            {a.status === 'PENDING' ? (
              <>
                <label>
                  核实后的名单对象
                  <select
                    value={choices[a.id] ?? a.candidateId ?? ''}
                    onChange={(e) =>
                      setChoices((current) => ({ ...current, [a.id]: e.target.value }))
                    }
                  >
                    <option value="">先选择已核实记录</option>
                    {a.candidateId && (
                      <option value={a.candidateId}>申请人选择的候选（请独立核验）</option>
                    )}
                    {records.data?.items
                      .filter(
                        (r) =>
                          r.kind === a.kind &&
                          r.status === 'ACTIVE' &&
                          (!r.linkedUserId || r.linkedUserId === a.user.id) &&
                          (!a.teamId || r.teamId === a.teamId),
                      )
                      .map((r) => (
                        <option key={r.id} value={`record:${r.id}`}>
                          {r.displayName} · {r.team?.name ?? r.scopeType} · {r.id.slice(-6)}
                        </option>
                      ))}
                    {a.kind === 'PLAYER' &&
                      records.data?.players.map((p) => (
                        <option key={p.id} value={`player:${p.id}`}>
                          {p.displayName} · {p.id.slice(-6)}
                        </option>
                      ))}
                  </select>
                </label>
                {['MATCH_REPORTER', 'TOURNAMENT_ADMIN'].includes(a.kind) && !(choices[a.id] ?? a.candidateId) && (
                  <label>授权范围
                    <select aria-label={`${a.user.realName || a.user.displayName}的授权范围`}
                      value={scopes[a.id] ?? ''} onChange={e => setScopes(current => ({ ...current, [a.id]: e.target.value }))}>
                      <option value="">选择赛事或比赛</option>
                      {records.data?.tournaments.map(item => <option key={item.id} value={`TOURNAMENT:${item.id}`}>{item.name}</option>)}
                      {a.kind === 'MATCH_REPORTER' && records.data?.matches.map(item => <option key={item.id} value={`MATCH:${item.id}`}>{item.matchCode}</option>)}
                    </select>
                  </label>
                )}
                <label>
                  审核说明（拒绝时必填）
                  <textarea
                    minLength={2}
                    maxLength={1000}
                    value={notes[a.id] ?? ''}
                    onChange={(e) =>
                      setNotes((current) => ({ ...current, [a.id]: e.target.value }))
                    }
                    placeholder="通过可留空；拒绝时说明原因"
                  />
                </label>
                <div>
                  <button
                    className="mc-primary"
                    disabled={!!busy}
                    onClick={() => void review(a, 'APPROVED')}
                  >
                    批准认证
                  </button>
                  <button disabled={!!busy} onClick={() => void review(a, 'REJECTED')}>
                    拒绝申请
                  </button>
                </div>
              </>
            ) : (
              <p>审核说明：{a.decisionNote}</p>
            )}
          </article>
        ))}
        {applications.data?.items.length === 0 && <p>暂无认证申请。</p>}
      </div>
      <details className="workspace-identity-tools">
        <summary>查看与调整已有任职名单</summary>
        <h3>任职名单</h3>
        <div className="mc-identity-records">
          {records.data?.items.map((r) => (
            <article key={r.id}>
              <div>
                <strong>
                  {r.displayName} · {KINDS[r.kind]}
                </strong>
                <p>
                  {r.team?.name ?? r.scopeType} · {r.linkedUserId ? '已关联账号' : '待认领'} ·{' '}
                  {r.awaitingConfirmation
                    ? '已核验，待本人确认'
                    : r.status === 'ACTIVE'
                      ? '有效'
                      : '已撤销'}
                </p>
              </div>
              {r.status === 'ACTIVE' && !r.linkedUserId && (
                <div className="mc-identity-verify">
                  <select
                    aria-label={`核验${r.displayName}的账号`}
                    value={recordUsers[r.id] ?? ''}
                    onChange={(event) =>
                      setRecordUsers((current) => ({ ...current, [r.id]: event.target.value }))
                    }
                  >
                    <option value="">选择已核验账号</option>
                    {records.data?.users
                      ?.filter((user) => user.realName === r.displayName)
                      .map((user) => (
                        <option key={user.id} value={user.id}>
                          {user.realName} · {user.displayName}
                        </option>
                      ))}
                  </select>
                  <input
                    aria-label={`核验${r.displayName}的依据`}
                    minLength={8}
                    maxLength={1000}
                    placeholder="填写核实依据（至少8个字）"
                    value={recordReasons[r.id] ?? ''}
                    onChange={(event) =>
                      setRecordReasons((current) => ({ ...current, [r.id]: event.target.value }))
                    }
                  />
                  <button
                    disabled={
                      !!busy || !recordUsers[r.id] || (recordReasons[r.id]?.trim().length ?? 0) < 8
                    }
                    onClick={() =>
                      void mutate(
                        `/admin/identity/records/${r.id}/verify-user`,
                        {
                          verifiedUserId: recordUsers[r.id],
                          expectedVersion: r.version,
                          reason: recordReasons[r.id]?.trim(),
                        },
                        r.id,
                      )
                    }
                  >
                    核验并关联账号
                  </button>
                </div>
              )}
              {r.status === 'ACTIVE' &&
                ['TEAM_COACH', 'TEAM_CAPTAIN', 'MATCH_REPORTER'].includes(r.kind) && (
                  <button
                    disabled={!!busy}
                    onClick={() => {
                      const reason = window.prompt(
                        '填写撤销任职的原因（至少8个字）；相关管理权限将立即撤销。',
                      )
                      if (reason)
                        void mutate(
                          `/admin/identity/records/${r.id}/revoke`,
                          { expectedVersion: r.version, reason },
                          r.id,
                        )
                    }}
                  >
                    撤销任职
                  </button>
                )}
            </article>
          ))}
        </div>
      </details>
    </section>
  )
}
