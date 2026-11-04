import Taro, { getCurrentInstance } from '@tarojs/taro'
import { useCallback, useEffect, useRef, useState, type PropsWithChildren } from 'react'
import { openCaptainManage } from '../../features/captain-roster/captain-manage-navigation.h5'
import { PublicShell } from '../../components/public-shell'
import { DataState } from '../../components/public-ui'
import { TeamCrest } from '../../components/product-ui'
import { PlayerAvatar } from '../../components/player-avatar.h5'
import { TeamContent, Empty } from '../../components/team-hub/content.h5'
import { PlayerProfile } from '../../components/player-overlay/index.h5'
import { TeamPicker } from '../../components/team-hub/picker.h5'
import { HubManageDialog } from '../../components/team-hub/hub-manage.h5'
import { loadHubStripOrder, saveHubStripOrder } from '../../components/team-hub/hub-order.h5'
import { applyHubOrder, type HubOrderKey } from '../../components/team-hub/hub-order.logic'
import { useDesktopTeamView, useTeamData } from '../../components/team-hub/data.h5'
import { TeamIcon } from '../../components/team-hub/icons.h5'
import { productRepository } from '../../features/product/product.repository'
import { positionLabel } from '../../features/product/product.format'
import { readSession } from '../../features/product/session'
import { openTeam } from '../../features/product/team-navigation'
import { TEAM_PREFERENCES_EVENT } from '../../features/product/team-navigation.h5'
import type {
  HomeResponse,
  PlayerFollowsResponse,
  TeamPreferencesResponse,
  PlayerDetailResponse,
} from '../../features/product/product.types'
import ExistingMyTeamPage from './my-team.shared'
import '../../components/team-hub/index.h5.scss'
import './index.h5.scss'

export default function H5MyTeamPage() {
  const desktop = useDesktopTeamView()
  const params = getCurrentInstance().router?.params
  // Desktop captain management opens as a modal; keep the dedicated page for phone / roster review.
  useEffect(() => {
    if (desktop && params?.teamId && params?.review !== 'roster') {
      openCaptainManage({
        teamId: params.teamId,
        ...(params.tournamentId ? { tournamentId: params.tournamentId } : {}),
      })
    }
  }, [desktop, params?.teamId, params?.tournamentId, params?.review])
  return desktop && params?.review !== 'roster' ? <DesktopMyTeamPage /> : <ExistingMyTeamPage />
}

