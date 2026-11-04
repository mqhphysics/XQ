import type { ReactNode } from 'react'

import { MatchStatus, TeamCrest } from '../../components/product-ui'
import { PlayerAvatar } from '../../components/player-avatar.h5'
import { formatDate, formatTime, positionLabel } from '../../features/product/product.format'
import { resolveMediaUrl, sizedMediaUrl } from '../../features/product/product.repository'
import type { SearchCategory, SearchResponse } from '../../features/product/product.types'

import './search-results.h5.scss'

interface Handlers {
  onTeam: (teamId: string) => void
  onPlayer: (playerId: string) => void
  onMatch: (matchId: string) => void
  onPost: (postId: string) => void
  onCategory: (category: SearchCategory) => void
}

/** Desktop search results: grouped by kind, each group a tidy grid of cards. */
export function DesktopSearchResults({
  result,
  category,
  ...on
}: Handlers & { result: SearchResponse; category: SearchCategory }) {
  const total =
    result.players.length + result.teams.length + result.matches.length + result.posts.length
  const limited = category === 'ALL'
  if (!total)
    return (
      <div className="xsr xsr--empty" role="status">
        <strong>没有找到与“{result.query}”相关的内容</strong>
        <p>换个关键词试试，比如球队简称、球员姓名或学院名称。</p>
      </div>
    )
  return (
    <div className="xsr" aria-live="polite">
      <p className="xsr__summary">
        “<b>{result.query}</b>” 共找到 {total} 项
      </p>
      {result.teams.length ? (
        <Group
          title="球队"
          count={result.teams.length}
          more={limited && result.teams.length > 6 ? () => on.onCategory('TEAM') : undefined}
        >
          <div className="xsr__grid xsr__grid--teams">
            {(limited ? result.teams.slice(0, 6) : result.teams).map((team) => (
              <button
                type="button"
                className="xsr-card xsr-team"
                key={team.id}
                onClick={() => on.onTeam(team.id)}
              >
                <TeamCrest team={team} size="medium" interactive={false} />
                <span className="xsr-card__copy">
                  <strong>{team.name}</strong>
                  <small>{team.collegeName}</small>
                </span>
              </button>
            ))}
          </div>
        </Group>
      ) : null}
      {result.players.length ? (
        <Group
          title="球员"
          count={result.players.length}
          more={limited && result.players.length > 6 ? () => on.onCategory('PLAYER') : undefined}
        >
          <div className="xsr__grid xsr__grid--players">
            {(limited ? result.players.slice(0, 6) : result.players).map((player) => (
              <button
                type="button"
                className="xsr-card xsr-player"
                key={player.id}
                onClick={() => on.onPlayer(player.id)}
              >
                <PlayerAvatar
                  avatarUrl={player.avatarUrl}
                  name={player.displayName}
                  color={player.profileColor}
                  size="small"
                />
                <span className="xsr-card__copy">
                  <strong>{player.displayName}</strong>
                  <small>
                    {[
                      player.team?.shortName ?? '暂无球队',
                      player.position ? positionLabel(player.position) : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </small>
                </span>
              </button>
            ))}
          </div>
        </Group>
      ) : null}
      {result.matches.length ? (
        <Group
          title="比赛"
          count={result.matches.length}
          more={limited && result.matches.length > 6 ? () => on.onCategory('MATCH') : undefined}
        >
          <div className="xsr__grid xsr__grid--matches">
            {(limited ? result.matches.slice(0, 6) : result.matches).map((match) => {
              const hasScore = match.homeScore !== null && match.awayScore !== null
              return (
                <button
                  type="button"
                  className="xsr-card xsr-match"
                  key={match.id}
                  aria-label={`查看${match.title}比赛详情`}
                  onClick={() => on.onMatch(match.id)}
                >
                  <span className="xsr-match__meta">
                    <small>
                      {formatDate(match.scheduledStartAt)} {formatTime(match.scheduledStartAt)} ·{' '}
                      {match.roundName ?? match.stageName ?? match.title}
                    </small>
                    <MatchStatus status={match.status} />
                  </span>
                  <span className="xsr-match__line">
                    <span className="xsr-match__side xsr-match__side--home">
                      <strong>{match.homeTeam?.shortName ?? '待定'}</strong>
                      <TeamCrest team={match.homeTeam} size="small" interactive={false} />
                    </span>
                    <em>{hasScore ? `${match.homeScore} : ${match.awayScore}` : 'VS'}</em>
                    <span className="xsr-match__side">
                      <TeamCrest team={match.awayTeam} size="small" interactive={false} />
                      <strong>{match.awayTeam?.shortName ?? '待定'}</strong>
                    </span>
                  </span>
                </button>
              )
            })}
          </div>
        </Group>
      ) : null}
      {result.posts.length ? (
        <Group
          title="动态"
          count={result.posts.length}
          more={limited && result.posts.length > 6 ? () => on.onCategory('POST') : undefined}
        >
          <div className="xsr__grid xsr__grid--posts">
            {(limited ? result.posts.slice(0, 6) : result.posts).map((post) => {
              const image = post.imageUrls?.[0] ?? post.imageUrl
              const source = image ? sizedMediaUrl(resolveMediaUrl(image), 256) : undefined
              return (
                <button
                  type="button"
                  className="xsr-card xsr-post"
                  key={post.id}
                  onClick={() => on.onPost(post.id)}
                >
                  <span className="xsr-card__copy">
                    <strong>{post.title ?? oneLine(post.body)}</strong>
                    {post.title ? (
                      <span className="xsr-post__body">{oneLine(post.body)}</span>
                    ) : null}
                    <small>
                      {post.author.displayName} · {formatDate(post.publishedAt)}
                    </small>
                  </span>
                  {source ? (
                    <img
                      className="xsr-post__thumb"
                      src={source}
                      alt=""
                      loading="lazy"
                      width={72}
                      height={72}
                    />
                  ) : null}
                </button>
              )
            })}
          </div>
        </Group>
      ) : null}
    </div>
  )
}

function Group({
  title,
  count,
  more,
  children,
}: {
  title: string
  count: number
  more?: (() => void) | undefined
  children: ReactNode
}) {
  return (
    <section className="xsr__group">
      <header className="xsr__group-head">
        <h3>
          {title}
          <span>{count}</span>
        </h3>
        {more ? (
          <button type="button" className="xsr__more" onClick={more}>
            查看全部
          </button>
        ) : null}
      </header>
      {children}
    </section>
  )
}

function oneLine(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}
