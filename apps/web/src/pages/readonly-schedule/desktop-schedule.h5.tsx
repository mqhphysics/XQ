import { useDidShow } from '@tarojs/taro'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'

import { useExpandingTagShift } from '../../components/interactions/expanding-tags.h5'
import { CompetitionSwitcher } from '../../components/competition-switcher/index.h5'
import {
  CompetitionEmptyState,
  useEmptyCompetitionSelection,
} from '../../components/competition-switcher/empty-state.h5'
import { PublicShell } from '../../components/public-shell'
import { DataState } from '../../components/public-ui'
import { MatchStatus, TeamCrest } from '../../components/product-ui'
import { TeamTrigger } from '../../components/team-trigger/index.h5'
import { isFinishedMatch, matchDetailUrl } from '../../features/competition/competition.logic'
import {
  useCompetitionCatalog,
  useCompetitionSelection,
  useScopedTournamentId,
} from '../../features/campus/competition-catalog.h5'
import {
  pickForIds,
  pickLabel,
  seasonLabel,
} from '../../features/campus/competition-switcher.logic.h5'
import { formatDate, formatTime, matchStatusLabel } from '../../features/product/product.format'
import {
  isCompetitionPath,
  loadCompetition,
  peekCompetition,
  subscribeProductUpdates,
  productRepository,
} from '../../features/product/product.repository'
import { useLiveSearchParam } from '../../features/product/route-query'
import { readSession } from '../../features/product/session'
import type {
  CompetitionDataResponse,
  MatchSummary,
  TeamSummary,
} from '../../features/product/product.types'
import CompactSchedulePage from './schedule-compact'
import {
  ScheduleInteractionProvider,
  ScheduleLink,
  useScheduleInteraction,
  useScheduleMotion,
} from './schedule-interaction.h5'

import './index.h5.scss'
import { TbdCrest, TBD_LABEL } from '../../components/tbd-team'

type PageState =
  | { phase: 'loading' }
  | { phase: 'failed'; message: string }
  | { phase: 'ready'; data: CompetitionDataResponse }
type PrimaryTeamState =
  | { phase: 'loading' }
  | { phase: 'failed' }
  | { phase: 'ready'; team: TeamSummary | null }
type IconName =
  | 'calendar'
  | 'left'
  | 'right'
  | 'arrow'
  | 'pin'
  | 'list'
  | 'bracket'
  | 'cup'
  | 'check'
  | 'filter'

function Icon({ name }: { name: IconName }) {
  const paths: Record<IconName, string> = {
    calendar: 'M8 2v4m8-4v4M3 9h18M5 4h14a2 2 0 0 1 2 2v14H3V6a2 2 0 0 1 2-2Z',
    left: 'm15 5-7 7 7 7',
    right: 'm9 5 7 7-7 7',
    arrow: 'M4 12h16m-6-6 6 6-6 6',
    pin: 'M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0ZM15 10a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z',
    list: 'M9 6h12M9 12h12M9 18h12M3 6h1M3 12h1M3 18h1',
    bracket: 'M3 3h6v6H3ZM3 15h6v6H3Zm6-9h5v12H9m5-6h7m0-3v6',
    cup: 'M7 3h10v6a5 5 0 0 1-10 0ZM7 5H3v2a5 5 0 0 0 5 5m9-7h4v2a5 5 0 0 1-5 5m-4 2v6m-4 1h8',
    check: 'm5 12 4 4L19 6',
    filter: 'M3 5h18l-7 8v6l-4 2v-8Z',
  }
  return (
    <svg
      className={`schedule-icon schedule-icon--${name}`}
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[name]} />
    </svg>
  )
}

const dateKeyFormat = new Intl.DateTimeFormat('en-US', {
  timeZone: 'Asia/Shanghai',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})
const dateKeys = new Map<string, string>()
function dateKey(value: string | null): string {
  if (!value) return 'TBD'
  const known = dateKeys.get(value)
  if (known) return known
  const parts = dateKeyFormat.formatToParts(new Date(value))
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value ?? ''
  const key = `${part('year')}-${part('month')}-${part('day')}`
  if (dateKeys.size > 4000) dateKeys.clear()
  dateKeys.set(value, key)
  return key
}