function DesktopMyTeamPage() {
  const routeTournamentId = getCurrentInstance().router?.params.tournamentId ?? ''
  const [home, setHome] = useState<HomeResponse | null>(null)
  const [preferences, setPreferences] = useState<TeamPreferencesResponse | null>(null)
  const [players, setPlayers] = useState<PlayerFollowsResponse>({ items: [] })
  const [playerError, setPlayerError] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selectedTeam, setSelectedTeam] = useState('')
  const [selectedPlayer, setSelectedPlayer] = useState('')
  const [picker, setPicker] = useState<'primary' | 'manage' | null>(null)
  const [order, setOrder] = useState<HubOrderKey[]>([])
  const sequence = useRef(0)
  const currentPrimary = useRef('')
  const persistOrder = useRef(false)
  const load = useCallback(async () => {
    const request = ++sequence.current
    setLoading(true)
    setError('')
    try {
      const signedIn = Boolean(readSession())
      const [homeData, prefs, follows] = await Promise.all([
        productRepository.getHome(routeTournamentId || undefined),
        signedIn
          ? productRepository.getTeamPreferences(routeTournamentId || undefined)
          : Promise.resolve(null),
        signedIn
          ? productRepository
              .getPlayerFollows()
              .then((value) => ({ value, error: '' }))
              .catch((issue) => ({
                value: { items: [] },
                error: issue instanceof Error ? issue.message : '球员关注加载失败',
              }))
          : Promise.resolve({ value: { items: [] }, error: '' }),
      ])
      if (request !== sequence.current) return
      setHome(homeData)
      setPreferences(prefs)
      currentPrimary.current = prefs?.primaryTeam?.id ?? ''
      setPlayers(follows.value)
      setPlayerError(follows.error)
      setSelectedTeam(prefs?.primaryTeam?.id ?? '')
      setSelectedPlayer('')
      persistOrder.current = false
      const nextOrder = await loadHubStripOrder()
      if (request !== sequence.current) return
      setOrder(nextOrder)
      persistOrder.current = true
    } catch (issue) {
      if (request === sequence.current)
        setError(issue instanceof Error ? issue.message : '主队空间加载失败')
    } finally {
      if (request === sequence.current) setLoading(false)
    }
  }, [routeTournamentId])
  useEffect(() => {
    void load()
    return () => {
      sequence.current += 1
    }
  }, [load])
  useEffect(() => {
    const changed = (event: Event) => {
      const next = (event as CustomEvent<TeamPreferencesResponse>).detail
      if (currentPrimary.current !== (next.primaryTeam?.id ?? '')) {
        setSelectedTeam(next.primaryTeam?.id ?? '')
        setSelectedPlayer('')
      }
      currentPrimary.current = next.primaryTeam?.id ?? ''
      setPreferences(next)
    }
    window.addEventListener(TEAM_PREFERENCES_EVENT, changed)
    return () => window.removeEventListener(TEAM_PREFERENCES_EVENT, changed)
  }, [])
  useEffect(() => {
    if (!persistOrder.current) return
    const timer = window.setTimeout(() => {
      void saveHubStripOrder(order)
    }, 280)
    return () => window.clearTimeout(timer)
  }, [order])
  const tournamentId = routeTournamentId || home?.tournament.id || ''
  const openPicker = (mode: 'primary' | 'manage') => {
    if (mode === 'manage' && !readSession()) {
      void Taro.showToast({ title: '登录后可以关注球队和球员', icon: 'none' })
      return
    }
    setPicker(mode)
  }
  const stripItems = applyHubOrder(preferences?.followedTeams ?? [], players.items, order)
  return (
    <PublicShell active="team" tournamentId={tournamentId}>
      <div className="th-root th-page xq-viewport-page">
        {loading ? (
          <DataState kind="loading" title="正在加载主队空间" />
        ) : error ? (
          <DataState
            kind="error"
            title="主队空间暂不可用"
            description={error}
            onRetry={() => void load()}
          />
        ) : home ? (
          <>
            <div className="th-follow-strip th-follow-strip--single">
              <HorizontalFollowStrip>
                {preferences?.primaryTeam ? (
                  <FollowTeamChip
                    team={preferences.primaryTeam}
                    selected={!selectedPlayer && selectedTeam === preferences.primaryTeam.id}
                    primary
                    onSelect={() => {
                      setSelectedPlayer('')
                      setSelectedTeam(preferences.primaryTeam!.id)
                    }}
                  />
                ) : (
                  <button
                    data-team-control
                    type="button"
                    className="th-follow-chip th-follow-chip--add"
                    onClick={() => openPicker('primary')}
                  >
                    <TeamIcon name="plus" />
                    选择我的主队
                  </button>
                )}
                {stripItems.map((entry) =>
                  entry.kind === 'team' ? (
                    <FollowTeamChip
                      key={`team:${entry.item.id}`}
                      team={entry.item}
                      selected={!selectedPlayer && selectedTeam === entry.item.id}
                      onSelect={() => {
                        setSelectedPlayer('')
                        setSelectedTeam(entry.item.id)
                      }}
                    />
                  ) : (
                    <button
                      data-team-control
                      type="button"
                      data-team-selector
                      className={`th-follow-chip th-follow-chip--player ${selectedPlayer === entry.item.id ? 'is-selected' : ''}`}
                      key={`player:${entry.item.id}`}
                      aria-label={`在页面中查看${entry.item.displayName}球员资料`}
                      aria-pressed={selectedPlayer === entry.item.id}
                      onClick={() => setSelectedPlayer(entry.item.id)}
                    >
                      <PlayerAvatar
                        name={entry.item.displayName}
                        avatarUrl={entry.item.avatarUrl}
                        size="small"
                      />
                      <span>
                        <strong>{entry.item.displayName}</strong>
                        <small>{positionLabel(entry.item.position)}</small>
                      </span>
                    </button>
                  ),
                )}
                {!preferences?.primaryTeam && !stripItems.length ? (
                  <button
                    data-team-control
                    type="button"
                    className="th-empty-chip"
                    onClick={() => openPicker('manage')}
                  >
                    {playerError ? '关注加载失败，点击重试' : '关注球队和球员，排列在这一条里'}
                  </button>
                ) : null}
              </HorizontalFollowStrip>
              <button
                data-team-control
                type="button"
                className="th-icon-button th-follow-strip__manage"
                aria-label="管理关注与排序"
                onClick={() => openPicker('manage')}
              >
                <TeamIcon name="menu" />
              </button>
            </div>
            {selectedPlayer ? (
              <SelectedPlayer
                key={selectedPlayer}
                playerId={selectedPlayer}
                tournamentId={tournamentId}
              />
            ) : selectedTeam ? (
              <SelectedTeam key={selectedTeam} teamId={selectedTeam} tournamentId={tournamentId} />
            ) : (
              <section className="th-surface th-welcome">
                <Empty
                  title="把热爱，留给你的主队"
                  copy="选择主队后，这里会展示球队动态、赛程、球员与球队资料。"
                />
                <button
                  data-team-control
                  type="button"
                  className="th-primary-button"
                  onClick={() => openPicker('primary')}
                >
                  选择主队
                  <TeamIcon name="arrow" />
                </button>
                <div className="th-discover">
                  {home.teams.map((team) => (
                    <button
                      data-team-control
                      data-team-action
                      type="button"
                      key={team.id}
                      onClick={() => void openTeam(team.id, tournamentId)}
                    >
                      <TeamCrest team={team} interactive={false} />
                      <strong>{team.name}</strong>
                    </button>
                  ))}
                </div>
              </section>
            )}
          </>
        ) : null}
        {picker === 'primary' && home ? (
          <TeamPicker
            mode="primary"
            preferences={preferences}
            teams={home.teams}
            onClose={() => setPicker(null)}
            onSaved={(next) => {
              setPreferences(next)
              setSelectedPlayer('')
              setSelectedTeam(next.primaryTeam?.id ?? '')
            }}
          />
        ) : null}
        {picker === 'manage' && home ? (
          <HubManageDialog
            preferences={preferences}
            teams={home.teams}
            follows={players}
            order={order}
            tournamentId={tournamentId}
            onClose={() => setPicker(null)}
            onOrderChange={setOrder}
            onPreferences={(next) => {
              setPreferences(next)
              if (next.primaryTeam && !selectedPlayer && !selectedTeam)
                setSelectedTeam(next.primaryTeam.id)
            }}
            onFollows={setPlayers}
          />
        ) : null}
      </div>
    </PublicShell>
  )
}

