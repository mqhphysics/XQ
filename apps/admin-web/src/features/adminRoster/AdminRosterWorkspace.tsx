import { useEffect, useMemo, useState } from 'react'

import {
  filterRosterRegistrations,
  getDataQualityLabel,
  getRegistrationStatusLabel,
  getRosterStatusLabel,
  getStatusTone,
  hasDataQualityWarning,
} from './admin-roster.logic'
import { createAdminRosterRepository, mockRosterTournament } from './repository'
import {
  AdminRosterRepositoryError,
  type AdminRosterContext,
  type RosterRegistrationDetail,
  type RosterRegistrationReview,
  type RosterReviewFilter,
  type RosterReviewTournament,
} from './types'

type LoadStatus = 'idle' | 'loading' | 'ready' | 'forbidden' | 'error'

interface LoadState {
  status: LoadStatus
  message: string
  requestId: string | null
}

const idleState: LoadState = { status: 'idle', message: '', requestId: null }

export function AdminRosterWorkspace(props: {
  context: AdminRosterContext
  tournaments: RosterReviewTournament[]
}) {
  const repository = useMemo(() => createAdminRosterRepository(), [])
  const tournaments = useMemo(
    () =>
      props.tournaments.length > 0
        ? props.tournaments
        : repository.mode === 'mock'
          ? [mockRosterTournament]
          : [],
    [props.tournaments, repository.mode],
  )
  const [selectedTournamentId, setSelectedTournamentId] = useState('')
  const [registrations, setRegistrations] = useState<RosterRegistrationReview[]>([])
  const [listState, setListState] = useState<LoadState>(idleState)
  const [listReloadVersion, setListReloadVersion] = useState(0)
  const [selectedRegistrationId, setSelectedRegistrationId] = useState<string | null>(null)
  const [detail, setDetail] = useState<RosterRegistrationDetail | null>(null)
  const [detailState, setDetailState] = useState<LoadState>(idleState)
  const [detailReloadVersion, setDetailReloadVersion] = useState(0)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<RosterReviewFilter>('all')

  useEffect(() => {
    setSelectedTournamentId((current) => {
      if (tournaments.some((tournament) => tournament.id === current)) return current
      return tournaments[0]?.id ?? ''
    })
  }, [tournaments])

  useEffect(() => {
    let active = true
    setSelectedRegistrationId(null)
    setDetail(null)
    setDetailState(idleState)

    if (!selectedTournamentId) {
      setRegistrations([])
      setListState(idleState)
      return () => {
        active = false
      }
    }

    setRegistrations([])
    setListState({ status: 'loading', message: '', requestId: null })
    void repository
      .listRegistrations(props.context, selectedTournamentId)
      .then((items) => {
        if (!active) return
        setRegistrations(items)
        setListState({ status: 'ready', message: '', requestId: null })
      })
      .catch((caught: unknown) => {
        if (!active) return
        setRegistrations([])
        setListState(toFailureState(caught))
      })

    return () => {
      active = false
    }
  }, [
    repository,
    props.context.organizationId,
    props.context.role,
    props.context.userId,
    selectedTournamentId,
    listReloadVersion,
  ])

  useEffect(() => {
    let active = true

    if (!selectedTournamentId || !selectedRegistrationId) {
      setDetail(null)
      setDetailState(idleState)
      return () => {
        active = false
      }
    }

    setDetail(null)
    setDetailState({ status: 'loading', message: '', requestId: null })
    void repository
      .getRegistration(props.context, selectedTournamentId, selectedRegistrationId)
      .then((nextDetail) => {
        if (!active) return
        setDetail(nextDetail)
        setDetailState({ status: 'ready', message: '', requestId: null })
      })
      .catch((caught: unknown) => {
        if (!active) return
        setDetailState(toFailureState(caught))
      })

    return () => {
      active = false
    }
  }, [
    repository,
    props.context.organizationId,
    props.context.role,
    props.context.userId,
    selectedTournamentId,
    selectedRegistrationId,
    detailReloadVersion,
  ])

  const filteredRegistrations = useMemo(
    () => filterRosterRegistrations(registrations, query, filter),
    [registrations, query, filter],
  )
  const lockedCount = registrations.filter(
    (registration) => registration.rosterStatus === 'LOCKED',
  ).length
  const warningCount = registrations.filter(hasDataQualityWarning).length
  const playerCount = registrations.reduce((sum, registration) => sum + registration.playerCount, 0)

  const resetFilters = () => {
    setQuery('')
    setFilter('all')
  }

  return (
    <section className="roster-workspace" aria-label="球队与名单核对工作区">
      <div className="roster-toolbar">
        <label className="field roster-tournament-field">
          <span>核对赛事</span>
          <select
            value={selectedTournamentId}
            disabled={tournaments.length === 0}
            onChange={(event) => setSelectedTournamentId(event.target.value)}
          >
            {tournaments.length === 0 ? <option value="">暂无可选赛事</option> : null}
            {tournaments.map((tournament) => (
              <option key={tournament.id} value={tournament.id}>
                {tournament.name}（{tournament.code}）
              </option>
            ))}
          </select>
        </label>
        <div className="roster-mode-note">
          <span className={`mode-chip mode-${repository.mode}`}>
            {repository.mode === 'api' ? '真实 API' : '开发 Mock'}
          </span>
          <span>
            {repository.mode === 'api'
              ? '请求失败会停留在错误状态，不会回退到 Mock。'
              : '当前仅显示虚构身份数据，不代表真实导入结果。'}
          </span>
        </div>
        <button
          type="button"
          className="icon-button"
          aria-label="刷新名单"
          title="刷新名单"
          disabled={!selectedTournamentId || listState.status === 'loading'}
          onClick={() => setListReloadVersion((version) => version + 1)}
        >
          ↻
        </button>
      </div>

      {tournaments.length === 0 ? (
        <StatePanel
          kind="empty"
          title="暂无可核对赛事"
          description="请先在赛事工作区创建赛事，或确认 API 已返回当前组织的赛事。"
        />
      ) : (
        <>
          <section className="roster-summary" aria-label="名单核对摘要">
            <SummaryMetric label="报名球队" value={registrations.length} />
            <SummaryMetric label="名单球员" value={playerCount} />
            <SummaryMetric label="已锁定" value={lockedCount} />
            <SummaryMetric
              label="有告警"
              value={warningCount}
              tone={warningCount > 0 ? 'warning' : 'normal'}
            />
          </section>

          <section className="roster-filter-bar" aria-label="名单筛选">
            <label className="field roster-search-field">
              <span>球队名称或代码</span>
              <input
                type="search"
                value={query}
                placeholder="输入球队名或稳定代码"
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>
            <fieldset className="roster-segmented-control">
              <legend>状态筛选</legend>
              <FilterButton value="all" current={filter} onChange={setFilter}>
                全部
              </FilterButton>
              <FilterButton value="warnings" current={filter} onChange={setFilter}>
                有告警
              </FilterButton>
              <FilterButton value="unlocked" current={filter} onChange={setFilter}>
                未锁定
              </FilterButton>
              <FilterButton value="locked" current={filter} onChange={setFilter}>
                已锁定
              </FilterButton>
            </fieldset>
          </section>

          <div className="roster-review-layout">
            <section className="roster-table-panel" aria-busy={listState.status === 'loading'}>
              <div className="roster-panel-heading">
                <div>
                  <h3>报名与快照</h3>
                  <p>共 {filteredRegistrations.length} 条当前筛选结果</p>
                </div>
              </div>
              <RegistrationListState
                state={listState}
                registrations={registrations}
                filteredRegistrations={filteredRegistrations}
                selectedRegistrationId={selectedRegistrationId}
                onSelect={setSelectedRegistrationId}
                onRetry={() => setListReloadVersion((version) => version + 1)}
                onResetFilters={resetFilters}
              />
            </section>

            <aside
              className="roster-detail-panel"
              aria-label="名单详情"
              aria-busy={detailState.status === 'loading'}
            >
              <RosterDetail
                state={detailState}
                detail={detail}
                selectedRegistration={registrations.find(
                  (registration) => registration.registrationId === selectedRegistrationId,
                )}
                onClose={() => setSelectedRegistrationId(null)}
                onRetry={() => setDetailReloadVersion((version) => version + 1)}
              />
            </aside>
          </div>
        </>
      )}
    </section>
  )
}