function shiftDate(value: string, days: number): string {
  const date = new Date(`${value}T12:00:00+08:00`)
  date.setTime(date.getTime() + days * 24 * 60 * 60 * 1000)
  return dateKey(date.toISOString())
}

const calendarLabels = new Map<string, string>()
function shanghaiCalendarLabel(date: string, options: Intl.DateTimeFormatOptions): string {
  const key = `${date}|${JSON.stringify(options)}`
  const known = calendarLabels.get(key)
  if (known !== undefined) return known
  const label = new Date(`${date}T12:00:00+08:00`).toLocaleDateString('zh-CN', {
    ...options,
    timeZone: 'Asia/Shanghai',
  })
  calendarLabels.set(key, label)
  return label
}

function matchUrl(matchId: string, tournamentId: string) {
  return `${matchDetailUrl(matchId)}&tournamentId=${encodeURIComponent(tournamentId)}`
}
function teamUrl(teamId: string, tournamentId: string) {
  return `/pages/readonly-team-detail/index?teamId=${encodeURIComponent(teamId)}&tournamentId=${encodeURIComponent(tournamentId)}`
}

export default function SchedulePage() {
  const [desktop, setDesktop] = useState(() => window.matchMedia('(min-width: 721px)').matches)
  useEffect(() => {
    const media = window.matchMedia('(min-width: 721px)')
    const update = () => setDesktop(media.matches)
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])
  return desktop ? <DesktopSchedulePage /> : <CompactSchedulePage />
}

function DesktopSchedulePage() {
  const routeTournamentId = useScopedTournamentId(useLiveSearchParam('tournamentId'))
  const [state, setState] = useState<PageState>(() => {
    const cached = peekCompetition(routeTournamentId)
    return cached ? { phase: 'ready', data: cached } : { phase: 'loading' }
  })
  const [appearance, setAppearance] = useState(0)
  const empty = useEmptyCompetitionSelection()
  useDidShow(() => setAppearance((value) => value + 1))
  const load = useCallback(async () => {
    if (!peekCompetition(routeTournamentId)) setState({ phase: 'loading' })
    try {
      setState({ phase: 'ready', data: await loadCompetition(routeTournamentId) })
    } catch (error) {
      setState({
        phase: 'failed',
        message: error instanceof Error ? error.message : '赛程加载失败。',
      })
    }
  }, [routeTournamentId])
  useEffect(() => {
    void load()
  }, [load])
  // Silent refresh: a revalidated copy replaces the instantly rendered cached one in place.
  useEffect(
    () =>
      subscribeProductUpdates(isCompetitionPath, () => {
        const fresh = peekCompetition(routeTournamentId)
        if (fresh)
          setState((current) =>
            current.phase === 'ready' && current.data === fresh
              ? current
              : { phase: 'ready', data: fresh },
          )
      }),
    [routeTournamentId],
  )
  return (
    <PublicShell
      active="schedule"
      tournamentId={state.phase === 'ready' ? state.data.tournament.id : routeTournamentId}
    >
      <ScheduleInteractionProvider appearance={appearance}>
        <div className="schedule-art" aria-hidden="true">
          <div className="schedule-art__light" />
          <div className="schedule-art__stadium" />
          <div className="schedule-art__pitch" />
          <div className="schedule-art__goal" />
          <span className="schedule-art__note">
            校园足球
            <br />
            更好的我们
          </span>
        </div>
        {empty && (
          <>
            <EmptyScheduleHero />
            <CompetitionEmptyState className="schedule-empty" />
          </>
        )}
        {!empty && state.phase === 'loading' && (
          <DataState kind="loading" title="正在读取完整赛程" />
        )}
        {!empty && state.phase === 'failed' && (
          <div className="schedule-load-error">
            <DataState kind="error" title="赛程不可用" description={state.message} />
            <button
              data-schedule-button=""
              type="button"
              className="schedule-outline"
              onClick={() => void load()}
            >
              重新加载
            </button>
            {routeTournamentId && (
              <ScheduleLink
                className="schedule-outline"
                url="/pages/readonly-schedule/index"
                replace
              >
                返回当前赛事
              </ScheduleLink>
            )}
          </div>
        )}
        {!empty && state.phase === 'ready' && (
          <ScheduleContent
            key={state.data.tournament.id}
            data={state.data}
            appearance={appearance}
          />
        )}
      </ScheduleInteractionProvider>
    </PublicShell>
  )
}

