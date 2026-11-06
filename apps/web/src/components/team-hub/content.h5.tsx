import { PlayerAvatar } from '../player-avatar.h5'
import Taro from '@tarojs/taro'
import { useId, useRef, useState } from 'react'
import { TeamCrest, UserAvatar, MatchStatus } from '../product-ui'
import { CompetitionSwitcher } from '../competition-switcher/index.h5'
import { PostTags } from '../post-tags'
import { TeamTrigger } from '../team-trigger'
import { PlayerTrigger } from '../player-trigger'
import { openPlayer as openPlayerProfile } from '../../features/product/player-navigation'
import { EmojiText } from '../post-social/emoji-picker'
import {
  formatDate,
  formatRelativeTime,
  formatTime,
  positionLabel,
} from '../../features/product/product.format'
import { productRepository, resolveMediaUrl } from '../../features/product/product.repository'
import {
  openPost,
  updatePostInteraction,
  usePostInteraction,
} from '../../features/product/post-navigation'
import { openTeam } from '../../features/product/team-navigation'
import { openMatch } from '../../features/product/match-navigation'
import { readSession } from '../../features/product/session'
import type {
  CompetitionDataResponse,
  MatchSummary,
  PostSummary,
  TeamDashboardResponse,
  TeamSummary,
} from '../../features/product/product.types'
import { TeamIcon } from './icons.h5'
import { pickSpotlightMatches, spotlightKind } from './hub-order.logic'
import { TbdCrest, TBD_LABEL } from '../tbd-team'
import { teamBackgroundUrl } from '../../features/managed-media/backgrounds.h5'
import { eventOnTeam } from '../../features/product/team-hit'

type Tab = 'feed' | 'players' | 'profile'
const tabs = [
  { id: 'feed', label: '动态与赛程', icon: 'feed' },
  { id: 'players', label: '球员与数据', icon: 'people' },
  { id: 'profile', label: '资料与转会', icon: 'file' },
] as const
const positions = [
  { key: 'FORWARD', label: '前锋' },
  { key: 'MIDFIELDER', label: '中场' },
  { key: 'DEFENDER', label: '后卫' },
  { key: 'GOALKEEPER', label: '门将' },
  { key: 'OTHER', label: '其他' },
]

export function TeamIdentity({
  team,
  tournamentId,
  size = 'small',
  mirrored = false,
}: {
  team: TeamSummary | null
  tournamentId: string
  size?: 'small' | 'medium' | 'large'
  /** Home side: name first, crest next to the score. */
  mirrored?: boolean
}) {
  return team ? (
    <TeamTrigger teamId={team.id} name={team.name} tournamentId={tournamentId}>
      <button
        type="button"
        data-team-action
        className={`th-team-link ${mirrored ? 'th-team-link--mirrored' : ''}`}
        onClick={(event) => {
          // Only the crest or the name glyphs open the team; the rest belongs to the card.
          if (!eventOnTeam(event.currentTarget, event)) return
          event.stopPropagation()
          void openTeam(team.id, tournamentId)
        }}
      >
        <TeamCrest team={team} size={size} interactive={false} />
        <span>{team.name}</span>
      </button>
    </TeamTrigger>
  ) : (
    <span className={`th-muted th-team-link ${mirrored ? 'th-team-link--mirrored' : ''}`}>
      <TbdCrest size={size} />
      <span>{TBD_LABEL}</span>
    </span>
  )
}

