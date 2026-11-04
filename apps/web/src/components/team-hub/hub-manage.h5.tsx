import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { announcePrimaryTeamSet } from '../public-shell/navigation-transition.h5'
import { createPortal } from 'react-dom'
import Taro from '@tarojs/taro'
import { productRepository } from '../../features/product/product.repository'
import { positionLabel } from '../../features/product/product.format'
import { readSession } from '../../features/product/session'
import type {
  PlayerFollowItem,
  PlayerFollowsResponse,
  SearchResponse,
  TeamPreferencesResponse,
  TeamSummary,
} from '../../features/product/product.types'
import { TeamCrest } from '../product-ui'
import { PlayerAvatar } from '../player-avatar.h5'
import { useOverlayFocus } from '../overlay-focus'
import { saveTeamPreference } from './follow.h5'
import { Empty } from './content.h5'
import { TeamIcon } from './icons.h5'
import { publishPreferences, withPrimary } from './picker.h5'
import {
  applyHubOrder,
  hubToken,
  insertFollowKey,
  moveItem,
  removeFollowKey,
  type HubOrderKey,
} from './hub-order.logic'

type FollowedRow = { kind: 'team'; item: TeamSummary } | { kind: 'player'; item: PlayerFollowItem }

export function HubManageDialog({
  preferences,
  teams,
  follows,
  order,
  tournamentId,
  onClose,
  onOrderChange,
  onPreferences,
  onFollows,
}: {
  preferences: TeamPreferencesResponse | null
  teams: TeamSummary[]
  follows: PlayerFollowsResponse
  order: HubOrderKey[]
  tournamentId: string
  onClose: () => void
  onOrderChange: (order: HubOrderKey[]) => void
  onPreferences: (value: TeamPreferencesResponse) => void
  onFollows: (value: PlayerFollowsResponse) => void
}) {
  const [discover, setDiscover] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const locked = useRef(false)
  const searchRef = useRef<HTMLInputElement>(null)
  const close = () => {
    if (!locked.current) onClose()
  }
  useOverlayFocus(true, '.th-hub-dialog', close)
  const followed = applyHubOrder(preferences?.followedTeams ?? [], follows.items, order)
  useEffect(() => {
    if (!discover) {
      setResults(null)
      setLoading(false)
      return
    }
    let active = true
    setLoading(true)
    setError('')
    const timer = window.setTimeout(() => {
      void loadDiscoverResults(query.trim(), tournamentId, teams, preferences)
        .then((data) => {
          if (active) setResults(data)
        })
        .catch((issue) => {
          if (active) setError(issue instanceof Error ? issue.message : '搜索失败，请重试')
        })
        .finally(() => {
          if (active) setLoading(false)
        })
    }, 220)
    return () => {
      active = false
      window.clearTimeout(timer)
    }
  }, [discover, preferences, query, teams, tournamentId])
  const enterDiscover = () => setDiscover(true)
  const leaveDiscover = () => {
    setDiscover(false)
    setQuery('')
    setResults(null)
    searchRef.current?.blur()
  }
  const withLock = async (token: string, work: () => Promise<void>) => {
    if (locked.current) return
    locked.current = true
    setBusy(token)
    setError('')
    try {
      await work()
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : '操作失败，请重试')
    } finally {
      locked.current = false
      setBusy(null)
    }
  }
  const toggleTeam = (team: TeamSummary) => {
    if (!readSession()) {
      void Taro.showToast({ title: '登录后可以关注球队和球员', icon: 'none' })
      return
    }
    const followedAlready =
      preferences?.primaryTeam?.id === team.id ||
      Boolean(preferences?.followedTeams.some((item) => item.id === team.id))
    void withLock(`team:${team.id}`, async () => {
      if (!preferences?.primaryTeam && !followedAlready) {
        const next = await productRepository.updateTeamPreferences(team.id, [])
        publishPreferences(next)
        onPreferences(next)
        return
      }
      const next = await saveTeamPreference(team.id, 'follow')
      onPreferences(next)
      const key = { kind: 'team' as const, id: team.id }
      onOrderChange(followedAlready ? removeFollowKey(order, key) : insertFollowKey(order, key))
    })
  }
  const togglePlayer = (playerId: string) => {
    if (!readSession()) {
      void Taro.showToast({ title: '登录后可以关注球队和球员', icon: 'none' })
      return
    }
    const followedAlready = follows.items.some((item) => item.id === playerId)
    void withLock(`player:${playerId}`, async () => {
      const next = await (followedAlready
        ? productRepository.unfollowPlayer(playerId)
        : productRepository.followPlayer(playerId))
      onFollows(next)
      const key = { kind: 'player' as const, id: playerId }
      onOrderChange(followedAlready ? removeFollowKey(order, key) : insertFollowKey(order, key))
    })
  }
  const setPrimary = (teamId: string) => {
    if (!readSession()) {
      void Taro.reLaunch({ url: '/pages/login/index' })
      return
    }
    const chosen =
      preferences?.followedTeams.find((team) => team.id === teamId) ??
      teams.find((team) => team.id === teamId)
    announcePrimaryTeamSet()
    if (preferences && chosen) publishPreferences(withPrimary(preferences, chosen))
    void withLock(`primary:${teamId}`, async () => {
      const current = await productRepository.getTeamPreferences().catch((issue) => {
        if (preferences && chosen) publishPreferences(preferences)
        throw issue
      })
      const ids = current.followedTeams.map((team) => team.id).filter((id) => id !== teamId)
      if (current.primaryTeam && current.primaryTeam.id !== teamId)
        ids.unshift(current.primaryTeam.id)
      const next = await productRepository.updateTeamPreferences(teamId, ids).catch((issue) => {
        publishPreferences(current)
        throw issue
      })
      publishPreferences(next)
      onPreferences(next)
      onOrderChange(
        current.primaryTeam && current.primaryTeam.id !== teamId
          ? insertFollowKey(removeFollowKey(order, { kind: 'team', id: teamId }), {
              kind: 'team',
              id: current.primaryTeam.id,
            })
          : removeFollowKey(order, { kind: 'team', id: teamId }),
      )
    })
  }
  const recommendedTeams = recommendTeams(teams, preferences, results, query.trim())
  const recommendedPlayers = recommendPlayers(follows.items, results, query.trim())
  return createPortal(
    <div
      className="th-scrim"
      onClick={(event) => {
        if (event.target === event.currentTarget) close()
      }}
    >
      <section
        className="th-picker th-hub-dialog th-root xq-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="th-hub-title"
      >
        <div className="th-heading xq-dialog__header">
          <div>
            <h2 id="th-hub-title">关注与排序</h2>
            <p className="th-small-note">
              {discover ? '发现并关注校园球队、球员' : '拖动调整关注顺序，主队始终排在最前'}
            </p>
          </div>
          <button
            data-team-control
            type="button"
            className="th-icon-button"
            aria-label="关闭关注与排序"
            disabled={Boolean(busy)}
            onClick={close}
          >
            <TeamIcon name="close" />
          </button>
        </div>
        <div className={`th-hub-search ${discover ? 'is-discover' : ''}`}>
          {discover ? (
            <button
              data-team-control
              type="button"
              className="th-icon-button th-hub-search__back"
              aria-label="返回已关注列表"
              onClick={leaveDiscover}
            >
              <TeamIcon name="back" />
            </button>
          ) : null}
          <label className="th-search">
            <TeamIcon name="search" />
            <input
              ref={searchRef}
              data-team-control
              aria-label="搜索球队或球员"
              placeholder="搜索球队或球员"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onFocus={enterDiscover}
            />
            {query ? (
              <button
                data-team-control
                type="button"
                aria-label="清空搜索"
                onClick={() => setQuery('')}
              >
                <TeamIcon name="close" />
              </button>
            ) : null}
          </label>
        </div>
        {error ? (
          <p className="th-inline-error" role="alert">
            {error}
          </p>
        ) : null}
        <div className="th-hub-dialog__body xq-dialog__body">
          {discover ? (
            <DiscoverList
              loading={loading}
              query={query.trim()}
              teams={recommendedTeams}
              players={recommendedPlayers}
              preferences={preferences}
              follows={follows}
              busy={busy}
              onToggleTeam={toggleTeam}
              onTogglePlayer={togglePlayer}
            />
          ) : (
            <FollowedList
              rows={followed}
              primary={preferences?.primaryTeam ?? null}
              busy={Boolean(busy)}
              onReorder={(next) =>
                onOrderChange(next.map((row) => ({ kind: row.kind, id: row.item.id })))
              }
              onUnfollowTeam={(team) => toggleTeam(team)}
              onUnfollowPlayer={(id) => togglePlayer(id)}
              onSetPrimary={setPrimary}
            />
          )}
        </div>
      </section>
    </div>,
    document.body,
  )
}