function FollowTeamChip({
  team,
  selected,
  primary = false,
  onSelect,
}: {
  team: NonNullable<TeamPreferencesResponse['primaryTeam']>
  selected: boolean
  primary?: boolean
  onSelect: () => void
}) {
  return (
    <button
      data-team-control
      data-team-selector
      type="button"
      className={`th-follow-chip ${primary ? 'th-follow-chip--primary' : ''} ${selected ? 'is-selected' : ''}`}
      aria-label={`在页面中查看${team.name}球队内容`}
      aria-pressed={selected}
      onClick={onSelect}
    >
      <TeamCrest team={team} interactive={false} />
      <strong>{team.name}</strong>
    </button>
  )
}

function SelectedPlayer({ playerId, tournamentId }: { playerId: string; tournamentId: string }) {
  const [state, setState] = useState<
    | { phase: 'loading' }
    | { phase: 'failed'; message: string }
    | { phase: 'ready'; player: PlayerDetailResponse }
  >({ phase: 'loading' })
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    let active = true
    setState({ phase: 'loading' })
    void productRepository
      .getPlayer(playerId, tournamentId)
      .then((player) => {
        if (active) setState({ phase: 'ready', player })
      })
      .catch((error) => {
        if (active)
          setState({
            phase: 'failed',
            message: error instanceof Error ? error.message : '球员资料读取失败',
          })
      })
    return () => {
      active = false
    }
  }, [playerId, tournamentId, retry])
  if (state.phase === 'loading') return <DataState kind="loading" title="正在读取球员资料" />
  if (state.phase === 'failed')
    return (
      <DataState
        kind="error"
        title="球员资料暂不可用"
        description={state.message}
        onRetry={() => setRetry((value) => value + 1)}
      />
    )
  return (
    <section className="player-profile-inline" aria-label="所选球员资料">
      <PlayerProfile player={state.player} tournamentId={tournamentId} />
    </section>
  )
}

function HorizontalFollowStrip({ children }: PropsWithChildren) {
  const strip = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const element = strip.current
    if (!element) return
    const wheel = (event: WheelEvent) => {
      if (event.ctrlKey || element.scrollWidth <= element.clientWidth + 1) return
      const units = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? element.clientWidth : 1
      const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY
      if (!delta) return
      event.preventDefault()
      event.stopPropagation()
      element.scrollLeft += delta * units
    }
    element.addEventListener('wheel', wheel, { passive: false })
    return () => element.removeEventListener('wheel', wheel)
  }, [])
  return (
    <div className="th-follow-strip__scroll" ref={strip}>
      {children}
    </div>
  )
}

function SelectedTeam({
  teamId,
  tournamentId: initialTournamentId,
}: {
  teamId: string
  tournamentId: string
}) {
  const [tournamentId, setTournamentId] = useState(initialTournamentId)
  const state = useTeamData(teamId, tournamentId)
  if (state.loading && !state.data)
    return <DataState kind="loading" title="正在读取球队动态与赛程" />
  if (state.error || !state.data)
    return (
      <>
        <DataState
          kind="error"
          title="球队内容暂不可用"
          description={state.error}
          onRetry={() => void state.reload()}
        />
        {tournamentId !== initialTournamentId ? (
          <button
            data-team-control
            type="button"
            className="th-soft-button"
            onClick={() => setTournamentId(initialTournamentId)}
          >
            返回原赛事
          </button>
        ) : null}
      </>
    )
  return (
    <>
      {state.loading ? <DataState kind="loading" title="正在读取赛事数据" /> : null}
      <div
        className="th-page__body"
        style={{ display: state.loading ? 'none' : undefined }}
        aria-busy={state.loading}
      >
        <TeamContent
          data={state.data}
          competition={state.competition}
          competitionError={state.competitionError}
          tournamentId={tournamentId}
          onTournamentChange={setTournamentId}
          onReload={() => void state.reload()}
          onPostPublished={(post) =>
            state.setData((current) =>
              current ? { ...current, posts: [post, ...current.posts] } : current,
            )
          }
        />
      </div>
    </>
  )
}