export function TeamHero({
  data,
  children,
}: {
  data: TeamDashboardResponse
  children?: React.ReactNode
}) {
  return (
    <header className="th-hero th-team-banner">
      {/* The team's stored 2.80:1 background (upload or pre-cropped default), same frame as the
          captain 球队管理 header. */}
      <img
        className="th-team-banner__img"
        src={teamBackgroundUrl(data.team.coverUrl)}
        alt=""
        draggable={false}
      />
      <div className="th-team-banner__panel">
        <div className="th-hero__identity" data-team-action>
          <TeamCrest team={data.team} size="large" interactive={false} />
          <div>
            <div className="th-hero__title">
              <h1>{data.team.name}</h1>
            </div>
            <p>{data.team.collegeName ?? '校园足球球队'}</p>
            <p className="th-hero__motto">
              {data.team.motto ?? data.team.description ?? '在绿茵场上，记录每一份热爱。'}
            </p>
            <div className="th-hero__facts">
              <span>
                <strong>{data.roster.length}</strong>球队成员
              </span>
              <span>
                <strong>{data.stats.played}</strong>已赛场次
              </span>
              <span>
                <strong>{data.team.groupName ?? '—'}</strong>所在小组
              </span>
            </div>
          </div>
        </div>
        {children ? <div className="th-hero__actions">{children}</div> : null}
      </div>
    </header>
  )
}

