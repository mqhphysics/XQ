import { useEffect, useState } from 'react'
import { TeamCrest } from '../../components/product-ui'
import { productRepository, peekProduct, subscribeProductUpdates } from '../../features/product/product.repository'
import { formatDate, formatTime } from '../../features/product/product.format'
import { openPlayer } from '../../features/product/player-navigation'
import type { MatchSummary, PlayerStats, TeamSummary, PlayerDetailResponse } from '../../features/product/product.types'
import { isPendingMatch } from './profile.logic'
import { ProfileIcon } from './profile-icons.h5'

export type SeasonRole = 'captain' | 'player' | 'reporter' | 'student'

export interface SeasonContribution {
  role: SeasonRole
  posts: number | null
  followedMatches: number | null
  likesReceived: number | null
  commentsReceived: number | null
  rosterCount: number | null
  finishedMatches: number
  pendingMatches: number
  onOpenEntry?: () => void
  onOpenRoster?: () => void
}

interface MySeasonProps {
  contribution: SeasonContribution
  linkedPlayerId: string | null
  tournamentId: string
  seasonName: string
  schedule: MatchSummary[]
  scheduleReady: boolean
}

type SeasonState =
  | { kind: 'loading' }
  | { kind: 'error' }
  | {
      kind: 'ready'
      stats: PlayerStats
      team: TeamSummary | null
      recent: Array<MatchSummary & { starter: boolean | null; minutesPlayed: number | null }>
    }

/** Next pending fixture of the player's team, earliest kickoff first (TBD times last). */
export function nextTeamMatch(schedule: MatchSummary[], teamId: string | undefined) {
  if (!teamId) return null
  return (
    schedule
      .filter(
        (match) =>
          isPendingMatch(match) && (match.homeTeam?.id === teamId || match.awayTeam?.id === teamId),
      )
      .sort(
        (a, b) =>
          (a.scheduledStartAt ? Date.parse(a.scheduledStartAt) : Infinity) -
          (b.scheduledStartAt ? Date.parse(b.scheduledStartAt) : Infinity),
      )[0] ?? null
  )
}

