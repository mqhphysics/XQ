import { Button, Input, ScrollView, Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useNativeRefreshTask } from '../../features/product/native-refresh.weapp'
import { PublicShell, updatePrimaryTeamCache } from '../../components/public-shell'
import { DataState } from '../../components/public-ui'
import { TeamCrest, UserAvatar } from '../../components/product-ui'
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
import './hub.weapp.scss'

export default function NativeTeamHub() {
  const tournamentId = useNativeTournamentId()
  const [home, setHome] = useState<HomeResponse | null>(null),
    [prefs, setPrefs] = useState<TeamPreferencesResponse | null>(null),
    [players, setPlayers] = useState<PlayerFollowItem[]>([])
  const [selected, setSelected] = useState<{ kind: 'team' | 'player'; id: string } | null>(null),
    [error, setError] = useState(''),
    [loading, setLoading] = useState(true),
    [manage, setManage] = useState(false)
  const request = useRef(0)
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
      if (ticket !== request.current) return
      setHome(nextHome)
      setPrefs(nextPrefs)
      setPlayers(nextPlayers.items)
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
  const teams = [prefs?.primaryTeam, ...(prefs?.followedTeams || [])].filter(
    (t): t is TeamSummary => !!t,
  )
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
            <View className="native-hub-strip">
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
                  {teams.map((team) => (
                    <Button
                      key={team.id}
                      className={`native-hub-chip${selected?.kind === 'team' && selected.id === team.id ? ' is-selected' : ''}`}
                      onClick={() => setSelected({ kind: 'team', id: team.id })}
                    >
                      <TeamCrest team={team} interactive={false} size="small" />
                      <Text className="native-hub-chip__name">{team.shortName || team.name}</Text>
                    </Button>
                  ))}
                  {players.map((player) => (
                    <Button
                      key={player.id}
                      className={`native-hub-chip${selected?.kind === 'player' && selected.id === player.id ? ' is-selected' : ''}`}
                      onClick={() => setSelected({ kind: 'player', id: player.id })}
                    >
                      <NativePlayerFace
                        playerId={player.id}
                        tournamentId={tournamentId}
                        loadPortrait
                        avatarUrl={player.avatarUrl}
                        name={player.displayName}
                      />
                      <Text className="native-hub-chip__name">{player.displayName}</Text>
                    </Button>
                  ))}
                  {!teams.length && !players.length && (
                    <Button className="native-hub-empty" onClick={() => setManage(true)}>
                      添加关注 ＋
                    </Button>
                  )}
                </View>
              </ScrollView>
              <Button
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
  onClose,
  onPrefs,
  onPlayers,
}: {
  home: HomeResponse
  prefs: TeamPreferencesResponse | null
  players: PlayerFollowItem[]
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
      const followed = primary
        ? ids
        : isFollowed
          ? ids.filter((id) => id !== team.id)
          : [...ids, team.id]
      onPrefs(
        await productRepository.updateTeamPreferences(
          nextPrimary,
          followed.filter((id) => id !== nextPrimary),
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
    : [prefs?.primaryTeam, ...(prefs?.followedTeams || [])].filter((t): t is TeamSummary => !!t)
  const playerRows = discover ? results : players
  return (
    <NativeDialog title="关注管理" onClose={onClose} busy={busy}>
      <View className="native-hub-manager-tabs">
        <Button className={!discover ? 'is-active' : ''} onClick={() => setDiscover(false)}>
          已关注
        </Button>
        <Button className={discover ? 'is-active' : ''} onClick={() => setDiscover(true)}>
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
          <UserAvatar avatarUrl={player.avatarUrl} name={player.displayName} size="small" />
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
      {!discover && !teamRows.length && !playerRows.length && (
        <Text className="native-note">暂无关注</Text>
      )}
      {discover && query && !playerRows.length && !busy && (
        <Text className="native-note">未找到球员</Text>
      )}
    </NativeDialog>
  )
}