export function TeamContent({
  data,
  competition,
  competitionError,
  tournamentId,
  onTournamentChange,
  onReload,
}: {
  data: TeamDashboardResponse
  competition: CompetitionDataResponse | null
  competitionError: string
  tournamentId: string
  onTournamentChange: (id: string) => void
  onReload: () => void
  onPostPublished: (post: PostSummary) => void
}) {
  const [tab, setTab] = useState<Tab>('feed')
  const panelId = useId()
  
  const matches = competition
    ? competition.schedule.filter(
        (match) => match.homeTeam?.id === data.team.id || match.awayTeam?.id === data.team.id,
      )
    : [...data.upcomingMatches, ...data.recentMatches]
  const season = (
    <CompetitionSwitcher
      variant="compact"
      className="th-competition-switcher"
      tournamentId={tournamentId}
      onChange={(id) => {
        if (id) onTournamentChange(id)
      }}
    />
  )
  return (
    <>
      <div className="th-tabs" role="tablist" aria-label="球队内容">
        {tabs.map((item, index) => (
          <button
            key={item.id}
            type="button"
            data-team-control
            role="tab"
            aria-selected={tab === item.id}
            aria-controls={panelId}
            id={`${panelId}-${item.id}`}
            tabIndex={tab === item.id ? 0 : -1}
            className={tab === item.id ? 'is-active' : ''}
            onClick={() => setTab(item.id)}
            onKeyDown={(event) => {
              const next =
                event.key === 'ArrowRight'
                  ? (index + 1) % tabs.length
                  : event.key === 'ArrowLeft'
                    ? (index + tabs.length - 1) % tabs.length
                    : event.key === 'Home'
                      ? 0
                      : event.key === 'End'
                        ? tabs.length - 1
                        : -1
              if (next < 0) return
              event.preventDefault()
              setTab(tabs[next]!.id)
              const buttons =
                event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>(
                  '[role="tab"]',
                )
              buttons?.[next]?.focus()
            }}
          >
            <TeamIcon name={item.icon} />
            {item.label}
          </button>
        ))}
      </div>
      <div className="th-panel" id={panelId} role="tabpanel" aria-labelledby={`${panelId}-${tab}`}>
        {tab === 'feed' ? (
          <div className="th-columns th-columns--feed">
            <section className="th-surface th-feed th-feed--compact">
              <SpotlightMatches matches={matches} tournamentId={tournamentId} />
              <div className="th-heading">
                <h2>球队动态</h2>
                </div>
              {data.posts.length ? (
                data.posts.map((post) => (
                  <TeamPost key={post.id} post={post} tournamentId={tournamentId} />
                ))
              ) : (
                <Empty title="还没有球队动态" copy="训练、比赛和场边故事，都可以从这里开始记录。" />
              )}
            </section>
            <section className="th-surface">
              <div className="th-heading">
                <h2>球队赛程</h2>
                <button
                  data-team-control
                  type="button"
                  className="th-text-button"
                  onClick={() =>
                    void Taro.navigateTo({
                      url: `/pages/readonly-schedule/index?tournamentId=${encodeURIComponent(tournamentId)}`,
                    })
                  }
                >
                  完整赛程
                  <TeamIcon name="arrow" />
                </button>
              </div>
              {competitionError ? (
                <div className="th-inline-error" role="status">
                  完整赛程暂不可用，显示已读取的近期比赛。
                  <button data-team-control type="button" onClick={onReload}>
                    重试
                  </button>
                </div>
              ) : null}
              <TeamSchedule matches={matches} tournamentId={tournamentId} />
            </section>
          </div>
        ) : tab === 'players' ? (
          <div className="th-columns">
            <section className="th-surface">
              <div className="th-heading">
                <h2>球队人员</h2>
                <span className="th-muted">{data.roster.length} 名球员</span>
              </div>
              <p className="th-small-note">
                球队成员与赛事锁定名单分别维护；球队成员身份不代表已取得当前赛事参赛资格。
              </p>
              <div className="th-staff">
                <div>
                  <h3>主教练</h3>
                  <div className="th-staff__card">
                    <span className="th-staff__icon">
                      <TeamIcon name="people" />
                    </span>
                    <div>
                      <strong>{data.team.coachName ?? '暂未登记'}</strong>
                      <small>主教练</small>
                    </div>
                  </div>
                </div>
                <div>
                  <h3>队长</h3>
                  <div className="th-staff__card">
                    <span className="th-staff__icon">C</span>
                    <div>
                      {data.team.captainPlayerId ? <button className="th-staff__name" onClick={() => openPlayerProfile(data.team.captainPlayerId!)}>
                        <strong>{data.team.captainName ?? '球队队长'}</strong>
                      </button> : <strong>{data.team.captainName ?? '暂未登记'}</strong>}
                      <small>球队队长</small>
                    </div>
                  </div>
                </div>
              </div>
              {positions.map((group) => {
                const players = data.roster.filter((player) =>
                  group.key === 'OTHER'
                    ? !positions.slice(0, 4).some((item) => item.key === player.position)
                    : player.position === group.key,
                )
                return players.length ? (
                  <div className="th-roster-group" key={group.key}>
                    <h3>
                      {group.label}
                      <span>（{players.length}人）</span>
                    </h3>
                    <div className="th-roster">
                      {players.map((player) => (
                        <PlayerTrigger
                          key={player.id}
                          playerId={player.id}
                          name={player.displayName}
                          tournamentId={tournamentId}
                        >
                          <button
                            data-team-control
                            type="button"
                            className="th-player"
                            onClick={() => void openPlayer(player.id, tournamentId)}
                          >
                            <PlayerAvatar
                              name={player.displayName}
                              avatarUrl={player.avatarUrl}
                              color={player.profileColor}
                            />
                            <strong className="th-player__number">
                              {player.shirtNumber ?? '—'}
                            </strong>
                            <span className="th-player__name">
                              <strong>{player.displayName}</strong>
                              <small>{positionLabel(player.position)}</small>
                              <small>
                                {(player as { rosterSource?: string }).rosterSource ===
                                'TEAM_MEMBERSHIP'
                                  ? '球队成员 · 未在赛事锁定名单中'
                                  : '赛事锁定名单'}
                              </small>
                            </span>
                            <span className="th-player__stats">
                              <span>
                                出场<strong>{player.appearances}</strong>
                              </span>
                              <span>
                                进球<strong>{player.goals}</strong>
                              </span>
                              <span>
                                助攻<strong>{player.assists}</strong>
                              </span>
                            </span>
                            <span className="th-chevron">›</span>
                          </button>
                        </PlayerTrigger>
                      ))}
                    </div>
                  </div>
                ) : null
              })}
              {!data.roster.length ? (
                <Empty title="暂无公开阵容" copy="球队公开名单登记后将在这里展示。" />
              ) : null}
            </section>
            <section className="th-surface">
              <div className="th-heading">
                <h2>球队数据</h2>
                {season}
              </div>
              <p className="th-small-note">以下统计来自当前赛事的比赛记录。</p>
              <div className="th-stat-grid">
                {[
                  ['比赛', data.stats.played],
                  ['胜', data.stats.won],
                  ['平', data.stats.drawn],
                  ['负', data.stats.lost],
                  ['进球', data.stats.goalsFor],
                  ['失球', data.stats.goalsAgainst],
                  [
                    '净胜球',
                    data.stats.goalDifference > 0
                      ? `+${data.stats.goalDifference}`
                      : data.stats.goalDifference,
                  ],
                ].map(([label, value]) => (
                  <div key={label}>
                    <span>{label}</span>
                    <strong>{value}</strong>
                  </div>
                ))}
              </div>
              <h3 className="th-subheading">赛事位置</h3>
              <div className="th-standings">
                {(() => {
                  const group = competition?.groups.find((item) =>
                    item.standings.some((row) => row.teamId === data.team.id),
                  )
                  const row = group?.standings.find((item) => item.teamId === data.team.id)
                  const rounds = competition?.bracket.filter((round) =>
                    round.matches.some(
                      (match) =>
                        match.homeTeam?.id === data.team.id || match.awayTeam?.id === data.team.id,
                    ),
                  )
                  const lastRound = rounds?.at(-1)
                  return (
                    <>
                      <div>
                        <TeamIcon name="cup" />
                        <span>
                          <small>小组排名</small>
                          <strong>{row ? `${group?.name} · 第 ${row.rank} 名` : '暂无排名'}</strong>
                          <small>{row ? `积分 ${row.points}` : '等待赛事记录'}</small>
                        </span>
                      </div>
                      <div>
                        <TeamIcon name="cup" />
                        <span>
                          <small>淘汰赛进程</small>
                          <strong>{lastRound?.name ?? '暂无淘汰赛记录'}</strong>
                          <small>{lastRound ? '按已公布对阵展示' : '等待赛程发布'}</small>
                        </span>
                      </div>
                    </>
                  )
                })()}
              </div>
              <h3 className="th-subheading">进攻数据</h3>
              <div className="th-metrics">
                <Metric label="进球" value={data.stats.goalsFor} />
                <Metric
                  label="场均进球"
                  value={
                    data.stats.played ? (data.stats.goalsFor / data.stats.played).toFixed(1) : '—'
                  }
                />
                <Metric label="场均射门" value="—" />
              </div>
              <h3 className="th-subheading">防守数据</h3>
              <div className="th-metrics">
                <Metric label="失球" value={data.stats.goalsAgainst} />
                <Metric
                  label="场均失球"
                  value={
                    data.stats.played
                      ? (data.stats.goalsAgainst / data.stats.played).toFixed(1)
                      : '—'
                  }
                />
                <Metric label="场均抢断" value="—" />
              </div>
              <p className="th-small-note th-data-note">部分技术统计尚未采集，以「—」展示。</p>
              {competitionError ? (
                <div className="th-inline-error">
                  {competitionError}
                  <button data-team-control type="button" onClick={onReload}>
                    重试赛事数据
                  </button>
                </div>
              ) : null}
            </section>
          </div>
        ) : (
          <TeamProfile data={data} />
        )}
      </div>
      </>
  )
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}
export function Empty({ title, copy }: { title: string; copy: string }) {
  return (
    <div className="th-empty">
      <strong>{title}</strong>
      <p>{copy}</p>
    </div>
  )
}