function ScheduleContent({
  data,
  appearance,
}: {
  data: CompetitionDataResponse
  appearance: number
}) {
  const { pending } = useScheduleInteraction()
  const [teamId, setTeamId] = useState('')
  const [stage, setStage] = useState('')
  const [status, setStatus] = useState('')
  const [onlyPrimary, setOnlyPrimary] = useState(false)
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [primary, setPrimary] = useState<PrimaryTeamState>({ phase: 'loading' })
  const primaryRequest = useRef(0)
  const resultsRef = useRef<HTMLElement>(null)
  const datesRef = useRef<HTMLDivElement>(null)
  useExpandingTagShift(datesRef, selectedDate ?? '')
  const session = readSession()
  const accessToken = session?.accessToken
  const primaryTeam = primary.phase === 'ready' ? primary.team : null
  // "Today" is the real current date (no demo clock exists). The list anchors on the first
  // match day on/after today; when the season is over it anchors on the end of the list.
  const anchor = useMemo(() => {
    const today = dateKey(new Date().toISOString())
    const days = [
      ...new Set(
        data.schedule
          .filter((match) => match.scheduledStartAt)
          .map((match) => dateKey(match.scheduledStartAt)),
      ),
    ].sort()
    const upcoming = days.find((day) => day >= today) ?? null
    const last = days[days.length - 1] ?? today
    return { today, upcoming, weekStart: upcoming ? today : shiftDate(last, -6) }
  }, [data.schedule])
  const [weekStart, setWeekStart] = useState(anchor.weekStart)
  const anchored = useRef(false)
  const scrollToAnchor = useCallback(
    (behavior: ScrollBehavior = 'auto') => {
      const list = resultsRef.current
      if (!list) return
      const meta = list.querySelector<HTMLElement>('.schedule-results__meta')
      const target = anchor.upcoming
        ? list.querySelector<HTMLElement>(`[data-schedule-date="${anchor.upcoming}"]`)
        : null
      const top = target
        ? target.getBoundingClientRect().top -
          list.getBoundingClientRect().top +
          list.scrollTop -
          (meta?.offsetHeight ?? 0) -
          8
        : list.scrollHeight
      list.scrollTo({ top: Math.max(0, top), behavior })
    },
    [anchor.upcoming],
  )

  const loadPrimary = useCallback(async () => {
    const request = ++primaryRequest.current
    if (!accessToken) {
      setPrimary({ phase: 'ready', team: null })
      return
    }
    setPrimary((previous) => (previous.phase === 'ready' ? previous : { phase: 'loading' }))
    try {
      const preferences = await productRepository.getTeamPreferences()
      if (request !== primaryRequest.current) return
      setPrimary({
        phase: 'ready',
        team: preferences.primaryTeam,
      })
    } catch {
      if (request === primaryRequest.current) setPrimary({ phase: 'failed' })
    }
  }, [accessToken])
  useEffect(() => {
    void loadPrimary()
    return () => {
      primaryRequest.current += 1
    }
  }, [loadPrimary, appearance])
  useScheduleMotion(
    resultsRef,
    JSON.stringify([
      teamId,
      stage,
      status,
      onlyPrimary,
      onlyPrimary ? primaryTeam?.id : null,
      selectedDate,
    ]),
  )
  useScheduleMotion(datesRef, weekStart, 'x')

  useLayoutEffect(() => {
    if (anchored.current) return
    anchored.current = true
    scrollToAnchor()
  })

  const teams = useMemo(() => {
    const map = new Map<string, TeamSummary>()
    for (const match of data.schedule) {
      if (match.homeTeam) map.set(match.homeTeam.id, match.homeTeam)
      if (match.awayTeam) map.set(match.awayTeam.id, match.awayTeam)
    }
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'))
  }, [data.schedule])
  const stages = [
    ...new Set(
      data.schedule.map((match) => match.stageName).filter((name): name is string => Boolean(name)),
    ),
  ]
  const statuses = [...new Set(data.schedule.map((match) => match.status))]
  const matches = useMemo(
    () =>
      data.schedule
        .filter((match) => {
          const contains = (id: string) => match.homeTeam?.id === id || match.awayTeam?.id === id
          return (
            (!teamId || contains(teamId)) &&
            (!onlyPrimary || Boolean(primaryTeam && contains(primaryTeam.id))) &&
            (!stage || match.stageName === stage) &&
            (!status || match.status === status) &&
            (!selectedDate || dateKey(match.scheduledStartAt) === selectedDate)
          )
        })
        .sort((a, b) => {
          if (!a.scheduledStartAt) return b.scheduledStartAt ? 1 : a.id.localeCompare(b.id)
          if (!b.scheduledStartAt) return -1
          const difference = Date.parse(a.scheduledStartAt) - Date.parse(b.scheduledStartAt)
          return difference || a.id.localeCompare(b.id)
        }),
    [data.schedule, teamId, onlyPrimary, primaryTeam, stage, status, selectedDate],
  )
  const groups = new Map<string, MatchSummary[]>()
  for (const match of matches) {
    const key = dateKey(match.scheduledStartAt)
    const group = groups.get(key)
    if (group) group.push(match)
    else groups.set(key, [match])
  }
  const clearFilters = () => {
    setTeamId('')
    setStage('')
    setStatus('')
    setOnlyPrimary(false)
    setSelectedDate(null)
  }
  // 对阵图 lives on the 数据 page (knockout panel); the schedule stays a list.
  const bracketUrl = `/pages/data-center/index?tournamentId=${encodeURIComponent(data.tournament.id)}&panel=knockout`
  const dates = Array.from({ length: 7 }, (_, index) => shiftDate(weekStart, index))

  return (
    <>
      <ScheduleHero
        title={data.tournament.name}
        subtitle={`${data.tournament.seasonName} · 关注每一场校园比赛`}
        tournamentId={data.tournament.id}
        disabled={pending}
      />

      <section className="schedule-toolbar" aria-label="赛程筛选">
        <div className="schedule-calendar">
          <button
            data-schedule-button=""
            type="button"
            className="schedule-calendar__today"
            onClick={() => {
              setWeekStart(anchor.weekStart)
              setSelectedDate(null)
              window.requestAnimationFrame(() => scrollToAnchor('smooth'))
            }}
          >
            <Icon name="calendar" />
            <span>{anchor.upcoming ? '回到今天' : '最近比赛'}</span>
          </button>
          <button
            data-schedule-button=""
            type="button"
            className="schedule-calendar__arrow"
            aria-label="上一周"
            onClick={() => setWeekStart((value) => shiftDate(value, -7))}
          >
            <Icon name="left" />
          </button>
          <div className="schedule-calendar__dates" ref={datesRef}>
            {dates.map((date) => (
              <button
                data-schedule-button=""
                type="button"
                key={date}
                data-xq-tag={date}
                className={`schedule-date ${selectedDate === date ? 'schedule-date--active' : ''}`}
                aria-pressed={selectedDate === date}
                onClick={() => {
                  setSelectedDate(selectedDate === date ? null : date)
                }}
              >
                <span>{date.slice(5).replace('-', '/')}</span>
                <span>{shanghaiCalendarLabel(date, { weekday: 'short' })}</span>
                {data.schedule.some((match) => dateKey(match.scheduledStartAt) === date) && <i />}
              </button>
            ))}
          </div>
          <button
            data-schedule-button=""
            type="button"
            className="schedule-calendar__arrow"
            aria-label="下一周"
            onClick={() => setWeekStart((value) => shiftDate(value, 7))}
          >
            <Icon name="right" />
          </button>
        </div>
        <ScheduleFilters
          teams={teams}
          stages={stages}
          statuses={statuses}
          teamId={teamId}
          stage={stage}
          status={status}
          onlyPrimary={onlyPrimary}
          primaryAvailable={Boolean(primaryTeam)}
          onTeam={setTeamId}
          onStage={setStage}
          onStatus={setStatus}
          onOnlyPrimary={setOnlyPrimary}
          onClear={clearFilters}
        />
        <ScheduleLink className="schedule-bracket-link" url={bracketUrl}>
          <Icon name="bracket" />
          对阵图
        </ScheduleLink>
      </section>

      <div className="schedule-layout">
        <main className="schedule-results" ref={resultsRef}>
          <>
            {(selectedDate || teamId || stage || status || onlyPrimary) && (
              <div className="schedule-results__meta">
                <span aria-live="polite" className="schedule-results__date">
                  {selectedDate ? selectedDate.replaceAll('-', '/') : ''}
                </span>
                <div>
                  {(selectedDate || teamId || stage || status || onlyPrimary) && (
                    <button data-schedule-button="" type="button" onClick={clearFilters}>
                      清除筛选
                    </button>
                  )}
                </div>
              </div>
            )}
            {groups.size === 0 ? (
              <div className="schedule-empty">
                <Icon name="calendar" />
                <h3>当前筛选下没有比赛</h3>
                <p>试试其他日期、球队或比赛状态。</p>
                <button
                  data-schedule-button=""
                  type="button"
                  className="schedule-outline"
                  onClick={clearFilters}
                >
                  查看全部赛程
                </button>
              </div>
            ) : (
              [...groups].map(([date, dayMatches]) => (
                <section className="schedule-date-group" key={date} data-schedule-date={date}>
                  <header>
                    <h3>
                      {date === 'TBD'
                        ? '时间待定'
                        : shanghaiCalendarLabel(date, {
                            month: '2-digit',
                            day: '2-digit',
                            weekday: 'short',
                          })}
                    </h3>
                  </header>
                  {dayMatches.map((match) => (
                    <MatchRow key={match.id} match={match} />
                  ))}
                </section>
              ))
            )}
          </>
        </main>
        <aside className="schedule-sidebar">
          <section className="schedule-side-card">
            <header>
              <h3>我的主队</h3>
              <ScheduleLink
                url={
                  primaryTeam
                    ? teamUrl(primaryTeam.id, data.tournament.id)
                    : session
                      ? `/pages/my-team/index?tournamentId=${encodeURIComponent(data.tournament.id)}`
                      : '/pages/login/index'
                }
              >
                {primaryTeam ? '查看球队主页' : '选择主队'}
                <Icon name="arrow" />
              </ScheduleLink>
            </header>
            {primary.phase === 'loading' ? (
              <p className="schedule-side-card__hint">正在读取主队…</p>
            ) : primary.phase === 'failed' ? (
              <div className="schedule-side-card__hint">
                <p>主队信息暂时不可用</p>
                <button data-schedule-button="" type="button" onClick={() => void loadPrimary()}>
                  重新加载
                </button>
              </div>
            ) : primaryTeam ? (
              <PrimaryTeam
                team={primaryTeam}
                matches={data.schedule}
                tournamentId={data.tournament.id}
              />
            ) : (
              <div className="schedule-no-team">
                <div className="schedule-no-team__crest">
                  <Icon name="cup" />
                </div>
                <h4>为你的球队加油</h4>
                <p>
                  {session
                    ? '选择主队，随时关注他们的下一场比赛。'
                    : '登录并选择主队，关注球队的每一场比赛。'}
                </p>
                <ScheduleLink
                  className="schedule-outline"
                  url={
                    session
                      ? `/pages/my-team/index?tournamentId=${encodeURIComponent(data.tournament.id)}`
                      : '/pages/login/index'
                  }
                >
                  {session ? '选择我的主队' : '登录并选择主队'}
                  <Icon name="arrow" />
                </ScheduleLink>
              </div>
            )}
          </section>
          <section className="schedule-side-card">
            <header>
              <h3>赛事进程</h3>
              <ScheduleLink url={bracketUrl}>
                查看完整赛程
                <Icon name="arrow" />
              </ScheduleLink>
            </header>
            <ol className="schedule-progress">
              {data.bracket.map((round) => {
                const done = round.matches.filter(isFinishedMatch).length
                const complete = round.matches.length > 0 && done === round.matches.length
                const active = round.matches.some((match) =>
                  ['LIVE', 'CHECK_IN'].includes(match.status),
                )
                return (
                  <li
                    key={round.id}
                    className={complete ? 'is-complete' : active || done > 0 ? 'is-current' : ''}
                  >
                    <span className="schedule-progress__dot">
                      {complete && <Icon name="check" />}
                    </span>
                    <span>{round.name}</span>
                    <small>
                      {complete
                        ? `已完成 ${done} 场`
                        : active
                          ? `进行中 · ${done}/${round.matches.length}`
                          : done > 0
                            ? `已完成 ${done}/${round.matches.length} 场`
                            : formatDate(
                                round.matches.find((match) => match.scheduledStartAt)
                                  ?.scheduledStartAt ?? null,
                              )}
                    </small>
                  </li>
                )
              })}
            </ol>
            {data.bracket.length === 0 && (
              <p className="schedule-side-card__hint">暂无淘汰赛安排</p>
            )}
          </section>
        </aside>
      </div>
      <div className="schedule-bottom-note">
        <span>CAMPUS FOOTBALL / XIAOQIU</span>
        <span>
          少年与足球
          <br />
          永远值得被记录
        </span>
      </div>
    </>
  )
}