function DiscoverList({
  loading,
  query,
  teams,
  players,
  preferences,
  follows,
  busy,
  onToggleTeam,
  onTogglePlayer,
}: {
  loading: boolean
  query: string
  teams: TeamSummary[]
  players: SearchResponse['players']
  preferences: TeamPreferencesResponse | null
  follows: PlayerFollowsResponse
  busy: string | null
  onToggleTeam: (team: TeamSummary) => void
  onTogglePlayer: (id: string) => void
}) {
  if (loading) return <p className="th-hub-hint">正在寻找推荐…</p>
  if (!teams.length && !players.length)
    return (
      <Empty
        title={query ? '没有找到对应的球队或球员' : '暂时没有更多推荐'}
        copy={query ? '试试其他名称、学院或球衣名。' : '关注列表会随着赛事名单一起更新。'}
      />
    )
  return (
    <div className="th-hub-discover">
      {teams.length ? (
        <section>
          <h3>球队</h3>
          {teams.map((team) => {
            const followed =
              preferences?.primaryTeam?.id === team.id ||
              Boolean(preferences?.followedTeams.some((item) => item.id === team.id))
            const isPrimary = preferences?.primaryTeam?.id === team.id
            return (
              <div className="th-hub-row" key={`team:${team.id}`}>
                <TeamCrest team={team} interactive={false} />
                <HubRowCopy
                  name={team.name}
                  subtitle={team.collegeName ?? '校园球队'}
                  kind={isPrimary ? 'home' : 'team'}
                />
                <button
                  data-team-control
                  type="button"
                  className={`th-soft-button ${followed ? 'is-followed' : ''}`}
                  disabled={Boolean(busy) || isPrimary}
                  aria-pressed={followed}
                  onClick={() => onToggleTeam(team)}
                >
                  {busy === `team:${team.id}`
                    ? '保存中…'
                    : isPrimary
                      ? '主队'
                      : followed
                        ? '已关注'
                        : '关注'}
                </button>
              </div>
            )
          })}
        </section>
      ) : null}
      {players.length ? (
        <section>
          <h3>球员</h3>
          {players.map((player) => {
            const followed = follows.items.some((item) => item.id === player.id)
            return (
              <div className="th-hub-row" key={`player:${player.id}`}>
                <PlayerAvatar name={player.displayName} avatarUrl={player.avatarUrl} />
                <HubRowCopy
                  name={player.displayName}
                  subtitle={`${positionLabel(player.position)} · ${player.team?.name ?? '球队未登记'}`}
                  kind="player"
                />
                <button
                  data-team-control
                  type="button"
                  className={`th-soft-button ${followed ? 'is-followed' : ''}`}
                  disabled={Boolean(busy)}
                  aria-pressed={followed}
                  onClick={() => onTogglePlayer(player.id)}
                >
                  {busy === `player:${player.id}` ? '保存中…' : followed ? '已关注' : '关注'}
                </button>
              </div>
            )
          })}
        </section>
      ) : null}
    </div>
  )
}