function SpotlightMatches({
  matches,
  tournamentId,
}: {
  matches: MatchSummary[]
  tournamentId: string
}) {
  const cards = pickSpotlightMatches(matches)
  if (!cards.length) return null
  return (
    <div className="th-spotlight" aria-label="主队近期比赛">
      {cards.map((match, index) => {
        const kind = spotlightKind(match, index, cards)
        const hasScore = match.homeScore !== null && match.awayScore !== null
        return (
          <button
            key={match.id}
            data-team-control
            type="button"
            className={`th-spotlight__card th-spotlight__card--${kind}`}
            aria-label={`查看${match.title}比赛详情`}
            onClick={() => void openMatch(match.id, tournamentId)}
          >
            <span className="th-spotlight__meta">
              <small>
                {formatDate(match.scheduledStartAt)} · {formatTime(match.scheduledStartAt)}
                <i aria-hidden="true">·</i>
                {match.roundName ?? match.stageName ?? match.title}
              </small>
              <span className="th-spotlight__status">
                <MatchStatus status={match.status} />
              </span>
            </span>
            <span className="th-spotlight__teams">
              <span className="th-spotlight__side th-spotlight__side--home">
                <strong>{match.homeTeam?.shortName ?? '待定'}</strong>
                <TeamCrest team={match.homeTeam} size="medium" interactive={false} />
              </span>
              <em className={hasScore ? 'is-score' : 'is-vs'}>
                {hasScore ? `${match.homeScore} : ${match.awayScore}` : 'VS'}
              </em>
              <span className="th-spotlight__side th-spotlight__side--away">
                <TeamCrest team={match.awayTeam} size="medium" interactive={false} />
                <strong>{match.awayTeam?.shortName ?? '待定'}</strong>
              </span>
            </span>
          </button>
        )
      })}
    </div>
  )
}