function RegistrationListState(props: {
  state: LoadState
  registrations: RosterRegistrationReview[]
  filteredRegistrations: RosterRegistrationReview[]
  selectedRegistrationId: string | null
  onSelect: (registrationId: string) => void
  onRetry: () => void
  onResetFilters: () => void
}) {
  if (props.state.status === 'loading') {
    return (
      <StatePanel
        kind="loading"
        title="正在读取名单"
        description="正在核对报名、告警与最新快照状态。"
      />
    )
  }
  if (props.state.status === 'forbidden') {
    return (
      <StatePanel
        kind="forbidden"
        title="无权查看该赛事名单（403）"
        description={props.state.message}
        requestId={props.state.requestId}
        actionLabel="重试"
        onAction={props.onRetry}
      />
    )
  }
  if (props.state.status === 'error') {
    return (
      <StatePanel
        kind="error"
        title="名单读取失败"
        description={props.state.message}
        requestId={props.state.requestId}
        actionLabel="重试"
        onAction={props.onRetry}
      />
    )
  }
  if (props.state.status === 'ready' && props.registrations.length === 0) {
    return (
      <StatePanel kind="empty" title="暂无报名记录" description="该赛事尚未导入或创建球队报名。" />
    )
  }
  if (props.state.status === 'ready' && props.filteredRegistrations.length === 0) {
    return (
      <StatePanel
        kind="empty"
        title="没有符合条件的球队"
        description="尝试修改球队关键字或状态筛选。"
        actionLabel="清除筛选"
        onAction={props.onResetFilters}
      />
    )
  }
  if (props.state.status !== 'ready') return null

  return (
    <div className="roster-table-scroll">
      <table className="roster-table">
        <thead>
          <tr>
            <th scope="col">球队</th>
            <th scope="col">报名</th>
            <th scope="col">名单</th>
            <th scope="col" className="numeric-column">
              人数
            </th>
            <th scope="col">快照</th>
            <th scope="col">数据质量</th>
            <th scope="col">告警</th>
            <th scope="col" className="action-column">
              详情
            </th>
          </tr>
        </thead>
        <tbody>
          {props.filteredRegistrations.map((registration) => (
            <tr
              key={registration.registrationId}
              className={
                registration.registrationId === props.selectedRegistrationId
                  ? 'selected-row'
                  : undefined
              }
            >
              <td>
                <strong className="team-name">{registration.teamName}</strong>
                <span className="secondary-value">{registration.teamCode}</span>
              </td>
              <td>
                <StatusBadge
                  status={registration.registrationStatus}
                  label={getRegistrationStatusLabel(registration.registrationStatus)}
                />
              </td>
              <td>
                <StatusBadge
                  status={registration.rosterStatus}
                  label={getRosterStatusLabel(registration.rosterStatus)}
                />
              </td>
              <td className="numeric-column">{registration.playerCount}</td>
              <td>
                {registration.rosterSnapshotVersion === null
                  ? '未生成'
                  : `v${registration.rosterSnapshotVersion}`}
              </td>
              <td>
                <StatusBadge
                  status={registration.dataQualityStatus}
                  label={getDataQualityLabel(registration.dataQualityStatus)}
                />
              </td>
              <td>
                {registration.warningCodes.length === 0 ? (
                  <span className="secondary-value">无</span>
                ) : (
                  <span className="warning-count">{registration.warningCodes.length} 项</span>
                )}
              </td>
              <td className="action-column">
                <button
                  type="button"
                  className="table-action-button"
                  aria-label={`查看 ${registration.teamName} 名单详情`}
                  onClick={() => props.onSelect(registration.registrationId)}
                >
                  查看
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function RosterDetail(props: {
  state: LoadState
  detail: RosterRegistrationDetail | null
  selectedRegistration: RosterRegistrationReview | undefined
  onClose: () => void
  onRetry: () => void
}) {
  if (props.state.status === 'idle') {
    return (
      <StatePanel
        kind="empty"
        title="选择一支球队"
        description="从左侧列表打开详情，核对联系人、告警和球员字段。"
      />
    )
  }

  const heading = props.detail?.teamName ?? props.selectedRegistration?.teamName ?? '名单详情'
  return (
    <>
      <div className="roster-panel-heading detail-heading">
        <div>
          <h3>{heading}</h3>
          <p>
            {props.detail?.teamCode ??
              props.selectedRegistration?.teamCode ??
              '正在读取稳定球队代码'}
          </p>
        </div>
        <button
          type="button"
          className="icon-button"
          aria-label="关闭名单详情"
          title="关闭名单详情"
          onClick={props.onClose}
        >
          ×
        </button>
      </div>

      {props.state.status === 'loading' ? (
        <StatePanel
          kind="loading"
          title="正在读取详情"
          description="正在获取公开球员字段与脱敏身份字段。"
        />
      ) : null}
      {props.state.status === 'forbidden' ? (
        <StatePanel
          kind="forbidden"
          title="无权查看详情（403）"
          description={props.state.message}
          requestId={props.state.requestId}
          actionLabel="重试"
          onAction={props.onRetry}
        />
      ) : null}
      {props.state.status === 'error' ? (
        <StatePanel
          kind="error"
          title="详情读取失败"
          description={props.state.message}
          requestId={props.state.requestId}
          actionLabel="重试"
          onAction={props.onRetry}
        />
      ) : null}
      {props.state.status === 'ready' && props.detail ? (
        <RosterDetailContent detail={props.detail} />
      ) : null}
    </>
  )
}

function RosterDetailContent({ detail }: { detail: RosterRegistrationDetail }) {
  return (
    <div className="roster-detail-content">
      <dl className="roster-facts">
        <Fact label="报名状态" value={getRegistrationStatusLabel(detail.registrationStatus)} />
        <Fact label="名单状态" value={getRosterStatusLabel(detail.rosterStatus)} />
        <Fact
          label="提交版本"
          value={
            detail.rosterSubmissionVersion === null
              ? '尚未提交'
              : `v${detail.rosterSubmissionVersion}`
          }
        />
        <Fact
          label="快照版本"
          value={
            detail.rosterSnapshotVersion === null ? '尚未锁定' : `v${detail.rosterSnapshotVersion}`
          }
        />
        <Fact label="名单人数" value={`${detail.playerCount} 人`} />
        <Fact label="领队" value={detail.leaderDisplayName ?? '未提供'} />
        <Fact label="教练" value={detail.coachDisplayName ?? '未提供'} />
        <Fact label="联系人" value={detail.contactName ?? '未提供'} />
        <Fact label="联系电话" value={detail.contactPhoneMasked ?? '未提供脱敏值'} />
      </dl>

      <section className="detail-section">
        <div className="detail-section-heading">
          <h4>导入核对摘要</h4>
          <StatusBadge
            status={detail.dataQualityStatus}
            label={getDataQualityLabel(detail.dataQualityStatus)}
          />
        </div>
        <dl className="import-summary">
          <Fact label="导入批次" value={detail.importBatchId ?? '非批量导入或未记录'} />
          <Fact label="导入时间" value={formatImportedAt(detail.importedAt)} />
          <Fact label="导入球员" value={`${detail.playerCount} 人`} />
          <Fact label="告警数量" value={`${detail.warningCodes.length} 项`} />
          <Fact
            label="锁定结果"
            value={
              detail.rosterSnapshotVersion === null
                ? '未生成不可变快照'
                : `已生成名单快照 v${detail.rosterSnapshotVersion}`
            }
          />
        </dl>
        {detail.warningCodes.length > 0 ? (
          <ul className="warning-code-list" aria-label="数据质量告警代码">
            {detail.warningCodes.map((code) => (
              <li key={code}>{code}</li>
            ))}
          </ul>
        ) : (
          <p className="detail-muted">当前响应未报告数据质量告警。</p>
        )}
      </section>

      <section className="detail-section">
        <div className="detail-section-heading">
          <h4>球员名单</h4>
          <span>{detail.players.length} 人</span>
        </div>
        {detail.players.length === 0 ? (
          <p className="detail-muted">该名单详情没有球员记录。</p>
        ) : (
          <div className="player-table-scroll">
            <table className="player-table">
              <thead>
                <tr>
                  <th scope="col">球员</th>
                  <th scope="col">脱敏学号</th>
                  <th scope="col">球衣号</th>
                </tr>
              </thead>
              <tbody>
                {detail.players.map((player) => (
                  <tr key={player.id}>
                    <td>{player.displayName}</td>
                    <td>{player.studentIdMasked ?? '未提供'}</td>
                    <td>{player.shirtNumber ?? '未填写'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}

function FilterButton(props: {
  value: RosterReviewFilter
  current: RosterReviewFilter
  onChange: (value: RosterReviewFilter) => void
  children: string
}) {
  return (
    <button
      type="button"
      className={props.current === props.value ? 'active' : undefined}
      aria-pressed={props.current === props.value}
      onClick={() => props.onChange(props.value)}
    >
      {props.children}
    </button>
  )
}

function StatusBadge({ status, label }: { status: string | null; label: string }) {
  return <span className={`status-badge status-${getStatusTone(status)}`}>{label}</span>
}

function SummaryMetric(props: { label: string; value: number; tone?: 'normal' | 'warning' }) {
  return (
    <div
      className={props.tone === 'warning' ? 'roster-summary-item warning' : 'roster-summary-item'}
    >
      <span>{props.label}</span>
      <strong>{props.value}</strong>
    </div>
  )
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  )
}

function formatImportedAt(value: string | null): string {
  if (value === null) return '未记录'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('zh-CN', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(date)
}

function StatePanel(props: {
  kind: 'loading' | 'empty' | 'forbidden' | 'error'
  title: string
  description: string
  requestId?: string | null
  actionLabel?: string
  onAction?: () => void
}) {
  return (
    <div
      className={`roster-state roster-state-${props.kind}`}
      role={props.kind === 'error' || props.kind === 'forbidden' ? 'alert' : undefined}
    >
      <strong>{props.title}</strong>
      <p>{props.description}</p>
      {props.requestId ? <small>请求 ID：{props.requestId}</small> : null}
      {props.actionLabel && props.onAction ? (
        <button type="button" className="secondary-button" onClick={props.onAction}>
          {props.actionLabel}
        </button>
      ) : null}
    </div>
  )
}

function toFailureState(caught: unknown): LoadState {
  if (caught instanceof AdminRosterRepositoryError) {
    return {
      status: caught.status === 403 ? 'forbidden' : 'error',
      message: caught.message,
      requestId: caught.requestId,
    }
  }
  return {
    status: 'error',
    message: caught instanceof Error ? caught.message : '名单读取失败，请稍后重试。',
    requestId: null,
  }
}