function HubRowCopy({
  name,
  subtitle,
  kind,
}: {
  name: string
  subtitle: string
  kind: 'home' | 'team' | 'player'
}) {
  const label = kind === 'home' ? '主队' : kind === 'team' ? '球队' : '球员'
  return (
    <span className="th-hub-row__copy">
      <strong>
        {name}
        <em className={`th-hub-row__kind ${kind === 'home' ? 'th-hub-row__kind--home' : ''}`}>
          {label}
        </em>
      </strong>
      <small>{subtitle}</small>
    </span>
  )
}

function FollowedList({
  rows,
  primary,
  busy,
  onReorder,
  onUnfollowTeam,
  onUnfollowPlayer,
  onSetPrimary,
}: {
  rows: FollowedRow[]
  primary: TeamSummary | null
  busy: boolean
  onReorder: (rows: FollowedRow[]) => void
  onUnfollowTeam: (team: TeamSummary) => void
  onUnfollowPlayer: (id: string) => void
  onSetPrimary: (id: string) => void
}) {
  const [drag, setDrag] = useState<{
    from: number
    over: number
    height: number
    originY: number
    offsetY: number
    pointerY: number
    mids: number[]
  } | null>(null)
  const dragRef = useRef(drag)
  const rowsRef = useRef(rows)
  const onReorderRef = useRef(onReorder)
  const listRef = useRef<HTMLUListElement>(null)
  const rowRefs = useRef<(HTMLLIElement | null)[]>([])
  const stopRef = useRef<(() => void) | null>(null)
  dragRef.current = drag
  rowsRef.current = rows
  onReorderRef.current = onReorder
  useEffect(() => {
    rowRefs.current = rowRefs.current.slice(0, rows.length)
  }, [rows.length])
  useEffect(
    () => () => {
      stopRef.current?.()
    },
    [],
  )
  if (!primary && !rows.length)
    return (
      <Empty title="还没有关注球队或球员" copy="点上方搜索框，从推荐里关注你想放进主队条的对象。" />
    )
  const beginDrag = (index: number, clientY: number) => {
    const row = rowRefs.current[index]
    if (!row) return
    const rect = row.getBoundingClientRect()
    const mids = rowRefs.current.map((node) => {
      const box = node?.getBoundingClientRect()
      return box ? box.top + box.height / 2 : 0
    })
    const next = {
      from: index,
      over: index,
      height: rect.height,
      originY: rect.top,
      offsetY: clientY - rect.top,
      pointerY: clientY,
      mids,
    }
    dragRef.current = next
    setDrag(next)
    const move = (event: PointerEvent | MouseEvent) => {
      event.preventDefault()
      const current = dragRef.current
      if (!current) return
      let over = current.from
      for (let i = 0; i < current.mids.length; i += 1) {
        if (event.clientY >= current.mids[i]!) over = i
      }
      const following = { ...current, over, pointerY: event.clientY }
      dragRef.current = following
      setDrag(following)
    }
    const finish = () => {
      stopRef.current?.()
      stopRef.current = null
      const current = dragRef.current
      dragRef.current = null
      setDrag(null)
      if (current && current.from !== current.over)
        onReorderRef.current(moveItem(rowsRef.current, current.from, current.over))
    }
    stopRef.current?.()
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', finish)
    window.addEventListener('pointercancel', finish)
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', finish)
    stopRef.current = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', finish)
      window.removeEventListener('pointercancel', finish)
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', finish)
    }
  }
  const onPointerDown = (index: number, event: ReactPointerEvent<HTMLLIElement>) => {
    if (busy || event.button > 0) return
    if ((event.target as HTMLElement).closest('button')) return
    event.preventDefault()
    event.stopPropagation()
    try {
      event.currentTarget.setPointerCapture(event.pointerId)
    } catch {
      /* capture is optional */
    }
    beginDrag(index, event.clientY)
  }
  return (
    <div className="th-hub-followed">
      {primary ? (
        <div className="th-hub-row th-hub-row--pinned">
          <TeamCrest team={primary} interactive={false} />
          <HubRowCopy
            name={primary.name}
            subtitle={primary.collegeName ?? '当前主队'}
            kind="home"
          />
        </div>
      ) : null}
      {rows.length ? (
        <ul ref={listRef} className={`th-hub-sort ${drag ? 'is-dragging' : ''}`}>
          {rows.map((row, index) => {
            const token = hubToken({ kind: row.kind, id: row.item.id })
            const isActive = drag?.from === index
            const shift =
              drag && !isActive
                ? drag.from < drag.over && index > drag.from && index <= drag.over
                  ? -drag.height
                  : drag.from > drag.over && index >= drag.over && index < drag.from
                    ? drag.height
                    : 0
                : 0
            const lift = isActive && drag ? drag.pointerY - drag.originY - drag.offsetY : 0
            return (
              <li
                key={token}
                ref={(node) => {
                  rowRefs.current[index] = node
                }}
                className={`th-hub-row th-hub-row--sort ${isActive ? 'is-lifted' : ''}`}
                style={{
                  transform: isActive
                    ? `translate3d(0, ${lift}px, 0) scale(1.03)`
                    : shift
                      ? `translate3d(0, ${shift}px, 0)`
                      : undefined,
                  zIndex: isActive ? 3 : 1,
                }}
                onPointerDown={(event) => onPointerDown(index, event)}
              >
                <span className="th-hub-row__grip" aria-hidden="true">
                  <TeamIcon name="grip" />
                </span>
                {row.kind === 'team' ? (
                  <TeamCrest team={row.item} interactive={false} />
                ) : (
                  <PlayerAvatar name={row.item.displayName} avatarUrl={row.item.avatarUrl} />
                )}
                <HubRowCopy
                  name={row.kind === 'team' ? row.item.name : row.item.displayName}
                  subtitle={
                    row.kind === 'team'
                      ? (row.item.collegeName ?? '已关注球队')
                      : `${positionLabel(row.item.position)} · ${row.item.team?.name ?? '已关注球员'}`
                  }
                  kind={row.kind}
                />
                {row.kind === 'team' ? (
                  <button
                    data-team-control
                    type="button"
                    className="th-text-button"
                    disabled={busy}
                    onClick={() => onSetPrimary(row.item.id)}
                  >
                    设为主队
                  </button>
                ) : null}
                <button
                  data-team-control
                  type="button"
                  className="th-icon-button"
                  aria-label={
                    row.kind === 'team'
                      ? `取消关注${row.item.name}`
                      : `取消关注${row.item.displayName}`
                  }
                  disabled={busy}
                  onClick={() =>
                    row.kind === 'team' ? onUnfollowTeam(row.item) : onUnfollowPlayer(row.item.id)
                  }
                >
                  <TeamIcon name="close" />
                </button>
              </li>
            )
          })}
        </ul>
      ) : null}
    </div>
  )
}