function TeamSchedule({
  matches,
  tournamentId,
}: {
  matches: MatchSummary[]
  tournamentId: string
}) {
  const [filter, setFilter] = useState('all')
  const completed = (match: MatchSummary) =>
    ['FINISHED', 'CONFIRMED', 'ABANDONED', 'CANCELLED'].includes(match.status)
  const visible = matches
    .filter(
      (match) => filter === 'all' || (filter === 'past' ? completed(match) : !completed(match)),
    )
    .sort((a, b) => {
      if (filter === 'all' && completed(a) !== completed(b)) return completed(a) ? 1 : -1
      const time =
        (Date.parse(a.scheduledStartAt ?? '') || 0) - (Date.parse(b.scheduledStartAt ?? '') || 0)
      return completed(a) && completed(b) ? -time : time
    })
  return (
    <>
      <div className="th-filters" aria-label="筛选球队赛程">
        {[
          ['all', '全部'],
          ['next', '即将进行'],
          ['past', '历史比赛'],
        ].map(([id, label]) => (
          <button
            key={id}
            data-team-control
            type="button"
            aria-pressed={filter === id}
            className={filter === id ? 'is-active' : ''}
            onClick={() => setFilter(id!)}
          >
            {label}
          </button>
        ))}
      </div>
      {visible.length ? (
        visible.map((match) => (
          <article
            className="th-match"
            key={match.id}
            role="button"
            tabIndex={0}
            aria-label={`查看${match.homeTeam?.name ?? TBD_LABEL}对${match.awayTeam?.name ?? TBD_LABEL}比赛详情`}
            onClick={() => void openMatch(match.id, tournamentId)}
            onKeyDown={(event) => {
              if (event.target !== event.currentTarget || !['Enter', ' '].includes(event.key))
                return
              event.preventDefault()
              void openMatch(match.id, tournamentId)
            }}
          >
            <div className="th-match__date">
              <strong>{formatDate(match.scheduledStartAt)}</strong>
              <span>
                {[
                  match.scheduledStartAt ? formatTime(match.scheduledStartAt) : null,
                  match.roundName ?? match.stageName ?? match.title,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </span>
            </div>
            <div className="th-match__main">
              <div className="th-match__teams">
                <TeamIdentity team={match.homeTeam} tournamentId={match.tournamentId} mirrored />
                <span className="th-score">
                  {match.homeScore !== null && match.awayScore !== null
                    ? `${match.homeScore} : ${match.awayScore}`
                    : completed(match)
                      ? '待补比分'
                      : 'VS'}
                </span>
                <TeamIdentity team={match.awayTeam} tournamentId={match.tournamentId} />
              </div>
              <div className="th-match__venue">
                <TeamIcon name="pin" />
                {match.venue?.name ?? '场地待定'}
                <MatchStatus status={match.status} />
              </div>
              {match.statusReason ? <small className="th-muted">{match.statusReason}</small> : null}
            </div>
          </article>
        ))
      ) : (
        <Empty title="暂无对应比赛" copy="赛程发布或更新后，会在这里展示。" />
      )}
    </>
  )
}

export function TeamPost({
  post: original,
  tournamentId,
}: {
  post: PostSummary
  tournamentId: string
}) {
  const post = usePostInteraction(original)
  const busy = useRef(false)
  const [error, setError] = useState('')
  const [failedImages, setFailedImages] = useState<Set<string>>(() => new Set())
  const images = (
    post.imageUrls?.length ? post.imageUrls : post.imageUrl ? [post.imageUrl] : []
  ).slice(0, 3)
  const like = async () => {
    if (busy.current) return
    if (!readSession()) {
      setError('登录后可以点赞')
      return
    }
    busy.current = true
    setError('')
    try {
      const result = await productRepository.setLike(post.id, !post.likedByMe)
      updatePostInteraction({ ...post, likedByMe: result.liked, likeCount: result.likeCount })
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : '点赞失败，请重试')
    } finally {
      busy.current = false
    }
  }
  return (
    <article className="th-post">
      <div className="th-post__avatar" data-team-action>
        {post.team ? (
          <TeamCrest team={post.team} size="medium" interactive={false} />
        ) : (
          <UserAvatar name={post.author.displayName} avatarUrl={post.author.avatarUrl} />
        )}
      </div>
      <div className="th-post__body">
        <div className="th-post__byline">
          {post.team ? (
            <button
              data-team-control
              type="button"
              className="th-name"
              onClick={() => void openTeam(post.team!.id, tournamentId)}
            >
              {post.team.name}
            </button>
          ) : (
            <strong>{post.author.displayName}</strong>
          )}
          <time>{formatRelativeTime(post.publishedAt)}</time>
        </div>
        <button
          data-team-control
          type="button"
          className="th-post__text"
          onClick={() => void openPost(post.id)}
        >
          {post.title ? <strong>{post.title}</strong> : null}
          <EmojiText>{post.body}</EmojiText>
        </button>
        <PostTags tags={post.tags} tournamentId={post.tournamentId ?? tournamentId} />
        {images.length ? (
          <div
            className={`th-post__images ${images.length === 1 ? 'th-post__images--single' : ''}`}
          >
            {images.map((source) => (
              <button
                key={source}
                data-team-control
                type="button"
                onClick={() => void openPost(post.id)}
                aria-label="打开动态图片与评论"
              >
                {failedImages.has(source) ? (
                  <span className="th-image-failed">图片暂不可用</span>
                ) : (
                  <img
                    src={resolveMediaUrl(source)}
                    alt={post.title ?? '球队动态配图'}
                    loading="lazy"
                    onError={() => setFailedImages((current) => new Set(current).add(source))}
                  />
                )}
              </button>
            ))}
          </div>
        ) : null}
        <div className="th-post__footer">
          <span className="th-muted">{post.author.displayName}</span>
          <div>
            <button
              data-team-control
              type="button"
              aria-label={post.likedByMe ? '取消点赞' : '点赞'}
              aria-pressed={post.likedByMe}
              className={post.likedByMe ? 'is-liked' : ''}
              onClick={() => void like()}
            >
              <TeamIcon name="like" />
              {post.likeCount}
            </button>
            <button
              data-team-control
              type="button"
              aria-label="打开动态评论"
              onClick={() => void openPost(post.id)}
            >
              <TeamIcon name="comment" />
              {post.commentCount}
            </button>
            <button
              data-team-control
              type="button"
              aria-label="查看动态详情"
              onClick={() => void openPost(post.id)}
            >
              <TeamIcon name="arrow" />
            </button>
          </div>
        </div>
        {error ? (
          <p role="alert" className="th-inline-error">
            {error}
          </p>
        ) : null}
      </div>
    </article>
  )
}

function TeamProfile({ data }: { data: TeamDashboardResponse }) {
  const [filter, setFilter] = useState('all')
  return (
    <div className="th-columns">
      <section className="th-surface">
        <div className="th-heading">
          <h2>球队资料</h2>
        </div>
        <div className="th-profile-facts">
          {[
            ['成立时间', data.team.foundedYear ? `${data.team.foundedYear}年` : '暂未登记'],
            ['所属院系', data.team.collegeName ?? '暂未登记'],
            ['球队编号', data.team.teamCode],
            ['球队主色', data.team.primaryColor ?? '暂未登记'],
          ].map(([label, value]) => (
            <div key={label}>
              <small>{label}</small>
              <strong>{value}</strong>
            </div>
          ))}
        </div>
        <div className="th-profile-copy">
          <TeamIcon name="file" />
          <div>
            <h3>球队简介</h3>
            <p>{data.team.description ?? '球队简介暂未登记。'}</p>
          </div>
        </div>
        <div className="th-profile-block">
          <h2>球队故事</h2>
          {data.team.foundedYear ? (
            <div className="th-timeline">
              <span className="th-timeline__dot" />
              <div>
                <strong>{data.team.foundedYear} · 球队成立</strong>
                <p>{data.team.collegeName ?? data.team.name}</p>
              </div>
            </div>
          ) : null}
          <p className="th-muted">更多球队历史尚未登记。</p>
        </div>
        <div className="th-profile-block">
          <h2>荣誉记录</h2>
          <Empty title="暂无已登记荣誉" copy="历史荣誉登记后，将在这里留下球队的高光时刻。" />
        </div>
        <div className="th-profile-history">
          <div>
            <h3>历史主教练</h3>
            <Empty
              title="暂无历史记录"
              copy={
                data.team.coachName ? `现任主教练：${data.team.coachName}` : '现任主教练暂未登记'
              }
            />
          </div>
          <div>
            <h3>历史阵容</h3>
            <Empty title="暂无公开历史阵容" copy="当前公开名单可在「球员与数据」中查看。" />
          </div>
        </div>
      </section>
      <section className="th-surface">
        <div className="th-heading">
          <div>
            <h2>人员变动</h2>
            <p className="th-small-note">记录球队成员的加入与离队。</p>
          </div>
          <div className="th-filters th-filters--small">
            {[
              ['all', '全部'],
              ['join', '加入'],
              ['leave', '离队'],
            ].map(([id, label]) => (
              <button
                data-team-control
                key={id}
                type="button"
                aria-pressed={filter === id}
                className={filter === id ? 'is-active' : ''}
                onClick={() => setFilter(id!)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <Empty
          title={
            filter === 'join'
              ? '暂无加入记录'
              : filter === 'leave'
                ? '暂无离队记录'
                : '暂无公开人员变动记录'
          }
          copy="当前公开档案尚未提供人员变动历史。"
        />
        <div className="th-transfer-note">
          <h3>
            <TeamIcon name="file" />
            人员变动说明
          </h3>
          <p>
            校园球队的人员变动可包括新生加入、校内队伍调整、毕业离队等。已登记的公开记录将在这里展示。
          </p>
        </div>
      </section>
    </div>
  )
}

export async function openPlayer(playerId: string, tournamentId: string) {
  await openPlayerProfile(playerId, tournamentId)
}
