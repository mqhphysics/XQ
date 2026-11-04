import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import Taro from '@tarojs/taro'
import { useOverlayFocus } from '../../components/overlay-focus'
import { productRepository, request } from '../product/product.repository'
import { productConfigRepository } from '../product-config/product-config.repository'
import { readSession, subscribeToSessionChanges } from '../product/session.h5'
import { canReportMatch } from '../identity/entry-scope'
import { formatDate, formatTime } from '../product/product.format'
import type { MatchSummary } from '../product/product.types'
import './information-entry-dialog.h5.scss'

type EntryMatch = Pick<
  MatchSummary,
  | 'id'
  | 'tournamentId'
  | 'title'
  | 'status'
  | 'scheduledStartAt'
  | 'homeScore'
  | 'awayScore'
  | 'stageName'
> & {
  homeTeam: { id: string; name: string } | null
  awayTeam: { id: string; name: string } | null
}

type EntryState = {
  reportStatus: 'DRAFT' | 'SUBMITTED' | 'RETURNED' | 'CONFIRMED' | null
  homeScore: number | null
  awayScore: number | null
  recorded: boolean
}
type EntryFilter = 'all' | 'pending' | 'recorded'

function entryLabel(state: EntryState | undefined): { text: string; tone: string } {
  if (state?.reportStatus === 'SUBMITTED') return { text: '已录入 · 待审核', tone: 'review' }
  if (state?.reportStatus === 'RETURNED') return { text: '已退回 · 待修改', tone: 'returned' }
  if (state?.reportStatus === 'DRAFT') return { text: '草稿 · 待提交', tone: 'draft' }
  if (state?.recorded) return { text: '已录入', tone: 'done' }
  return { text: '待录入', tone: 'pending' }
}
const needsEntry = (state: EntryState | undefined) =>
  !state?.recorded || state.reportStatus === 'DRAFT' || state.reportStatus === 'RETURNED'

