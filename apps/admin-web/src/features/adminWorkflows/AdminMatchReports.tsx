import { useEffect, useState } from 'react'
import {
  actionId,
  CommandStatus,
  displayDate,
  useWorkflowCommand,
  useWorkflowRead,
  workflowLabels,
} from './client'
import {
  copyReport,
  createReportCommand,
  emptyReport,
  reportChanges,
  validateReportCommand,
} from './report.logic'
import type {
  EventKind,
  ReportAction,
  ReportFields,
  ReportHistory,
  ReportRevision,
  ReportSide,
  ReportWorkspace,
  WorkflowProps,
} from './types'
import './workflows.css'

interface MatchSummary {
  id: string
  tournamentId: string
  title?: string
  status: string
  homeTeam?: { name: string }
  awayTeam?: { name: string }
  scheduledStartAt?: string | null
}
const matchLabels: Record<string, string> = {
  DRAFT: '赛程草稿',
  SCHEDULED: '未开始',
  LIVE: '进行中',
  FINISHED: '已结束',
  POSTPONED: '延期',
  CANCELLED: '取消',
}

export function AdminMatchReports({ context, tournamentId, matches }: WorkflowProps) {
  const snapshot = useWorkflowRead<{ matches: MatchSummary[] }>(
    context,
    tournamentId ? '/admin/schedule-workbench' : null,
  )
  const [selected, setSelected] = useState('')
  const [query, setQuery] = useState('')
  const [unsaved, setUnsaved] = useState(false)
  useEffect(() => {
    if (!unsaved) return
    const leave = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    const confirmNavigation = (event: MouseEvent) => {
      if (!(event.target instanceof Element)) return
      const anchor = event.target.closest<HTMLAnchorElement>('.mc-shell a[href]')
      const tab = event.target.closest<HTMLButtonElement>('.mc-shell .mc-tabs button')
      const logout = event.target.closest('.mc-shell .mc-logout')
      const leaving =
        (anchor && anchor.target !== '_blank' && anchor.href !== window.location.href) ||
        (tab && !tab.classList.contains('active')) ||
        logout
      if (leaving && !window.confirm('当前战报有尚未保存的修改。确认离开并放弃本机编辑？')) {
        event.preventDefault()
        event.stopPropagation()
      }
    }
    const tournamentSelect = document.querySelector<HTMLSelectElement>('.mc-shell .mc-scope select')
    const previousTournament = tournamentSelect?.value
    const confirmTournament = (event: Event) => {
      const select = event.target
      if (!(select instanceof HTMLSelectElement) || !select.matches('.mc-shell .mc-scope select'))
        return
      if (!window.confirm('当前战报有尚未保存的修改。确认切换赛事并放弃本机编辑？')) {
        if (previousTournament !== undefined) select.value = previousTournament
        event.preventDefault()
        event.stopPropagation()
      }
    }
    window.addEventListener('beforeunload', leave)
    document.addEventListener('click', confirmNavigation, true)
    document.addEventListener('change', confirmTournament, true)
    return () => {
      window.removeEventListener('beforeunload', leave)
      document.removeEventListener('click', confirmNavigation, true)
      document.removeEventListener('change', confirmTournament, true)
    }
  }, [unsaved])
  const all: MatchSummary[] = (snapshot.data?.matches ?? matches ?? []).filter(
    (match) => match.tournamentId === tournamentId,
  )
  const current = all.find((match) => match.id === selected) ?? all[0]
  const visible = all.filter((match) =>
    `${match.title ?? ''} ${match.homeTeam?.name ?? ''} ${match.awayTeam?.name ?? ''} ${match.id}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  )
  if (!tournamentId)
    return (
      <section className="mc-panel">
        <p className="mc-muted">请先选择要管理的赛事。</p>
      </section>
    )
  return (
    <div className="mc-split wf-report-layout">
      <section className="mc-panel">
        <div className="mc-toolbar">
          <div>
            <h2>比赛与战报</h2>
            <p className="mc-muted">保存、提交和审核均创建新版本。</p>
          </div>
          <button type="button" onClick={snapshot.refresh}>
            刷新比赛
          </button>
        </div>
        <input
          className="wf-search"
          aria-label="搜索比赛战报"
          placeholder="搜索比赛或球队"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        {snapshot.loading ? (
          <p className="mc-muted" role="status">
            正在读取比赛…
          </p>
        ) : null}
        {snapshot.error ? (
          <p className="mc-alert" role="alert">
            {snapshot.error}
          </p>
        ) : null}
        <div className="wf-match-list">
          {visible.map((match) => (
            <button
              type="button"
              key={match.id}
              className={`wf-match-card ${current?.id === match.id ? 'is-selected' : ''}`}
              onClick={() => {
                if (match.id === current?.id) return
                if (
                  unsaved &&
                  !window.confirm('当前战报有尚未保存的修改。确认切换比赛并放弃本机编辑？')
                )
                  return
                setUnsaved(false)
                setSelected(match.id)
              }}
            >
              <span className="mc-badge">{matchLabels[match.status] ?? match.status}</span>
              <strong>
                {match.title ??
                  `${match.homeTeam?.name ?? '主队'} vs ${match.awayTeam?.name ?? '客队'}`}
              </strong>
              <small>
                {match.scheduledStartAt ? displayDate(match.scheduledStartAt) : '开球时间待定'}
              </small>
            </button>
          ))}
        </div>
        {!snapshot.loading && !visible.length ? (
          <p className="mc-muted">当前赛事没有符合条件的比赛。</p>
        ) : null}
      </section>
      {current ? (
        <ReportDetail
          key={`${context.accessToken}:${current.id}`}
          context={context}
          tournamentId={tournamentId}
          matchId={current.id}
          onDirty={setUnsaved}
        />
      ) : (
        <section className="mc-panel">
          <p className="mc-muted">选择比赛后查看报告、审核及历史。</p>
        </section>
      )}
    </div>
  )
}

function ReportDetail({
  context,
  matchId,
  onDirty,
}: WorkflowProps & { matchId: string; onDirty: (dirty: boolean) => void }) {
  const path = `/matches/${encodeURIComponent(matchId)}/report`
  const read = useWorkflowRead<ReportWorkspace>(context, path)
  const [saved, setSaved] = useState<ReportWorkspace | null>(null)
  const data = read.error ? null : (saved ?? read.data)
  const [fields, setFields] = useState<ReportFields>(emptyReport)
  const [baseVersion, setBaseVersion] = useState(0)
  const [reason, setReason] = useState('')
  const [dirty, setDirty] = useState(false)
  const [localError, setLocalError] = useState('')
  const [confirmation, setConfirmation] = useState<ReportAction | null>(null)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [detailView, setDetailView] = useState<'result' | 'events'>('result')
  const hasUnsaved = dirty || Boolean(reason.trim())
  useEffect(() => {
    onDirty(hasUnsaved)
    return () => onDirty(false)
  }, [hasUnsaved, onDirty])
  const command = useWorkflowCommand<ReportWorkspace>(
    context,
    (result) => {
      setSaved(result)
      setFields(result.latest ? copyReport(result.latest.fields) : emptyReport())
      setBaseVersion(result.reportVersion)
      setReason('')
      setDirty(false)
      setLocalError('')
      read.refresh()
    },
    path,
  )
  useEffect(() => {
    if (!read.data) return
    setSaved(read.data)
    if (!dirty) {
      setFields(read.data.latest ? copyReport(read.data.latest.fields) : emptyReport())
      setBaseVersion(read.data.reportVersion)
    }
    // A refresh never silently replaces the operator's unsaved fields.
  }, [read.data])
  const update = (next: ReportFields) => {
    setFields(next)
    setDirty(true)
    setLocalError('')
  }
  const refresh = () => {
    read.refresh()
    setLocalError('')
  }
  const cancel = () => {
    if (dirty && !window.confirm('取消本机尚未保存的修改，恢复服务器最新报告？')) return
    setFields(data?.latest ? copyReport(data.latest.fields) : emptyReport())
    setBaseVersion(data?.reportVersion ?? 0)
    setReason('')
    setDirty(false)
    setConfirmation(null)
    setLocalError('')
  }
  const prepare = (action: ReportAction) => {
    if (!data) return
    if (['CONFIRM', 'RETURN', 'CORRECT'].includes(action) && dirty) {
      setLocalError('请先取消或保存当前编辑，再操作服务器中的已提交版本。')
      return
    }
    const problem = validateReportCommand(data, action, fields, reason)
    if (problem) {
      setLocalError(problem)
      return
    }
    setLocalError('')
    if (action === 'SAVE') void send(action)
    else setConfirmation(action)
  }
  const send = async (action: ReportAction) => {
    if (!data) return
    setConfirmation(null)
    await command.run({
      path,
      body: createReportCommand(data, action, fields, reason, baseVersion, actionId()),
    })
  }
  const editable = Boolean(data?.permissions.canEdit) && !command.locked
  const actions: { action: ReportAction; allowed: boolean }[] = data
    ? [
        { action: 'SAVE', allowed: data.permissions.canEdit },
        { action: 'SUBMIT', allowed: data.permissions.canSubmit },
        { action: 'RETURN', allowed: data.permissions.canReturn },
        { action: 'CONFIRM', allowed: data.permissions.canConfirm },
        { action: 'CORRECT', allowed: data.permissions.canCorrect },
      ]
    : []
  return (
    <section className="mc-panel mc-detail">
      <div className="mc-toolbar">
        <div>
          <h2>{data?.title ?? '战报详情'}</h2>
          <p className="mc-muted">
            {data ? `${data.homeTeam.name} vs ${data.awayTeam.name}` : '正在核对比赛权限'}
          </p>
        </div>
        <button type="button" disabled={command.locked || read.loading} onClick={refresh}>
          刷新版本
        </button>
      </div>
      {read.loading ? (
        <p className="mc-muted" role="status">
          正在读取比赛报告…
        </p>
      ) : null}
      {read.error ? (
        <p className="mc-alert" role="alert">
          {read.error}
          {hasUnsaved ? ' 本机未保存的内容仍保留，请成功重读并核对后继续。' : ''}
        </p>
      ) : null}
      {data ? (
        <>
          <div className="wf-facts">
            <span className="mc-badge">{workflowLabels[data.latest?.status ?? 'DRAFT']}</span>
            <span>报告 v{data.reportVersion}</span>
            <span>
              {data.confirmedReportVersion !== null
                ? `正式结果 v${data.confirmedReportVersion}`
                : '尚无 V2 确认报告'}
            </span>
            {dirty ? <span className="wf-draft">有未保存的本机修改</span> : null}
          </div>
          <div className="wf-official-result">
            <span>
              {data.confirmedReportVersion !== null ? '当前正式比分' : '现存比分（未经过 V2 确认）'}
            </span>
            <strong>
              {data.officialResult.homeScore ?? '—'} : {data.officialResult.awayScore ?? '—'}
            </strong>
            {data.officialResult.homePenaltyScore !== null ? (
              <small>
                点球 {data.officialResult.homePenaltyScore} : {data.officialResult.awayPenaltyScore}
              </small>
            ) : null}
          </div>
          {data.blockingReasons?.length ? (
            <div className="mc-alert" role="alert">
              <strong>当前暂不能录入或确认</strong>
              <ul>
                {data.blockingReasons.map((message) => (
                  <li key={message}>{message}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {data.reviewNote ? <p className="mc-alert">退回说明：{data.reviewNote}</p> : null}
          {dirty && baseVersion !== data.reportVersion ? (
            <p className="mc-alert" role="alert">
              服务器已更新至 v{data.reportVersion}，当前编辑基于 v{baseVersion}
              。你的本机修改仍保留；请先核对历史，再取消编辑以读取新版本。
            </p>
          ) : null}
          <div className="wf-subtabs" role="group" aria-label="战报详情内容">
            <button
              className={detailView === 'result' && !historyOpen ? 'active' : ''}
              onClick={() => {
                setDetailView('result')
                setHistoryOpen(false)
              }}
            >
              比分与判定
            </button>
            <button
              className={detailView === 'events' && !historyOpen ? 'active' : ''}
              onClick={() => {
                setDetailView('events')
                setHistoryOpen(false)
              }}
            >
              比赛事件（{fields.events.length}）
            </button>
            <button
              disabled={!data.permissions.canViewHistory}
              className={historyOpen ? 'active' : ''}
              onClick={() => setHistoryOpen(true)}
            >
              版本历史
            </button>
          </div>
          {!data.latest && Boolean(data.blockingReasons?.length) && !historyOpen ? <p className="mc-muted mc-setup-note">当前先查看现存比赛资料。完成上方赛事配置后，再创建新的战报；未录入的比分不会显示成 0:0。</p> : null}
          <fieldset className="wf-report-fields" disabled={!editable} hidden={historyOpen || (!data.latest && Boolean(data.blockingReasons?.length))}>
            <legend>比赛结果与事件</legend>
            <div hidden={detailView !== 'result'}>
              <div className="wf-score-grid">
                <label className="mc-field">
                  主队普通比分
                  <input
                    inputMode="numeric"
                    aria-label="主队普通比分"
                    maxLength={2}
                    value={fields.homeScore}
                    onChange={(event) => update({ ...fields, homeScore: event.target.value })}
                  />
                </label>
                <label className="mc-field">
                  客队普通比分
                  <input
                    inputMode="numeric"
                    maxLength={2}
                    value={fields.awayScore}
                    aria-label="客队普通比分"
                    onChange={(event) => update({ ...fields, awayScore: event.target.value })}
                  />
                </label>
                <label className="mc-field">
                  主队点球
                  <input
                    inputMode="numeric"
                    maxLength={2}
                    value={fields.homePenaltyScore}
                    onChange={(event) =>
                      update({ ...fields, homePenaltyScore: event.target.value })
                    }
                    placeholder="无点球留空"
                  />
                </label>
                <label className="mc-field">
                  客队点球
                  <input
                    inputMode="numeric"
                    maxLength={2}
                    value={fields.awayPenaltyScore}
                    onChange={(event) =>
                      update({ ...fields, awayPenaltyScore: event.target.value })
                    }
                    placeholder="无点球留空"
                  />
                </label>
              </div>
              <label className="mc-field">
                比赛判定
                <select
                  value={fields.outcome}
                  onChange={(event) =>
                    update({ ...fields, outcome: event.target.value as ReportFields['outcome'] })
                  }
                >
                  {['FINISHED', 'HOME_FORFEIT', 'AWAY_FORFEIT', 'ABANDONED'].map((outcome) => (
                    <option key={outcome} value={outcome}>
                      {workflowLabels[outcome]}
                    </option>
                  ))}
                </select>
              </label>
              <p className="mc-muted">
                点球大战单独记录；弃权比分按已发布规程核对。中止比赛不会当作双方弃权。
              </p>
            </div>
            <div hidden={detailView !== 'events'}>
              <div className="mc-toolbar">
                <h3>
                  事件时间线 <small className="mc-muted">{fields.events.length} 条</small>
                </h3>
                <button
                  type="button"
                  disabled={fields.events.length >= 500}
                  onClick={() =>
                    update({
                      ...fields,
                      events: [
                        ...fields.events,
                        {
                          clientEventId: actionId(),
                          kind: 'GOAL',
                          side: 'HOME',
                          minute: '0',
                          addedMinute: '',
                          playerId: '',
                          relatedPlayerId: '',
                        },
                      ],
                    })
                  }
                >
                  添加事件
                </button>
              </div>
              <div className="wf-events">
                {fields.events.map((event, index) => {
                  const players =
                    event.side === 'HOME' ? data.homeTeam.players : data.awayTeam.players
                  const change = (values: Partial<typeof event>) =>
                    update({
                      ...fields,
                      events: fields.events.map((item) =>
                        item.clientEventId === event.clientEventId ? { ...item, ...values } : item,
                      ),
                    })
                  return (
                    <div className="wf-event" key={event.clientEventId}>
                      <div className="wf-event-head">
                        <strong>事件 {index + 1}</strong>
                        <button
                          type="button"
                          className="wf-text-button"
                          onClick={() =>
                            update({
                              ...fields,
                              events: fields.events.filter(
                                (item) => item.clientEventId !== event.clientEventId,
                              ),
                            })
                          }
                        >
                          移除
                        </button>
                      </div>
                      <div className="wf-event-grid">
                        <label className="mc-field">
                          类型
                          <select
                            aria-label="类型"
                            value={event.kind}
                            onChange={(input) =>
                              change({ kind: input.target.value as EventKind, relatedPlayerId: '' })
                            }
                          >
                            {['GOAL', 'OWN_GOAL', 'YELLOW_CARD', 'RED_CARD', 'SUBSTITUTION'].map(
                              (kind) => (
                                <option key={kind} value={kind}>
                                  {workflowLabels[kind]}
                                </option>
                              ),
                            )}
                          </select>
                        </label>
                        <label className="mc-field">
                          球队
                          <select
                            value={event.side}
                            aria-label="球队"
                            onChange={(input) =>
                              change({
                                side: input.target.value as ReportSide,
                                playerId: '',
                                relatedPlayerId: '',
                              })
                            }
                          >
                            <option value="HOME">{data.homeTeam.name}</option>
                            <option value="AWAY">{data.awayTeam.name}</option>
                          </select>
                        </label>
                        <label className="mc-field">
                          分钟
                          <input
                            inputMode="numeric"
                            maxLength={3}
                            value={event.minute}
                            aria-label="分钟"
                            onChange={(input) => change({ minute: input.target.value })}
                          />
                        </label>
                        <label className="mc-field">
                          补时
                          <input
                            inputMode="numeric"
                            maxLength={2}
                            value={event.addedMinute}
                            aria-label="补时"
                            onChange={(input) => change({ addedMinute: input.target.value })}
                            placeholder="可留空"
                          />
                        </label>
                      </div>
                      <div className="wf-player-grid">
                        <label className="mc-field">
                          {event.kind === 'SUBSTITUTION' ? '换下球员' : '事件球员'}
                          <select
                            value={event.playerId}
                            aria-label={event.kind === 'SUBSTITUTION' ? '换下球员' : '事件球员'}
                            onChange={(input) => change({ playerId: input.target.value })}
                          >
                            <option value="">选择名单球员</option>
                            {players.map((player) => (
                              <option key={player.id} value={player.id}>
                                {player.shirtNumber ?? '—'} · {player.displayName}
                              </option>
                            ))}
                          </select>
                        </label>
                        {['GOAL', 'SUBSTITUTION'].includes(event.kind) ? (
                          <label className="mc-field">
                            {event.kind === 'SUBSTITUTION' ? '换上球员' : '助攻球员'}
                            <select
                              value={event.relatedPlayerId}
                              aria-label={event.kind === 'SUBSTITUTION' ? '换上球员' : '助攻球员'}
                              onChange={(input) => change({ relatedPlayerId: input.target.value })}
                            >
                              <option value="">
                                {event.kind === 'SUBSTITUTION' ? '选择换上球员' : '无助攻'}
                              </option>
                              {players
                                .filter((player) => player.id !== event.playerId)
                                .map((player) => (
                                  <option key={player.id} value={player.id}>
                                    {player.shirtNumber ?? '—'} · {player.displayName}
                                  </option>
                                ))}
                            </select>
                          </label>
                        ) : null}
                      </div>
                    </div>
                  )
                })}
              </div>
              {!fields.events.length ? (
                <p className="mc-muted">暂无事件。草稿可以暂缺进球明细，提交前需与普通比分一致。</p>
              ) : null}
            </div>
            <div hidden={detailView !== 'result'}>
              <label className="mc-field">
                比赛备注
                <textarea
                  maxLength={800}
                  value={fields.notes}
                  aria-label="比赛备注"
                  onChange={(event) => update({ ...fields, notes: event.target.value })}
                />
              </label>
            </div>
          </fieldset>
          <label className="mc-field" hidden={historyOpen || (!data.latest && Boolean(data.blockingReasons?.length))}>
            保存或处理原因
            <textarea
              maxLength={240}
              disabled={command.locked}
              value={reason}
              aria-label="保存或处理原因"
              onChange={(event) => setReason(event.target.value)}
              placeholder="退回、开启更正或修改已有比分/事件时必填"
            />
          </label>
          {localError ? (
            <p className="mc-alert" role="alert">
              {localError}
            </p>
          ) : null}
          <div className="mc-actions wf-report-actions">
            {actions
              .filter((item) => item.allowed)
              .map((item) => (
                <button
                  key={item.action}
                  type="button"
                  disabled={
                    command.locked ||
                    read.loading ||
                    (['RETURN', 'CORRECT'].includes(item.action) && reason.trim().length < 2)
                  }
                  onClick={() => prepare(item.action)}
                >
                  {workflowLabels[item.action]}
                  {item.action === 'SAVE' ? '草稿' : item.action === 'CORRECT' ? '' : '报告'}
                </button>
              ))}
            <button
              type="button"
              className="secondary-button"
              disabled={command.locked || !dirty}
              onClick={cancel}
            >
              取消编辑
            </button>
            <button
              type="button"
              className="secondary-button"
              disabled={!data.permissions.canViewHistory}
              onClick={() => setHistoryOpen((value) => !value)}
            >
              {historyOpen ? '收起历史' : '查看版本历史'}
            </button>
          </div>
          {confirmation ? (
            <div className="mc-alert" role="alertdialog" aria-label="确认战报操作">
              <p>
                确认{workflowLabels[confirmation]}此报告？
                {confirmation === 'CONFIRM'
                  ? '此操作会形成正式比分和比赛事件，并触发结果与通知任务。'
                  : confirmation === 'CORRECT'
                    ? '将创建新的更正草稿；旧确认结果继续有效，直到新版本再次确认。'
                    : ''}
              </p>
              <div className="mc-actions">
                <button
                  type="button"
                  onClick={() => {
                    void send(confirmation)
                  }}
                >
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
          {historyOpen ? (
            <ReportHistoryPanel
              key={data.reportVersion}
              context={context}
              tournamentId=""
              matchId={matchId}
            />
          ) : null}
        </>
      ) : null}
      <CommandStatus command={command} />
    </section>
  )
}

function ReportHistoryPanel({ context, matchId }: WorkflowProps & { matchId: string }) {
  const [cursor, setCursor] = useState<number | null>(null)
  const read = useWorkflowRead<ReportHistory>(
    context,
    `/matches/${encodeURIComponent(matchId)}/report/history?limit=30${cursor ? `&beforeVersion=${cursor}` : ''}`,
  )
  const [items, setItems] = useState<ReportRevision[]>([])
  const [left, setLeft] = useState<number | null>(null)
  const [right, setRight] = useState<number | null>(null)
  useEffect(() => {
    if (!read.data) return
    setItems((previous) => {
      const versions = new Map(previous.map((item) => [item.version, item]))
      read.data!.items.forEach((item) => versions.set(item.version, item))
      return [...versions.values()].sort((a, b) => b.version - a.version)
    })
    setRight((value) => value ?? read.data?.items[0]?.version ?? null)
    setLeft(
      (value) => value ?? read.data?.items[1]?.version ?? read.data?.items[0]?.version ?? null,
    )
  }, [read.data])
  const before = items.find((item) => item.version === left)
  const after = items.find((item) => item.version === right)
  const changes = before && after ? reportChanges(before, after) : []
  return (
    <div className="wf-history">
      <div className="mc-toolbar">
        <h3>不可变版本历史</h3>
        <small className="mc-muted">只读核对，不会覆盖当前草稿</small>
      </div>
      {read.loading ? (
        <p className="mc-muted" role="status">
          正在读取报告历史…
        </p>
      ) : null}
      {read.error ? (
        <p className="mc-alert" role="alert">
          {read.error}
        </p>
      ) : null}
      <div className="mc-table-wrap">
        <table className="mc-table">
          <thead>
            <tr>
              <th>版本</th>
              <th>操作者</th>
              <th>动作/状态</th>
              <th>比分</th>
              <th>时间与原因</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.version}>
                <td>v{item.version}</td>
                <td>{item.savedBy}</td>
                <td>
                  {workflowLabels[item.action]} · {workflowLabels[item.status]}
                </td>
                <td>
                  {item.fields.homeScore}:{item.fields.awayScore}
                </td>
                <td>
                  <small>{displayDate(item.savedAt)}</small>
                  <p>{item.reason || '—'}</p>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!read.loading && !items.length ? <p className="mc-muted">尚无已保存的报告版本。</p> : null}
      {read.data?.nextBeforeVersion ? (
        <button
          type="button"
          disabled={read.loading}
          onClick={() => setCursor(read.data!.nextBeforeVersion)}
        >
          加载更早版本
        </button>
      ) : null}
      {items.length ? (
        <>
          <div className="wf-player-grid">
            <label className="mc-field">
              比较起点
              <select value={left ?? ''} onChange={(event) => setLeft(Number(event.target.value))}>
                {items.map((item) => (
                  <option key={item.version} value={item.version}>
                    v{item.version} · {workflowLabels[item.status]}
                  </option>
                ))}
              </select>
            </label>
            <label className="mc-field">
              比较终点
              <select
                value={right ?? ''}
                onChange={(event) => setRight(Number(event.target.value))}
              >
                {items.map((item) => (
                  <option key={item.version} value={item.version}>
                    v{item.version} · {workflowLabels[item.status]}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {changes.length ? (
            <ul className="wf-changes">
              {changes.map((change, index) => (
                <li key={index}>{change}</li>
              ))}
            </ul>
          ) : (
            <p className="mc-muted">所选版本的比分、事件、规则、名单与处理字段没有差异。</p>
          )}
          <div className="wf-player-grid">
            {before ? <RevisionEvidence revision={before} /> : null}
            {after ? <RevisionEvidence revision={after} /> : null}
          </div>
        </>
      ) : null}
    </div>
  )
}

function RevisionEvidence({ revision }: { revision: ReportRevision }) {
  const players = new Map(
    [...(revision.homePlayers ?? []), ...(revision.awayPlayers ?? [])].map((player) => [
      player.id,
      player,
    ]),
  )
  return (
    <details>
      <summary>v{revision.version} 完整事件与绑定资料</summary>
      <p>
        普通比分 {revision.fields.homeScore}:{revision.fields.awayScore} ·{' '}
        {workflowLabels[revision.fields.outcome]}
      </p>
      <p>
        点球 {revision.fields.homePenaltyScore || '—'}:{revision.fields.awayPenaltyScore || '—'}
      </p>
      <ul>
        {revision.fields.events.map((event) => (
          <li key={event.clientEventId}>
            {event.minute}
            {event.addedMinute ? `+${event.addedMinute}` : ''}′{' '}
            {event.side === 'HOME' ? '主队' : '客队'} {workflowLabels[event.kind]} ·{' '}
            {players.get(event.playerId)?.displayName ?? event.playerId}
            {event.relatedPlayerId
              ? ` / ${players.get(event.relatedPlayerId)?.displayName ?? event.relatedPlayerId}`
              : ''}
          </li>
        ))}
      </ul>
      <p>{revision.fields.notes || '无比赛备注'}</p>
      <dl className="wf-binding">
        <dt>规程</dt>
        <dd>{revision.ruleVersionId}</dd>
        <dt>主队名单</dt>
        <dd>{revision.homeRosterSnapshotId}</dd>
        <dt>客队名单</dt>
        <dd>{revision.awayRosterSnapshotId}</dd>
      </dl>
    </details>
  )
}