function MatchRow({ match }: { match: MatchSummary }) {
  const { navigate } = useScheduleInteraction()
  const hasScore = match.homeScore !== null && match.awayScore !== null
  const hasPenalty = match.homePenaltyScore !== null || match.awayPenaltyScore !== null
  return (
    <article
      className="schedule-row"
      role="button"
      tabIndex={0}
      aria-label={`查看${match.homeTeam?.name ?? TBD_LABEL}对阵${match.awayTeam?.name ?? TBD_LABEL}的比赛详情`}
      onClick={() => void navigate(matchUrl(match.id, match.tournamentId))}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget || !['Enter', ' '].includes(event.key)) return
        event.preventDefault()
        void navigate(matchUrl(match.id, match.tournamentId))
      }}
    >
      <div className="schedule-row__body">
        <time>{formatTime(match.scheduledStartAt)}</time>
        <div className="schedule-row__phase">
          <strong>{match.roundName ?? match.stageName ?? match.title}</strong>
          <span>{match.groupName ?? match.title}</span>
        </div>
        <div className="schedule-row__fixture">
          <RowTeam
            team={match.homeTeam}
            placeholder={match.homePlaceholder ?? null}
            tournamentId={match.tournamentId}
          />
          <div className="schedule-row__score">
            <strong>
              {hasScore
                ? `${match.homeScore} : ${match.awayScore}`
                : match.status === 'FINISHED'
                  ? '— : —'
                  : 'VS'}
            </strong>
            {hasPenalty && (
              <small>
                点球 {match.homePenaltyScore ?? 0} : {match.awayPenaltyScore ?? 0}
              </small>
            )}
          </div>
          <RowTeam
            away
            team={match.awayTeam}
            placeholder={match.awayPlaceholder ?? null}
            tournamentId={match.tournamentId}
          />
        </div>
        {match.statusReason?.startsWith('组委会裁定') ? (
          <span className="schedule-adjudication">裁定赛果</span>
        ) : (
          <MatchStatus status={match.status} />
        )}
        <div className="schedule-row__venue">
          <Icon name="pin" />
          <span>{match.venue?.name ?? '场地待定'}</span>
        </div>
      </div>
      {match.statusReason && !match.statusReason.startsWith('组委会裁定') && (
        <p className="schedule-row__reason">{match.statusReason}</p>
      )}
    </article>
  )
}

