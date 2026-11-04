import { useState } from 'react'
import type { RosterRegistrationReview } from '../adminRoster/types'
import {
  actionId,
  CommandStatus,
  displayDate,
  useWorkflowCommand,
  useWorkflowRead,
  workflowLabels,
} from './client'
import type { RosterAction, RosterWorkflow, WorkflowProps } from './types'
import './workflows.css'

export function AdminRosterReview({ context, tournamentId }: WorkflowProps) {
  const list = useWorkflowRead<{ items: RosterRegistrationReview[] }>(
    context,
    tournamentId
      ? `/admin/tournaments/${encodeURIComponent(tournamentId)}/team-registrations`
      : null,
  )
  const [selected, setSelected] = useState('')
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('ALL')
  const registrations = list.data?.items ?? []
  const current = registrations.find((item) => item.teamId === selected) ?? registrations[0]
  const visible = registrations.filter(
    (item) =>
      (filter === 'ALL' || item.rosterStatus === filter) &&
      `${item.teamName} ${item.teamCode}`.toLowerCase().includes(query.trim().toLowerCase()),
  )
  if (!tournamentId)
    return (
      <section className="mc-panel">
        <p className="mc-muted">请先选择要管理的赛事。</p>
      </section>
    )
  return (
    <div className="mc-split">
      <section className="mc-panel">
        <div className="mc-toolbar">
          <div>
            <h2>参赛名单</h2>
            <p className="mc-muted">批准、锁定与补报均保留版本。</p>
          </div>
          <button type="button" onClick={list.refresh}>
            刷新列表
          </button>
        </div>
        <div className="mc-toolbar">
          <input
            aria-label="搜索球队名单"
            placeholder="搜索球队或编号"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <select
            aria-label="名单状态"
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
          >
            <option value="ALL">全部状态</option>
            {['SUBMITTED', 'APPROVED', 'LOCKED', 'RETURNED', 'DRAFT', 'REOPENED'].map((status) => (
              <option key={status} value={status}>
                {workflowLabels[status]}
              </option>
            ))}
          </select>
        </div>
        {list.loading ? (
          <p className="mc-muted" role="status">
            正在读取报名名单…
          </p>
        ) : null}
        {list.error ? (
          <p className="mc-alert" role="alert">
            {list.error}
          </p>
        ) : null}
        <div className="mc-table-wrap">
          <table className="mc-table">
            <thead>
              <tr>
                <th>球队</th>
                <th>名单</th>
                <th>人数</th>
                <th>版本</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((item) => (
                <tr
                  key={item.registrationId}
                  className={current?.teamId === item.teamId ? 'wf-selected-row' : ''}
                >
                  <td>
                    <button
                      className="wf-text-button"
                      type="button"
                      onClick={() => setSelected(item.teamId)}
                    >
                      {item.teamName}
                    </button>
                    <small className="mc-muted">{item.teamCode}</small>
                  </td>
                  <td>
                    <span className="mc-badge">
                      {workflowLabels[item.rosterStatus ?? 'DRAFT'] ?? item.rosterStatus}
                    </span>
                  </td>
                  <td>{item.playerCount}</td>
                  <td>
                    {item.rosterSubmissionVersion === null
                      ? '—'
                      : `v${item.rosterSubmissionVersion}`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!list.loading && !list.error && !visible.length ? (
          <p className="mc-muted">当前筛选没有报名记录。</p>
        ) : null}
      </section>
      {current ? (
        <RosterDetail
          key={`${context.accessToken}:${tournamentId}:${current.teamId}`}
          context={context}
          tournamentId={tournamentId}
          teamId={current.teamId}
          onSaved={list.refresh}
        />
      ) : (
        <section className="mc-panel">
          <p className="mc-muted">选择一支球队查看名单。</p>
        </section>
      )}
    </div>
  )
}

function RosterDetail({
  context,
  tournamentId,
  teamId,
  onSaved,
}: WorkflowProps & { teamId: string; onSaved: () => void }) {
  const path = `/roster/tournaments/${encodeURIComponent(tournamentId)}/teams/${encodeURIComponent(teamId)}`
  const read = useWorkflowRead<RosterWorkflow>(context, path)
  const [reason, setReason] = useState('')
  const command = useWorkflowCommand<RosterWorkflow>(
    context,
    () => {
      read.refresh()
      onSaved()
      setReason('')
    },
    `${path}/commands`,
  )
  const [confirmation, setConfirmation] = useState<RosterAction | null>(null)
  const data = read.data
  const actions: RosterAction[] =
    data?.status === 'SUBMITTED'
      ? ['APPROVE', 'RETURN']
      : data?.status === 'APPROVED'
        ? ['LOCK', 'RETURN']
        : data?.status === 'LOCKED'
          ? ['REOPEN']
          : []
  const submit = () => {
    if (!data || !confirmation) return
    const action = confirmation
    setConfirmation(null)
    void command.run({
      path: `${path}/commands`,
      headers: { 'Idempotency-Key': actionId() },
      body: {
        action,
        expectedVersion: data.version,
        ...(reason.trim() ? { reason: reason.trim() } : {}),
      },
    })
  }
  return (
    <section className="mc-panel mc-detail">
      <div className="mc-toolbar">
        <h2>{data?.teamName ?? '名单详情'}</h2>
        <button type="button" disabled={command.locked} onClick={read.refresh}>
          刷新详情
        </button>
      </div>
      {read.loading ? (
        <p className="mc-muted" role="status">
          正在读取球队名单…
        </p>
      ) : null}
      {read.error ? (
        <p className="mc-alert" role="alert">
          {read.error}
        </p>
      ) : null}
      {data ? (
        <>
          <div className="wf-facts">
            <span className="mc-badge">{workflowLabels[data.status] ?? data.status}</span>
            <span>当前 v{data.version}</span>
            <span>报名：{data.registrationStatus}</span>
          </div>
          {data.policy ? (
            <p className="mc-muted">
              名单 {data.policy.minPlayers}–{data.policy.maxPlayers} 人 · 提交期限{' '}
              {displayDate(data.policy.submissionDeadline)}
            </p>
          ) : (
            <p className="mc-alert">赛事尚未配置完整的名单人数、资格及提交期限，审核暂不可执行。</p>
          )}
          {data.decisionReason ? (
            <p className="mc-alert">上次处理说明：{data.decisionReason}</p>
          ) : null}
          <div className="mc-table-wrap">
            <table className="mc-table">
              <thead>
                <tr>
                  <th>号码</th>
                  <th>球员</th>
                  <th>资格</th>
                </tr>
              </thead>
              <tbody>
                {data.players.map((player) => (
                  <tr key={player.playerId}>
                    <td>{player.shirtNumber ?? '未填写'}</td>
                    <td>{player.displayName}</td>
                    <td>
                      {data.availablePlayers.some(
                        (item) => item.playerId === player.playerId && item.eligible,
                      )
                        ? '已通过'
                        : '需核对'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!data.players.length ? <p className="mc-muted">此名单尚未加入球员。</p> : null}
          {data.lockedSnapshot ? (
            <details className="wf-history">
              <summary>
                锁定快照 v{data.lockedSnapshot.version} · {data.lockedSnapshot.players.length} 人
              </summary>
              <ul>
                {data.lockedSnapshot.players.map((player) => (
                  <li key={player.id}>
                    {player.shirtNumber ?? '—'} · {player.displayName}
                  </li>
                ))}
              </ul>
              <p className="mc-muted">开放补报会创建后续版本，此快照继续保留。</p>
            </details>
          ) : null}
          <label className="mc-field">
            处理原因
            <textarea
              maxLength={500}
              value={reason}
              aria-label="处理原因"
              disabled={command.locked}
              onChange={(event) => setReason(event.target.value)}
              placeholder="退回或开放补报时必填，说明需核对的事项"
            />
          </label>
          <div className="mc-actions">
            {actions.map((action) => (
              <button
                key={action}
                type="button"
                disabled={
                  command.locked ||
                  !data.policy ||
                  ['WITHDRAWN', 'SUSPENDED'].includes(data.registrationStatus) ||
                  (['RETURN', 'REOPEN'].includes(action) && !reason.trim())
                }
                onClick={() => setConfirmation(action)}
              >
                {workflowLabels[action]}名单
              </button>
            ))}
          </div>
          {!actions.length ? (
            <p className="mc-muted">队长保存并提交后，管理员可在此审核。</p>
          ) : null}
          {confirmation ? (
            <div className="mc-alert" role="alertdialog" aria-label="确认名单操作">
              <p>
                确认{workflowLabels[confirmation]}「{data.teamName}」的 v{data.version} 名单？
                {confirmation === 'LOCK' ? '锁定后比赛报告会绑定此名单快照。' : ''}
              </p>
              <div className="mc-actions">
                <button type="button" onClick={submit}>
                  确认操作
                </button>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => setConfirmation(null)}
                >
                  取消
                </button>
              </div>
            </div>
          ) : null}
        </>
      ) : null}
      <CommandStatus command={command} />
    </section>
  )
}
