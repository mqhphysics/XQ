import { Button, Input, ScrollView, Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useNativeRefreshTask } from '../../features/product/native-refresh.weapp'
import { PublicShell, updatePrimaryTeamCache } from '../../components/public-shell'
import { DataState } from '../../components/public-ui'
import { TeamCrest } from '../../components/product-ui'
import { NativeDialog } from '../../components/native-ui/index.weapp'
import { NativeInlineContentContext } from '../../components/native-navigation/panel-context.weapp'
import { useNativeTournamentId } from '../../features/native-navigation/index.weapp'
import { productRepository } from '../../features/product/product.repository'
import { readSession } from '../../features/product/session'
import type {
  HomeResponse,
  PlayerFollowItem,
  TeamPreferencesResponse,
  TeamSummary,
} from '../../features/product/product.types'
import NativeTeamScreen from '../readonly-team-detail/screen.weapp'
import NativePlayerScreen from '../player-detail/screen.weapp'
import { NativePlayerFace } from '../../components/native-ui/player-face.weapp'
import { useNativeDragSort } from '../../components/native-ui/drag-sort.weapp'
import {
  applyHubOrder,
  hubToken,
  type HubOrderKey,
} from '../../components/team-hub/hub-order.logic'
import { loadNativeHubOrder, saveNativeHubOrder } from '../../components/team-hub/hub-order.weapp'
import './hub.weapp.scss'

type FollowedRow = { kind: 'team'; item: TeamSummary } | { kind: 'player'; item: PlayerFollowItem }