function RowTeam({
  team,
  placeholder,
  tournamentId,
  away = false,
}: {
  team: TeamSummary | null
  placeholder: string | null
  tournamentId: string
  away?: boolean
}) {
  const className = `schedule-row__team ${away ? 'schedule-row__team--away' : ''}`
  if (!team) {
    return (
      <div className={className} title={placeholder ?? TBD_LABEL}>
        <span className="schedule-row__team-name schedule-row__team-name--tbd">{TBD_LABEL}</span>
        <TbdCrest size="medium" hint={placeholder} />
      </div>
    )
  }
  return (
    <div className={className}>
      <TeamTrigger teamId={team.id} name={team.name} tournamentId={tournamentId}>
        <span className="schedule-row__team-name" title={team.name}>
          {team.shortName || team.name}
        </span>
      </TeamTrigger>
      <TeamTrigger teamId={team.id} name={team.name} tournamentId={tournamentId}>
        <TeamCrest team={team} size="medium" interactive={false} />
      </TeamTrigger>
    </div>
  )
}

function PrimaryTeam({
  team,
  matches,
  tournamentId,
}: {
  team: TeamSummary
  matches: MatchSummary[]
  tournamentId: string
}) {
  const next = matches
    .filter(
      (match) =>
        (match.homeTeam?.id === team.id || match.awayTeam?.id === team.id) &&
        ['SCHEDULED', 'CHECK_IN', 'LIVE'].includes(match.status),
    )
    .sort(
      (a, b) =>
        (Date.parse(a.scheduledStartAt ?? '') || Infinity) -
        (Date.parse(b.scheduledStartAt ?? '') || Infinity),
    )[0]
  return (
    <>
      <ScheduleLink className="schedule-primary-team" url={teamUrl(team.id, tournamentId)}>
        <TeamCrest team={team} size="large" />
        <span>
          <strong>{team.name}</strong>
          <small>{team.collegeName ?? '为每一场热爱而战'}</small>
        </span>
      </ScheduleLink>
      {next ? (
        <ScheduleLink className="schedule-next-match" url={matchUrl(next.id, tournamentId)}>
          <span className="schedule-next-match__heading">
            {next.status === 'LIVE' ? '正在比赛' : '下一场比赛'}
            <small>{next.title}</small>
            <Icon name="right" />
          </span>
          <span>
            {`${formatDate(next.scheduledStartAt)} · ${formatTime(next.scheduledStartAt)}`}
          </span>
          <span className="schedule-next-match__teams">
            <TeamCrest team={next.homeTeam} size="small" />
            {next.homeTeam?.shortName ?? TBD_LABEL}
            <b>VS</b>
            <TeamCrest team={next.awayTeam} size="small" />
            {next.awayTeam?.shortName ?? TBD_LABEL}
          </span>
          <span className="schedule-next-match__venue">
            <Icon name="pin" />
            {next.venue?.name ?? '场地待定'}
          </span>
        </ScheduleLink>
      ) : (
        <p className="schedule-side-card__hint">该赛季暂无待赛安排</p>
      )}
    </>
  )
}