export function MySeasonCard({
  contribution,
  linkedPlayerId,
  tournamentId,
  seasonName,
  schedule,
  scheduleReady,
}: MySeasonProps) {
  const [state, setState] = useState<SeasonState>({ kind: 'loading' })
  useEffect(() => {
    if (!linkedPlayerId) return
    let active = true
    setState({ kind: 'loading' })
    const path = `/public/players/${encodeURIComponent(linkedPlayerId)}?tournamentId=${encodeURIComponent(tournamentId)}`
    const apply = (player: PlayerDetailResponse) => {
      if (active) setState({ kind: 'ready', stats: player.stats, team: player.team,
        recent: player.recentMatches.filter(match => match.homeScore !== null && match.awayScore !== null).slice(0, 3) })
    }
    const unsubscribe = subscribeProductUpdates(updated => updated === path, () => {
      const latest = peekProduct<PlayerDetailResponse>(path)
      if (latest) apply(latest)
    })
    void productRepository
      .getPlayer(linkedPlayerId, tournamentId)
      .then(apply)
      .catch(() => {
        if (active) setState({ kind: 'error' })
      })
    return () => {
      active = false
      unsubscribe()
    }
  }, [linkedPlayerId, tournamentId])

  const heading = (more: boolean, title = '我的赛季') => (
    <div className="profile-season__heading">
      <h2>{title}</h2>
      <span>{seasonName}</span>
      {more ? (
        <span className="profile-season__more">
          查看完整数据
          <ProfileIcon name="arrow" />
        </span>
      ) : null}
    </div>
  )
  const count = (n: number | null) => (n === null ? '—' : String(n))
  if (contribution.role === 'reporter' || (!linkedPlayerId && contribution.role !== 'captain'))
    return (
      <section className="profile-season profile-surface" aria-label="我的贡献">
        <div className="profile-season__card profile-season__card--static">
          {heading(false, contribution.role === 'reporter' ? '我的录入' : '我的贡献')}
          <div className="profile-season__stats profile-season__stats--4">
            {(contribution.role === 'reporter'
              ? [
                  ['已完赛', String(contribution.finishedMatches)],
                  ['待进行', String(contribution.pendingMatches)],
                  ['我的动态', count(contribution.posts)],
                  ['关注比赛', count(contribution.followedMatches)],
                ]
              : [
                  ['关注比赛', count(contribution.followedMatches)],
                  ['我的动态', count(contribution.posts)],
                  ['获赞', count(contribution.likesReceived)],
                  ['收到评论', count(contribution.commentsReceived)],
                ]
            ).map(([label, value]) => (
              <div key={label}>
                <strong>{value}</strong>
                <span>{label}</span>
              </div>
            ))}
          </div>
          <div className="profile-season__next profile-season__next--line">
            {contribution.role === 'reporter' ? (
              <>
                <p className="profile-season__note">
                  本赛季比赛进度，赛后事件在比赛详情或信息录入中补录。
                </p>
                {contribution.onOpenEntry ? (
                  <span
                    role="button"
                    tabIndex={0}
                    className="profile-season__more"
                    onClick={contribution.onOpenEntry}
                  >
                    信息录入
                    <ProfileIcon name="arrow" />
                  </span>
                ) : null}
              </>
            ) : (
              <p className="profile-season__note">
                记录你的社区参与；出场、进球和助攻请前往球员档案查看。
              </p>
            )}
          </div>
        </div>
      </section>
    )
  if (!linkedPlayerId) return null

  const open = () => void openPlayer(linkedPlayerId, tournamentId)
  const team = state.kind === 'ready' ? state.team : null
  const next = state.kind === 'ready' ? nextTeamMatch(schedule, team?.id) : null
  const home = next?.homeTeam?.id === team?.id
  const opponent = next ? (home ? next.awayTeam : next.homeTeam) : null
  const opponentLabel = opponent?.name ?? '待定'
  const stats = state.kind === 'ready' ? state.stats : null
  const value = (n: number | undefined) => (stats ? String(n ?? 0) : '—')

  return (
    <section className="profile-season profile-surface" aria-label="我的赛季">
      <button
        data-profile-button=""
        className="profile-season__card"
        onClick={open}
        aria-label="查看我的完整球员数据"
      >
        {heading(true)}
        <div
          className={`profile-season__stats ${contribution.role === 'captain' ? 'profile-season__stats--4' : ''}`}
        >
          {(
            [
              ['出场', value(stats?.appearances)],
              ['进球', value(stats?.goals)],
              ['助攻', value(stats?.assists)],
              ...(contribution.role === 'captain'
                ? ([['大名单', count(contribution.rosterCount)]] as const)
                : []),
            ] as const
          ).map(([label, shown]) => (
            <div key={label}>
              <strong>{shown}</strong>
              <span>{label}</span>
            </div>
          ))}
        </div>
        <div className="profile-season__next">
          <small>下一场</small>
          {state.kind === 'error' ? (
            <p className="profile-season__note">赛季数据暂不可用，点击查看球员详情。</p>
          ) : state.kind === 'loading' || !scheduleReady ? (
            <p className="profile-season__note">正在读取…</p>
          ) : next ? (
            <div className="profile-season__match">
              <span className="profile-season__opponent">
                {opponent ? (
                  <TeamCrest team={opponent} size="small" />
                ) : (
                  <i aria-hidden="true">?</i>
                )}
                <strong>{opponentLabel}</strong>
                <em>{home ? '主场' : '客场'}</em>
              </span>
              {next.roundName || next.stageName ? (
                <span className="profile-season__meta">
                  <ProfileIcon name="trophy" />
                  {next.roundName || next.stageName}
                </span>
              ) : null}
              <span className="profile-season__meta">
                <ProfileIcon name="calendar" />
                {next.scheduledStartAt
                  ? `${formatDate(next.scheduledStartAt)} ${formatTime(next.scheduledStartAt)}`
                  : '时间待定'}
              </span>
              <span className="profile-season__meta">
                <ProfileIcon name="pin" />
                {next.venue?.name ?? '场地待定'}
              </span>
            </div>
          ) : (
            <p className="profile-season__note">本赛季暂无待进行的比赛。</p>
          )}
        </div>
        {state.kind === 'ready' && state.recent.length ? (
          <div className="profile-season__recent">
            <small>近期比赛</small>
            <ul>
              {state.recent.map((match) => {
                const atHome = match.homeTeam?.id === team?.id
                const rival = atHome ? match.awayTeam : match.homeTeam
                const mine = (atHome ? match.homeScore : match.awayScore) ?? 0
                const theirs = (atHome ? match.awayScore : match.homeScore) ?? 0
                const result = mine > theirs ? 'win' : mine < theirs ? 'loss' : 'draw'
                return (
                  <li key={match.id}>
                    <span className="profile-season__recent-date">
                      {match.scheduledStartAt ? formatDate(match.scheduledStartAt) : '—'}
                    </span>
                    <span className="profile-season__recent-team">
                      {rival ? <TeamCrest team={rival} size="small" /> : null}
                      <strong>{rival?.name ?? '待定'}</strong>
                      <em>{atHome ? '主' : '客'}</em>
                    </span>
                    <span className={`profile-season__recent-score is-${result}`}>
                      {mine} : {theirs}
                    </span>
                    <span className="profile-season__recent-minutes">
                      {match.minutesPlayed === null ? '已参赛' : `${match.starter ? '首发' : '替补'} · ${match.minutesPlayed}′`}
                    </span>
                  </li>
                )
              })}
            </ul>
          </div>
        ) : null}
      </button>
    </section>
  )
}