async function loadDiscoverResults(
  query: string,
  tournamentId: string,
  teams: TeamSummary[],
  preferences: TeamPreferencesResponse | null,
): Promise<SearchResponse> {
  if (query) return productRepository.search(query, 'ALL', tournamentId)
  const teamId = preferences?.primaryTeam?.id ?? teams[0]?.id
  const roster = teamId
    ? await productRepository
        .getTeamDashboard(teamId, tournamentId)
        .then((data) =>
          data.roster.map((player) => ({
            id: player.id,
            displayName: player.displayName,
            position: player.position,
            academicYear: player.academicYear,
            profileColor: player.profileColor,
            avatarUrl: player.avatarUrl,
            team: data.team,
          })),
        )
        .catch(() => [])
    : []
  return {
    query: '',
    players: roster,
    teams,
    matches: [],
    posts: [],
  }
}

function recommendTeams(
  teams: TeamSummary[],
  preferences: TeamPreferencesResponse | null,
  results: SearchResponse | null,
  query: string,
): TeamSummary[] {
  const source = query ? (results?.teams ?? []) : (preferences?.availableTeams ?? teams)
  const followed = new Set([
    ...(preferences?.primaryTeam ? [preferences.primaryTeam.id] : []),
    ...(preferences?.followedTeams.map((team) => team.id) ?? []),
  ])
  const ranked = [...source].sort((a, b) => Number(followed.has(a.id)) - Number(followed.has(b.id)))
  return ranked.slice(0, query ? 12 : 16)
}

function recommendPlayers(
  followed: PlayerFollowItem[],
  results: SearchResponse | null,
  query: string,
): SearchResponse['players'] {
  const source = results?.players ?? []
  const followedIds = new Set(followed.map((item) => item.id))
  return [...source]
    .sort((a, b) => Number(followedIds.has(a.id)) - Number(followedIds.has(b.id)))
    .slice(0, query ? 12 : 16)
}