/** Shared by the normal and the empty schedule so the switcher never moves. */
/** One 筛选 control: a button with an active-filter count opening a popover with all four filters. */
function ScheduleFilters({
  teams,
  stages,
  statuses,
  teamId,
  stage,
  status,
  onlyPrimary,
  primaryAvailable,
  onTeam,
  onStage,
  onStatus,
  onOnlyPrimary,
  onClear,
}: {
  teams: TeamSummary[]
  stages: string[]
  statuses: MatchSummary['status'][]
  teamId: string
  stage: string
  status: string
  onlyPrimary: boolean
  primaryAvailable: boolean
  onTeam: (value: string) => void
  onStage: (value: string) => void
  onStatus: (value: string) => void
  onOnlyPrimary: (value: boolean) => void
  onClear: () => void
}) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const count = [teamId, stage, status].filter(Boolean).length + (onlyPrimary ? 1 : 0)
  useEffect(() => {
    if (!open) return
    const away = (event: Event) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false)
    }
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', away, true)
    document.addEventListener('keydown', key)
    return () => {
      document.removeEventListener('pointerdown', away, true)
      document.removeEventListener('keydown', key)
    }
  }, [open])
  return (
    <div className={`schedule-filters ${open ? 'is-open' : ''}`} ref={root}>
      <button
        data-schedule-button=""
        type="button"
        className={`schedule-filters__trigger ${count ? 'is-active' : ''}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <Icon name="filter" />
        <span>筛选</span>
        {count > 0 && <em aria-label={`${count} 项筛选`}>{count}</em>}
      </button>
      {open && (
        <div className="schedule-filters__panel" role="dialog" aria-label="赛程筛选">
          <label data-schedule-label="">
            球队
            <select
              data-schedule-select=""
              aria-label="筛选球队"
              value={teamId}
              onChange={(event) => onTeam(event.target.value)}
            >
              <option value="">全部球队</option>
              {teams.map((team) => (
                <option value={team.id} key={team.id}>
                  {team.name}
                </option>
              ))}
            </select>
          </label>
          <label data-schedule-label="">
            比赛阶段
            <select
              data-schedule-select=""
              aria-label="筛选比赛阶段"
              value={stage}
              onChange={(event) => onStage(event.target.value)}
            >
              <option value="">全部阶段</option>
              {stages.map((name) => (
                <option key={name}>{name}</option>
              ))}
            </select>
          </label>
          <label data-schedule-label="">
            比赛状态
            <select
              data-schedule-select=""
              aria-label="筛选比赛状态"
              value={status}
              onChange={(event) => onStatus(event.target.value)}
            >
              <option value="">全部状态</option>
              {statuses.map((value) => (
                <option value={value} key={value}>
                  {matchStatusLabel(value)}
                </option>
              ))}
            </select>
          </label>
          <div className="schedule-primary-filter">
            <span>只看我的主队</span>
            <button
              data-schedule-button=""
              type="button"
              className="schedule-switch"
              role="switch"
              aria-label="只看我的主队"
              aria-checked={onlyPrimary}
              disabled={!primaryAvailable}
              title={!primaryAvailable ? '请先在主队页选择球队' : undefined}
              onClick={() => onOnlyPrimary(!onlyPrimary)}
            >
              <i />
            </button>
          </div>
          <footer>
            <button
              data-schedule-button=""
              type="button"
              className="schedule-filters__clear"
              disabled={count === 0}
              onClick={onClear}
            >
              重置
            </button>
            <button
              data-schedule-button=""
              type="button"
              className="schedule-filters__done"
              onClick={() => setOpen(false)}
            >
              完成
            </button>
          </footer>
        </div>
      )}
    </div>
  )
}

function ScheduleHero({
  title,
  subtitle,
  tournamentId,
  disabled = false,
}: {
  title: string
  subtitle: string
  tournamentId?: string | undefined
  disabled?: boolean
}) {
  return (
    <header className="schedule-hero">
      <h1>赛程</h1>
      <div className="schedule-hero__copy">
        <div>
          <h2>{title}</h2>
        </div>
        <p>{subtitle}</p>
      </div>
      <div className="schedule-hero__actions">
        <CompetitionSwitcher tournamentId={tournamentId} disabled={disabled} />
      </div>
    </header>
  )
}

function EmptyScheduleHero() {
  const catalog = useCompetitionCatalog()
  const selection = useCompetitionSelection()
  const pick =
    catalog && selection
      ? pickForIds(catalog, selection.competitionId, selection.seasonId)
      : undefined
  const label = pick ? pickLabel(pick) : undefined
  return (
    <ScheduleHero
      title={label ? label.title : (selection?.competitionName ?? '校园赛事')}
      subtitle={`${pick ? seasonLabel(pick.season) : (selection?.seasonName ?? '')} · ${label?.group ?? ''} · 即将开赛`}
    />
  )
}