export default function NativeTeamHub() {
  const tournamentId = useNativeTournamentId()
  const [home, setHome] = useState<HomeResponse | null>(null),
    [prefs, setPrefs] = useState<TeamPreferencesResponse | null>(null),
    [players, setPlayers] = useState<PlayerFollowItem[]>([]),
    [order, setOrder] = useState<HubOrderKey[]>([])
  const [selected, setSelected] = useState<{ kind: 'team' | 'player'; id: string } | null>(null),
    [error, setError] = useState(''),
    [loading, setLoading] = useState(true),
    [manage, setManage] = useState(false)
  const request = useRef(0)
  useEffect(() => {
    const open = (requestedOwner?: string) => {
      const user = readSession()?.user,
        owner = user ? `${user.organizationId}:${user.id}` : ''
      try {
        if (
          owner &&
          (requestedOwner === owner || Taro.getStorageSync('xiaoqiu:guide:choose-team') === owner)
        ) {
          setManage(true)
          Taro.removeStorageSync('xiaoqiu:guide:choose-team')
        }
      } catch {
        if (owner && requestedOwner === owner) setManage(true)
      }
    }
    open()
    Taro.eventCenter.on('xiaoqiu:guide:choose-team', open)
    return () => {
      Taro.eventCenter.off('xiaoqiu:guide:choose-team', open)
    }
  }, [])
  const load = useCallback(async () => {
    const ticket = ++request.current
    setError('')
    try {
      const [nextHome, nextPrefs, nextPlayers] = await Promise.all([
        productRepository.getHome(tournamentId || undefined),
        readSession()
          ? productRepository.getTeamPreferences(tournamentId || undefined)
          : Promise.resolve(null),
        readSession() ? productRepository.getPlayerFollows() : Promise.resolve({ items: [] }),
      ])
      const nextOrder = await loadNativeHubOrder()
      if (ticket !== request.current) return
      setHome(nextHome)
      setPrefs(nextPrefs)
      setPlayers(nextPlayers.items)
      setOrder(nextOrder)
      setSelected((previous) => {
        const teams = [nextPrefs?.primaryTeam, ...(nextPrefs?.followedTeams || [])].filter(
          (t): t is TeamSummary => !!t,
        )
        if (
          previous &&
          (previous.kind === 'team'
            ? teams.some((t) => t.id === previous.id)
            : nextPlayers.items.some((p) => p.id === previous.id))
        )
          return previous
        return teams[0]
          ? { kind: 'team', id: teams[0].id }
          : nextPlayers.items[0]
            ? { kind: 'player', id: nextPlayers.items[0].id }
            : null
      })
    } catch (issue) {
      if (ticket === request.current)
        setError(issue instanceof Error ? issue.message : '关注内容读取失败')
    } finally {
      if (ticket === request.current) setLoading(false)
    }
  }, [tournamentId])
  useNativeRefreshTask(load)
  useEffect(() => {
    void load()
    const refresh = () => {
      void load()
    }
    Taro.eventCenter.on('xiaoqiu:native-team-preferences', refresh)
    return () => {
      request.current++
      Taro.eventCenter.off('xiaoqiu:native-team-preferences', refresh)
    }
  }, [load])
  const primaryTeam = prefs?.primaryTeam ?? null
  /* 主队 stays pinned first; the rest follows the saved hub order (shared with H5). */
  const followed = applyHubOrder(
    (prefs?.followedTeams || []).filter((t) => t.id !== primaryTeam?.id),
    players,
    order,
  )
  const reorder = (next: HubOrderKey[]) => {
    setOrder(next)
    void saveNativeHubOrder(next)
  }
  const changedPrefs = (next: TeamPreferencesResponse) => {
    setPrefs(next)
    updatePrimaryTeamCache(next.primaryTeam)
    setSelected((previous) =>
      previous?.kind === 'team' &&
      ![next.primaryTeam, ...next.followedTeams].some((t) => t?.id === previous.id)
        ? next.primaryTeam
          ? { kind: 'team', id: next.primaryTeam.id }
          : null
        : previous || (next.primaryTeam ? { kind: 'team', id: next.primaryTeam.id } : null),
    )
  }
  const changedPlayers = (next: PlayerFollowItem[]) => {
    setPlayers(next)
    setSelected((previous) =>
      previous?.kind === 'player' && !next.some((p) => p.id === previous.id)
        ? prefs?.primaryTeam
          ? { kind: 'team', id: prefs.primaryTeam.id }
          : null
        : previous || (next[0] ? { kind: 'player', id: next[0].id } : null),
    )
  }
  return (
    <PublicShell active="team" tournamentId={tournamentId}>
      <View className="native-team-hub">
        {loading ? (
          <DataState kind="loading" title="正在读取关注" />
        ) : error ? (
          <DataState
            kind="error"
            title="关注暂不可用"
            description={error}
            onRetry={() => void load()}
          />
        ) : (
          <>
            <View className="native-hub-strip" id="native-guide-team-follow">
              <ScrollView
                className="native-hub-rail"
                scrollX
                enhanced
                showScrollbar={false}
                onTouchStart={(e) => e.stopPropagation()}
                onTouchMove={(e) => e.stopPropagation()}
                onTouchEnd={(e) => e.stopPropagation()}
              >
                <View className="native-hub-rail__items">
                  {primaryTeam && (
                    <Button
                      key={primaryTeam.id}
                      className={`native-hub-chip${selected?.kind === 'team' && selected.id === primaryTeam.id ? ' is-selected' : ''}`}
                      onClick={() => setSelected({ kind: 'team', id: primaryTeam.id })}
                    >
                      <TeamCrest team={primaryTeam} interactive={false} size="small" />
                      <Text className="native-hub-chip__name">
                        {primaryTeam.shortName || primaryTeam.name}
                      </Text>
                    </Button>
                  )}
                  {followed.map((row) =>
                    row.kind === 'team' ? (
                      <Button
                        key={row.item.id}
                        className={`native-hub-chip${selected?.kind === 'team' && selected.id === row.item.id ? ' is-selected' : ''}`}
                        onClick={() => setSelected({ kind: 'team', id: row.item.id })}
                      >
                        <TeamCrest team={row.item} interactive={false} size="small" />
                        <Text className="native-hub-chip__name">
                          {row.item.shortName || row.item.name}
                        </Text>
                      </Button>
                    ) : (
                      <Button
                        key={row.item.id}
                        className={`native-hub-chip${selected?.kind === 'player' && selected.id === row.item.id ? ' is-selected' : ''}`}
                        onClick={() => setSelected({ kind: 'player', id: row.item.id })}
                      >
                        <NativePlayerFace
                          playerId={row.item.id}
                          tournamentId={tournamentId}
                          loadPortrait
                          avatarUrl={row.item.avatarUrl}
                          name={row.item.displayName}
                        />
                        <Text className="native-hub-chip__name">{row.item.displayName}</Text>
                      </Button>
                    ),
                  )}
                  {!primaryTeam && !followed.length && (
                    <Button className="native-hub-empty" onClick={() => setManage(true)}>
                      添加关注 ＋
                    </Button>
                  )}
                </View>
              </ScrollView>
              <Button
                id="native-guide-team-menu"
                className="native-hub-menu"
                aria-label="管理关注的球队和球员"
                onClick={() => setManage(true)}
              >
                <View />
              </Button>
            </View>
            <NativeInlineContentContext.Provider value>
              {selected?.kind === 'team' ? (
                <NativeTeamScreen
                  key={`team:${selected.id}`}
                  teamId={selected.id}
                  tournamentId={tournamentId}
                  compact
                />
              ) : selected?.kind === 'player' ? (
                <NativePlayerScreen
                  key={`player:${selected.id}`}
                  playerId={selected.id}
                  tournamentId={tournamentId}
                  compact
                />
              ) : (
                <View className="native-hub-welcome">
                  <Text>关注球队和球员</Text>
                  <Button
                    className="native-button native-button--primary"
                    onClick={() => setManage(true)}
                  >
                    选择关注
                  </Button>
                </View>
              )}
            </NativeInlineContentContext.Provider>
          </>
        )}
        {manage && home && (
          <FollowManager
            home={home}
            prefs={prefs}
            players={players}
            followed={followed}
            onReorder={reorder}
            onClose={() => setManage(false)}
            onPrefs={changedPrefs}
            onPlayers={changedPlayers}
          />
        )}
      </View>
    </PublicShell>
  )
}
function FollowManager({
  home,
  prefs,
  players,
  followed,
  onReorder,
  onClose,
  onPrefs,
  onPlayers,
}: {
  home: HomeResponse
  prefs: TeamPreferencesResponse | null
  players: PlayerFollowItem[]
  followed: FollowedRow[]
  onReorder: (next: HubOrderKey[]) => void
  onClose: () => void
  onPrefs: (next: TeamPreferencesResponse) => void
  onPlayers: (next: PlayerFollowItem[]) => void
}) {
  const [discover, setDiscover] = useState(false),
    [query, setQuery] = useState(''),
    [results, setResults] = useState<PlayerFollowItem[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('')
  const lock = useRef(false),
    searchTicket = useRef(0)
  const run = async (work: () => Promise<void>) => {
    if (lock.current) return
    if (!readSession()) {
      void Taro.showToast({ title: '登录后可以关注球队和球员', icon: 'none' })
      return
    }
    lock.current = true
    setBusy(true)
    setError('')
    try {
      await work()
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : '操作失败')
    } finally {
      lock.current = false
      setBusy(false)
    }
  }
  const teamAction = (team: TeamSummary, primary = false) =>
    void run(async () => {
      const before = await productRepository.getTeamPreferences(home.tournament.id),
        ids = before.followedTeams.map((t) => t.id),
        isFollowed = ids.includes(team.id),
        nextPrimary = primary || !before.primaryTeam ? team.id : before.primaryTeam.id
      /* The previous 主队 stays followed when another team becomes 主队. */
      const nextFollowed = primary
        ? [...ids, ...(before.primaryTeam ? [before.primaryTeam.id] : [])]
        : isFollowed
          ? ids.filter((id) => id !== team.id)
          : [...ids, team.id]
      onPrefs(
        await productRepository.updateTeamPreferences(
          nextPrimary,
          nextFollowed.filter((id) => id !== nextPrimary),
        ),
      )
    })
  const playerAction = (player: PlayerFollowItem) =>
    void run(async () =>
      onPlayers(
        (players.some((p) => p.id === player.id)
          ? await productRepository.unfollowPlayer(player.id)
          : await productRepository.followPlayer(player.id)
        ).items,
      ),
    )
  const search = async () => {
    const ticket = ++searchTicket.current
    if (!query.trim()) {
      setResults([])
      return
    }
    setBusy(true)
    setError('')
    try {
      const value = await productRepository.search(query.trim(), 'PLAYER', home.tournament.id)
      if (ticket === searchTicket.current) setResults(value.players)
    } catch (issue) {
      if (ticket === searchTicket.current)
        setError(issue instanceof Error ? issue.message : '搜索失败')
    } finally {
      if (ticket === searchTicket.current) setBusy(false)
    }
  }
  const teamRows = discover
    ? home.teams.filter((t) => !query.trim() || t.name.includes(query.trim()))
    : []
  const playerRows = discover ? results : []
  const primaryTeam = prefs?.primaryTeam ?? null
  const followCount = discover ? 0 : (primaryTeam ? 1 : 0) + followed.length
  const sort = useNativeDragSort({
    items: followed,
    rowSelector: '.native-hub-sort-list .native-hub-sort-row',
    disabled: busy || discover,
    onReorder: (next) => onReorder(next.map((row) => ({ kind: row.kind, id: row.item.id }))),
  })
  /* With no follows the hint sits in the middle of the fixed-height body, not under the tabs. */
  const [emptyHeight, setEmptyHeight] = useState(() => {
    const { windowHeight } = Taro.getWindowInfo()
    const body = Math.min(Math.max(100, Math.min(460, windowHeight - 160)), windowHeight * 0.57)
    return Math.max(0, Math.round(body - 92))
  })
  const emptyState = !discover && followCount === 0
  useEffect(() => {
    if (!emptyState) return
    const timer = setTimeout(() => {
      Taro.createSelectorQuery()
        .select('.native-hub-manager-tabs')
        .boundingClientRect()
        .select('.native-hub-follow-hint-wrap')
        .boundingClientRect()
        .selectAll('.native-dialog__body')
        .boundingClientRect()
        .exec((result: unknown[]) => {
          const tabs = result?.[0] as { bottom?: number } | null,
            wrap = result?.[1] as { top?: number } | null,
            bodies = (result?.[2] ?? []) as { bottom?: number; height?: number }[],
            body = bodies.filter((item) => item?.height).pop()
          if (!tabs?.bottom || !wrap?.top || !body?.bottom) return
          /* 12px keeps the content padding below the hint so the body never scrolls. */
          const next = Math.round(body.bottom - wrap.top - 12)
          if (next > 120) setEmptyHeight(next)
        })
    }, 60)
    return () => clearTimeout(timer)
  }, [emptyState])
  return (
    <NativeDialog title="关注管理" onClose={onClose} busy={busy} compact={false}>
      <View className={`native-hub-manager-tabs${discover ? ' is-discover' : ''}`} role="tablist">
        <View className="native-hub-manager-tabs__thumb" aria-hidden="true" />
        <Button
          className={!discover ? 'is-active' : ''}
          aria-selected={!discover}
          onClick={() => setDiscover(false)}
        >
          已关注
        </Button>
        <Button
          className={discover ? 'is-active' : ''}
          aria-selected={discover}
          onClick={() => setDiscover(true)}
        >
          添加关注
        </Button>
      </View>
      {discover && (
        <View className="native-hub-search">
          <Input
            className="native-field"
            placeholder="搜索球队、球员"
            value={query}
            confirmType="search"
            onInput={(e) => setQuery(e.detail.value)}
            onConfirm={() => void search()}
          />
          <Button className="native-button" disabled={busy} onClick={() => void search()}>
            搜索
          </Button>
        </View>
      )}
      {error && <Text className="native-error">{error}</Text>}
      {!discover && primaryTeam && (
        <>
          <Text className="native-hub-section-label">主队</Text>
          <View className="native-hub-manage-row native-hub-manage-row--primary">
            <View className="native-hub-pin" aria-hidden="true" />
            <TeamCrest team={primaryTeam} size="small" interactive={false} />
            <Text>{primaryTeam.name}</Text>
            <Text className="native-hub-primary-badge">主队</Text>
          </View>
        </>
      )}
      {!discover && followed.length > 0 && (
        <>
          <View className="native-hub-section-label native-hub-section-label--row">
            <Text>关注的球队和球员</Text>
            {followed.length > 1 && <Text className="native-hub-section-tip">按住 ≡ 拖动排序</Text>}
          </View>
          <View className={`native-hub-sort-list${sort.drag ? ' is-sorting' : ''}`}>
            {followed.map((row, index) => (
              <View
                key={hubToken({ kind: row.kind, id: row.item.id })}
                ref={sort.rowRef(index)}
                className={`native-hub-manage-row native-hub-sort-row ${sort.rowClassName(index)}`}
                style={sort.rowStyle(index)}
              >
                <View
                  className="native-drag-handle"
                  aria-label="拖动排序"
                  {...sort.handleProps(index)}
                >
                  <Text>≡</Text>
                </View>
                {row.kind === 'team' ? (
                  <TeamCrest team={row.item} size="small" interactive={false} />
                ) : (
                  <NativePlayerFace
                    playerId={row.item.id}
                    tournamentId={home.tournament.id}
                    avatarUrl={row.item.avatarUrl}
                    name={row.item.displayName}
                    loadPortrait
                  />
                )}
                <Text>{row.kind === 'team' ? row.item.name : row.item.displayName}</Text>
                {row.kind === 'team' && (
                  <Button
                    className="native-button native-button--quiet"
                    disabled={busy}
                    onClick={() => teamAction(row.item, true)}
                  >
                    设主队
                  </Button>
                )}
                <Button
                  className="native-button native-button--quiet"
                  disabled={busy}
                  onClick={() =>
                    row.kind === 'team' ? teamAction(row.item) : playerAction(row.item)
                  }
                >
                  取消关注
                </Button>
              </View>
            ))}
          </View>
        </>
      )}
      {teamRows.map((team) => {
        const primary = prefs?.primaryTeam?.id === team.id,
          followed = primary || prefs?.followedTeams.some((t) => t.id === team.id)
        return (
          <View className="native-hub-manage-row" key={team.id}>
            <TeamCrest team={team} size="small" interactive={false} />
            <Text>{team.name}</Text>
            <Button
              className="native-button native-button--quiet"
              disabled={busy || primary}
              onClick={() => teamAction(team, true)}
            >
              {primary ? '主队' : '设主队'}
            </Button>
            {!primary && (
              <Button
                className="native-button native-button--quiet"
                disabled={busy}
                onClick={() => teamAction(team)}
              >
                {followed ? '取消关注' : '关注'}
              </Button>
            )}
          </View>
        )
      })}
      {playerRows.map((player) => (
        <View className="native-hub-manage-row" key={player.id}>
          <NativePlayerFace
            playerId={player.id}
            tournamentId={home.tournament.id}
            avatarUrl={player.avatarUrl}
            name={player.displayName}
            loadPortrait
          />
          <Text>{player.displayName}</Text>
          <Button
            className="native-button native-button--quiet"
            disabled={busy}
            onClick={() => playerAction(player)}
          >
            {players.some((p) => p.id === player.id) ? '取消关注' : '关注'}
          </Button>
        </View>
      ))}
      {!discover && followCount < 3 && (
        <View
          className={`native-hub-follow-hint-wrap${followCount ? '' : ' is-empty'}`}
          style={followCount ? '' : `min-height:${emptyHeight}px;`}
        >
          <View className="native-hub-follow-hint">
            <Text className="native-hub-follow-hint__title">
              {followCount ? '再多关注几个吧' : '还没有关注'}
            </Text>
            <Text className="native-hub-follow-hint__body">关注球队和球员，动态和数据更贴近你</Text>
            <Button
              className="native-button native-button--primary native-hub-follow-hint__action"
              onClick={() => setDiscover(true)}
            >
              添加关注
            </Button>
          </View>
        </View>
      )}
      {discover && query && !playerRows.length && !busy && (
        <Text className="native-note">未找到球员</Text>
      )}
    </NativeDialog>
  )
}