export function InformationEntryDialog({ onClose }: { onClose: () => void }) {
  const [matches, setMatches] = useState<EntryMatch[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [query, setQuery] = useState('')
  const [order, setOrder] = useState<'newest' | 'oldest'>('newest')
  const [states, setStates] = useState<Map<string, EntryState>>(new Map())
  const [filter, setFilter] = useState<EntryFilter>('all')
  const sequence = useRef(0)
  const session = useRef(readSession())
  const action = useRef(false)
  const close = () => {
    if (!action.current) onClose()
  }
  useOverlayFocus(true, '.information-entry-dialog', close)
  useEffect(
    () =>
      subscribeToSessionChanges(() => {
        if (readSession()?.accessToken !== session.current?.accessToken) onClose()
      }),
    [onClose],
  )
  const capabilities = async () => {
    if (!session.current || readSession()?.accessToken !== session.current.accessToken)
      throw new Error('账号已变更，请重新打开入口')
    const caps = await productConfigRepository.getCapabilities()
    if (
      readSession()?.accessToken !== session.current.accessToken ||
      caps.organizationId !== session.current.user.organizationId
    )
      throw new Error('账号已变更，请重新打开入口')
    if (!caps.modules.matchReporting?.enabled || !caps.actions['matchReports.write']?.enabled)
      throw new Error(caps.actions['matchReports.write']?.reason || '当前账号没有比赛录入权限')
    return caps
  }
  const load = useCallback(async () => {
    const requestId = ++sequence.current
    setLoading(true)
    setError('')
    try {
      // Capability and object scope come from the server; the role icon is only an entry.
      const caps = await capabilities()
      const tournaments = await productRepository.getPublishedTournaments()
      const scopes = caps.actions['matchReports.write'].scopes
      const eligible = tournaments.items.filter((item) =>
        scopes.some(
          (scope) =>
            (scope.type === 'ORGANIZATION' && scope.id === caps.organizationId) ||
            (scope.type === 'TOURNAMENT' && scope.id === item.id) ||
            scope.type === 'MATCH',
        ),
      )
      const [data, overviews] = await Promise.all([
        Promise.all(
          eligible.map((item) =>
            request<{ matches: EntryMatch[] }>(
              `/public/tournaments/${encodeURIComponent(item.id)}/schedule`,
            ),
          ),
        ),
        // Entry state + recorded score (the public schedule carries no scores).
        Promise.all(
          eligible.map((item) =>
            request<{ items: (EntryState & { matchId: string })[] }>(
              `/match-reports/overview?tournamentId=${encodeURIComponent(item.id)}`,
            ).catch(() => ({ items: [] })),
          ),
        ),
      ])
      const reportStates = new Map(
        overviews.flatMap((item) => item.items).map((item) => [item.matchId, item]),
      )
      const items = data
        .flatMap((item) => item.matches)
        .filter(
          (match) =>
            // Real matches stay 未开始 (SCHEDULED) until their report is confirmed, so any match
            // whose kick-off has passed, or that already has a report, needs to be listed too.
            (['FINISHED', 'CONFIRMED'].includes(match.status) ||
              (['SCHEDULED', 'LIVE'].includes(match.status) &&
                // A knockout slot whose opponent is still 待定 cannot be played or entered yet.
                Boolean(match.homeTeam && match.awayTeam) &&
                Boolean(match.scheduledStartAt) &&
                Date.parse(match.scheduledStartAt!) <= Date.now()) ||
              Boolean(reportStates.get(match.id)?.reportStatus)) &&
            canReportMatch(caps.actions['matchReports.write'], caps.organizationId, match),
        )
      if (sequence.current === requestId) {
        setMatches([...new Map(items.map((item) => [item.id, item])).values()])
        setStates(
          new Map(overviews.flatMap((item) => item.items).map((item) => [item.matchId, item])),
        )
      }
    } catch (issue) {
      if (sequence.current === requestId)
        setError(issue instanceof Error ? issue.message : '比赛列表读取失败')
    } finally {
      if (sequence.current === requestId) setLoading(false)
    }
  }, [])
  useEffect(() => {
    void load()
    return () => {
      sequence.current += 1
    }
  }, [load])
  const open = async (match: EntryMatch) => {
    if (action.current) return
    action.current = true
    setBusy(true)
    setError('')
    try {
      const caps = await capabilities()
      if (!canReportMatch(caps.actions['matchReports.write'], caps.organizationId, match))
        throw new Error('当前账号已失去该场比赛的录入权限')
      await Taro.navigateTo({
        url: `/pages/quick-report/index?matchId=${encodeURIComponent(match.id)}`,
      })
      onClose()
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : '比赛录入暂时不可用')
    } finally {
      action.current = false
      setBusy(false)
    }
  }
  const pendingCount = matches.filter((match) => needsEntry(states.get(match.id))).length
  const visible = matches
    .filter((match) =>
      filter === 'all'
        ? true
        : filter === 'pending'
          ? needsEntry(states.get(match.id))
          : !needsEntry(states.get(match.id)),
    )
    .filter((match) =>
      `${match.title} ${match.homeTeam?.name ?? ''} ${match.awayTeam?.name ?? ''}`.includes(
        query.trim(),
      ),
    )
    .sort((a, b) => {
      if (!a.scheduledStartAt) return b.scheduledStartAt ? 1 : a.id.localeCompare(b.id)
      if (!b.scheduledStartAt) return -1
      const difference = a.scheduledStartAt.localeCompare(b.scheduledStartAt)
      return (order === 'newest' ? -difference : difference) || a.id.localeCompare(b.id)
    })
  return createPortal(
    <div
      className="information-entry-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) close()
      }}
    >
      <section
        className="information-entry-dialog xq-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="information-entry-title"
        tabIndex={-1}
      >
        <header className="information-entry-header xq-dialog__header">
          <div>
            <h2 id="information-entry-title">选择比赛 · 信息录入</h2>
            <p>选择你有权限的已开赛比赛，填写比赛报告；已录入的比赛显示比分。</p>
          </div>
          <button
            data-report-entry-control
            aria-label="关闭比赛选择"
            disabled={busy}
            onClick={close}
          >
            ×
          </button>
        </header>
        <div className="information-entry-toolbar">
          <input
            data-report-entry-control
            aria-label="搜索比赛"
            placeholder="搜索球队或比赛"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <select
            data-report-entry-control
            aria-label="比赛时间排序"
            value={order}
            onChange={(event) => setOrder(event.target.value as 'newest' | 'oldest')}
          >
            <option value="newest">最近比赛优先</option>
            <option value="oldest">最早比赛优先</option>
          </select>
        </div>
        <div className="information-entry-filters" role="tablist" aria-label="按录入状态筛选">
          {(
            [
              ['all', `全部 ${matches.length}`],
              ['pending', `待录入 ${pendingCount}`],
              ['recorded', `已录入 ${matches.length - pendingCount}`],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              data-report-entry-control
              role="tab"
              aria-selected={filter === key}
              className={filter === key ? 'is-active' : ''}
              onClick={() => setFilter(key)}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="information-entry-list">
          {loading && <p role="status">正在读取比赛…</p>}
          {error && (
            <div className="information-entry-error" role="alert">
              {error}
              <button data-report-entry-control disabled={busy} onClick={() => void load()}>
                重试
              </button>
            </div>
          )}
          {!loading && !error && visible.length === 0 && (
            <p>{query ? '没有找到匹配的比赛' : '当前没有可录入的比赛'}</p>
          )}
          {!loading &&
            visible.map((match) => {
              const state = states.get(match.id)
              const status = entryLabel(state)
              const home = state ? state.homeScore : match.homeScore
              const away = state ? state.awayScore : match.awayScore
              return (
                <button
                  data-report-entry-control
                  data-match-id={match.id}
                  data-match-date={match.scheduledStartAt ?? ''}
                  className={`information-entry-match is-${status.tone}`}
                  key={match.id}
                  disabled={busy}
                  onClick={() => void open(match)}
                >
                  <span>
                    <small>
                      {formatDate(match.scheduledStartAt)} {formatTime(match.scheduledStartAt)} ·{' '}
                      {match.stageName ?? match.title}
                    </small>
                    <strong>
                      {match.homeTeam?.name ?? '待定'}{' '}
                      <i className={home === null || away === null ? 'is-empty' : ''}>
                        {home === null || away === null ? '— : —' : `${home} : ${away}`}
                      </i>{' '}
                      {match.awayTeam?.name ?? '待定'}
                    </strong>
                  </span>
                  <span className={`information-entry-match__state is-${status.tone}`}>
                    {status.text}
                  </span>
                  <span className="information-entry-match__open">
                    {needsEntry(state) ? '录入 →' : '查看 / 修改 →'}
                  </span>
                </button>
              )
            })}
        </div>
        <footer className="information-entry-footer xq-dialog__footer">
          {matches.length} 场比赛 · {pendingCount} 场待录入 · 比赛权限由当前账号授权范围决定
        </footer>
      </section>
    </div>,
    document.body,
  )
}
