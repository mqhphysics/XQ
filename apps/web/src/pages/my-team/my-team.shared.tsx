import { Button, Input, Picker, ScrollView, Text, View } from '@tarojs/components'
import Taro, { getCurrentInstance } from '@tarojs/taro'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { PublicShell, updatePrimaryTeamCache } from '../../components/public-shell'
import { PersonTrigger } from '../../components/person-trigger'
import { openPlayer } from '../../features/product/player-navigation'
import { DataState } from '../../components/public-ui'
import {
  MatchCard,
  PostCard,
  ProductSection,
  TeamCrest,
  UserAvatar,
} from '../../components/product-ui'
import {
  formatDate,
  formatTime,
  matchStatusLabel,
  positionLabel,
} from '../../features/product/product.format'
import {
  knownTournamentId,
  ProductApiError,
  productRepository,
} from '../../features/product/product.repository'
import { readSession } from '../../features/product/session'
import { useNativeTournamentId } from '../../features/native-navigation'
import { openMatch } from '../../features/product/match-navigation'
import { openPost } from '../../features/product/post-navigation'
import { managedTeamIds } from '../me/profile.logic'
import { openTeam } from '../../features/product/team-navigation'
import { CaptainRosterWorkflow } from '../../features/captain-roster'
import CaptainProfileEditor from '../../features/captain-roster/profile-editor'
import { captainRequest, RosterApiError } from '../../features/captain-roster/roster.repository'
import { teamManagementRepository } from '../../features/captain-roster/team-management.repository'
import { createClientActionId } from '../../features/product/product.repository'
import { RosterReviewWorkspace } from '../../features/captain-roster/roster-review'
import { TeamPreferenceLayout } from './team-preference-layout'
import { NativeMatchRow } from '../../components/native-match-row'
import type {
  HomeResponse,
  CaptainWorkspaceResponse,
  MatchSummary,
  PlayerFollowItem,
  PlayerFollowsResponse,
  TeamDashboardResponse,
  TeamPreferencesResponse,
  TeamSummary,
} from '../../features/product/product.types'

import './index.scss'

type PageState =
  | { phase: 'loading' }
  | { phase: 'failed'; message: string }
  | {
      phase: 'ready'
      home: HomeResponse
      preferences: TeamPreferencesResponse | null
      dashboard: TeamDashboardResponse | null
      schedule: MatchSummary[]
      playerFollows: PlayerFollowsResponse
      captain: CaptainWorkspaceResponse | null
      captainError: string | null
    }

const POSITION_GROUPS = [
  { key: 'FORWARD', label: '前锋' },
  { key: 'MIDFIELDER', label: '中场' },
  { key: 'DEFENDER', label: '后卫' },
  { key: 'GOALKEEPER', label: '门将' },
] as const

function canManageTeam(teamId: string): boolean {
  const user = readSession()?.user
  return Boolean(user && managedTeamIds(user, [teamId]).includes(teamId))
}

export default function MyTeamPage() {
  const requestedTeamId = getCurrentInstance().router?.params?.teamId ?? ''
  const requestedTournamentId = useNativeTournamentId()
  const isRosterReview =
    Taro.getEnv() === Taro.ENV_TYPE.WEB &&
    getCurrentInstance().router?.params?.review === 'roster' &&
    Boolean(requestedTeamId && requestedTournamentId)
  const [state, setState] = useState<PageState>({ phase: 'loading' })
  const shown = useRef(false)
  const [editing, setEditing] = useState(false)
  const [primaryId, setPrimaryId] = useState('')
  const [followedIds, setFollowedIds] = useState<string[]>([])
  const [teamQuery, setTeamQuery] = useState('')
  const [saving, setSaving] = useState(false)
  const [playerBusy, setPlayerBusy] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (isRosterReview) return
    if (Taro.getEnv() === Taro.ENV_TYPE.WEB || !shown.current) setState({ phase: 'loading' })
    try {
      const signedIn = Boolean(readSession())
      const hintedTournamentId = requestedTournamentId || knownTournamentId()
      const [homeData, preferences, playerFollows, hintedCompetition] = await Promise.all([
        requestedTournamentId && signedIn
          ? captainRequest<HomeResponse>(
              `/public/home?tournamentId=${encodeURIComponent(requestedTournamentId)}`,
            )
          : productRepository.getHome(),
        signedIn ? productRepository.getTeamPreferences() : Promise.resolve(null),
        signedIn ? productRepository.getPlayerFollows() : Promise.resolve({ items: [] }),
        signedIn && hintedTournamentId
          ? productRepository.getCompetitionData(hintedTournamentId)
          : Promise.resolve(null),
      ])
      if (!signedIn || !preferences) {
        shown.current = true
        setState({
          phase: 'ready',
          home: homeData,
          preferences: null,
          dashboard: null,
          schedule: [],
          playerFollows: { items: [] },
          captain: null,
          captainError: null,
        })
        return
      }
      const competition =
        hintedCompetition && hintedCompetition.tournament.id === homeData.tournament.id
          ? hintedCompetition
          : await productRepository.getCompetitionData(homeData.tournament.id)
      const dashboardTeamId = requestedTeamId || preferences.primaryTeam?.id || ''
      const dashboard = dashboardTeamId
        ? await productRepository.getTeamDashboard(dashboardTeamId, homeData.tournament.id)
        : null
      let captain: CaptainWorkspaceResponse | null = null
      let captainError: string | null = null
      if (dashboardTeamId && canManageTeam(dashboardTeamId)) {
        try {
          captain = await productRepository.getCaptainWorkspace(dashboardTeamId)
        } catch (error) {
          if (requestedTeamId) throw error
          captainError = error instanceof Error ? error.message : '球队管理加载失败'
        }
      }
      setPrimaryId(preferences.primaryTeam?.id ?? '')
      shown.current = true
      setFollowedIds(preferences.followedTeams.map((team) => team.id))
      setState({
        phase: 'ready',
        home: homeData,
        preferences,
        dashboard,
        schedule: competition.schedule,
        playerFollows,
        captain,
        captainError,
      })
      if (!preferences.primaryTeam && !(requestedTeamId && captain)) setEditing(true)
    } catch (error) {
      setState({
        phase: 'failed',
        message: error instanceof Error ? error.message : '主队数据加载失败。',
      })
    }
  }, [requestedTeamId, requestedTournamentId, isRosterReview])

  useEffect(() => {
    void load()
  }, [load])
  useEffect(() => {
    if (Taro.getEnv() !== Taro.ENV_TYPE.WEAPP) return
    const refresh = () => {
      void load()
    }
    Taro.eventCenter.on('xiaoqiu:native-team-preferences', refresh)
    return () => {
      Taro.eventCenter.off('xiaoqiu:native-team-preferences', refresh)
    }
  }, [load])

  const openEditor = () => {
    if (state.phase !== 'ready' || !state.preferences) return
    setPrimaryId(state.preferences.primaryTeam?.id ?? '')
    setFollowedIds(state.preferences.followedTeams.map((team) => team.id))
    setTeamQuery('')
    setEditing(true)
  }

  const cancelEditing = () => {
    if (state.phase !== 'ready' || !state.preferences) return
    setPrimaryId(state.preferences.primaryTeam?.id ?? '')
    setFollowedIds(state.preferences.followedTeams.map((team) => team.id))
    setTeamQuery('')
    if (state.dashboard) setEditing(false)
  }

  const savePreferences = async () => {
    if (!primaryId || saving || state.phase !== 'ready') return
    setSaving(true)
    try {
      const preferences = await productRepository.updateTeamPreferences(
        primaryId,
        followedIds.filter((id) => id !== primaryId),
      )
      const dashboard = await productRepository.getTeamDashboard(
        primaryId,
        state.home.tournament.id,
      )
      let captain: CaptainWorkspaceResponse | null = null
      let captainError: string | null = null
      if (canManageTeam(primaryId)) {
        try {
          captain = await productRepository.getCaptainWorkspace(primaryId)
        } catch (error) {
          captainError = error instanceof Error ? error.message : '球队管理加载失败'
        }
      }
      setPrimaryId(preferences.primaryTeam?.id ?? '')
      setFollowedIds(preferences.followedTeams.map((team) => team.id))
      updatePrimaryTeamCache(preferences.primaryTeam)
      setState({ ...state, preferences, dashboard, captain, captainError })
      setEditing(false)
      setTeamQuery('')
      await Taro.showToast({ title: '主队与关注已保存', icon: 'success' })
    } catch (error) {
      await Taro.showToast({
        title: error instanceof Error ? error.message : '保存失败',
        icon: 'none',
      })
    } finally {
      setSaving(false)
    }
  }

  const removeFollowedTeam = async (team: TeamSummary) => {
    if (
      saving ||
      state.phase !== 'ready' ||
      !state.preferences ||
      !primaryId ||
      team.id === primaryId
    ) {
      return
    }
    const confirmation = await Taro.showModal({
      title: '取消关注',
      content: `确认不再关注“${team.name}”吗？`,
      confirmText: '取消关注',
    })
    if (!confirmation.confirm) return

    const nextFollowedIds = followedIds.filter((id) => id !== team.id)
    setSaving(true)
    try {
      const preferences = await productRepository.updateTeamPreferences(primaryId, nextFollowedIds)
      setFollowedIds(preferences.followedTeams.map((item) => item.id))
      setState({ ...state, preferences })
      await Taro.showToast({ title: '已取消关注', icon: 'success' })
    } catch (error) {
      await Taro.showToast({
        title: error instanceof Error ? error.message : '取消关注失败',
        icon: 'none',
      })
    } finally {
      setSaving(false)
    }
  }

  const followPlayer = async (playerId: string) => {
    if (state.phase !== 'ready' || playerBusy) return
    setPlayerBusy(playerId)
    try {
      const playerFollows = await productRepository.followPlayer(playerId)
      setState({ ...state, playerFollows })
      await Taro.showToast({ title: '已关注球员', icon: 'success' })
    } catch (error) {
      await Taro.showToast({
        title: error instanceof Error ? error.message : '关注失败',
        icon: 'none',
      })
    } finally {
      setPlayerBusy(null)
    }
  }

  const unfollowPlayer = async (playerId: string) => {
    if (state.phase !== 'ready' || playerBusy) return
    setPlayerBusy(playerId)
    try {
      const playerFollows = await productRepository.unfollowPlayer(playerId)
      setState({ ...state, playerFollows })
      await Taro.showToast({ title: '已取消关注', icon: 'success' })
    } catch (error) {
      await Taro.showToast({
        title: error instanceof Error ? error.message : '取消关注失败',
        icon: 'none',
      })
    } finally {
      setPlayerBusy(null)
    }
  }

  const retryCaptain = async () => {
    if (state.phase !== 'ready' || !state.dashboard || !canManageTeam(state.dashboard.team.id))
      return
    try {
      const captain = await productRepository.getCaptainWorkspace(state.dashboard.team.id)
      setState({ ...state, captain, captainError: null })
    } catch (error) {
      if (error instanceof ProductApiError && error.statusCode === 403) {
        setState({ ...state, captain: null, captainError: null })
        return
      }
      setState({
        ...state,
        captain: null,
        captainError: error instanceof Error ? error.message : '球队管理加载失败',
      })
    }
  }

  const tournamentId = state.phase === 'ready' ? state.home.tournament.id : undefined
  if (isRosterReview)
    return (
      <PublicShell active="me" tournamentId={requestedTournamentId}>
        <RosterReviewWorkspace teamId={requestedTeamId} tournamentId={requestedTournamentId} />
      </PublicShell>
    )
  return (
    <PublicShell active="team" tournamentId={tournamentId}>
      {state.phase === 'loading' && <DataState kind="loading" title="正在加载主队空间" />}
      {state.phase === 'failed' && (
        <DataState
          kind="error"
          title="主队空间不可用"
          description={state.message}
          onRetry={() => void load()}
        />
      )}
      {state.phase === 'ready' && (
        <View>
          {!state.preferences ? (
            <VisitorTeamView home={state.home} />
          ) : (
            <TeamPreferenceLayout
              editing={editing || !state.dashboard}
              onClose={cancelEditing}
              onSave={() => void savePreferences()}
              saving={saving}
              canSave={Boolean(primaryId)}
              editor={
                <TeamSelector
                  followedIds={followedIds}
                  primaryId={primaryId}
                  query={teamQuery}
                  saving={saving}
                  teams={state.preferences.availableTeams}
                  onCancel={cancelEditing}
                  canCancel={Boolean(state.dashboard)}
                  onFollowedChange={setFollowedIds}
                  onPrimaryChange={(id) => {
                    setPrimaryId(id)
                    setFollowedIds((current) => current.filter((item) => item !== id))
                  }}
                  onQueryChange={setTeamQuery}
                  onSave={() => void savePreferences()}
                />
              }
              content={
                state.dashboard ? (
                  <TeamDashboard
                    key={state.dashboard.team.id}
                    data={state.dashboard}
                    primaryTeam={
                      requestedTeamId
                        ? state.dashboard.team
                        : (state.preferences.primaryTeam ?? state.dashboard.team)
                    }
                    followedTeams={state.preferences.followedTeams}
                    saving={saving}
                    teamMatches={state.schedule.filter(
                      (match) =>
                        match.homeTeam?.id === state.dashboard?.team.id ||
                        match.awayTeam?.id === state.dashboard?.team.id,
                    )}
                    tournamentId={state.home.tournament.id}
                    onEdit={openEditor}
                    onRemoveFollow={(team) => void removeFollowedTeam(team)}
                    playerFollows={state.playerFollows.items}
                    playerBusy={playerBusy}
                    captain={state.captain}
                    captainError={state.captainError}
                    onCaptainChange={(captain) =>
                      setState((current) =>
                        current.phase === 'ready'
                          ? {
                              ...current,
                              captain,
                              captainError: null,
                              dashboard: current.dashboard
                                ? {
                                    ...current.dashboard,
                                    team: { ...current.dashboard.team, ...captain.team },
                                  }
                                : null,
                            }
                          : current,
                      )
                    }
                    onCaptainRetry={() => void retryCaptain()}
                    onFollowPlayer={(playerId) => void followPlayer(playerId)}
                    onUnfollowPlayer={(playerId) => void unfollowPlayer(playerId)}
                  />
                ) : null
              }
            />
          )}
        </View>
      )}
    </PublicShell>
  )
}

function VisitorTeamView({ home: homeData }: { home: HomeResponse }) {
  return (
    <View>
      <View className="team-guest-header">
        <Text className="team-guest-header__eyebrow">MY CLUB</Text>
        <Text className="team-guest-header__title">选择你的主队</Text>
        <Text className="team-guest-header__copy">登录后保存主队与关注队伍。</Text>
        <Button
          className="button button--light team-guest-header__login"
          onClick={() => void Taro.reLaunch({ url: '/pages/login/index' })}
        >
          登录账户
        </Button>
      </View>
      <View className="team-guest-grid">
        {homeData.teams.map((team) => (
          <View
            className="team-guest-card"
            key={team.id}
            onClick={() => void goToTeam(team.id, homeData.tournament.id)}
          >
            <TeamCrest team={team} size="large" />
            <Text className="team-guest-card__name">{team.name}</Text>
            <Text className="team-guest-card__college">{team.collegeName}</Text>
            <Text className="team-guest-card__group">{team.groupName}</Text>
          </View>
        ))}
      </View>
    </View>
  )
}

function TeamSelector({
  canCancel,
  followedIds,
  primaryId,
  query,
  saving,
  teams,
  onCancel,
  onFollowedChange,
  onPrimaryChange,
  onQueryChange,
  onSave,
}: {
  canCancel: boolean
  followedIds: string[]
  primaryId: string
  query: string
  saving: boolean
  teams: TeamSummary[]
  onCancel: () => void
  onFollowedChange: (ids: string[]) => void
  onPrimaryChange: (id: string) => void
  onQueryChange: (value: string) => void
  onSave: () => void
}) {
  const filteredTeams = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase('zh-CN')
    if (!normalized) return teams
    return teams.filter((team) =>
      [team.name, team.shortName, team.collegeName]
        .filter((value): value is string => Boolean(value))
        .some((value) => value.toLocaleLowerCase('zh-CN').includes(normalized)),
    )
  }, [query, teams])

  const toggleFollow = (teamId: string) => {
    if (teamId === primaryId) return
    onFollowedChange(
      followedIds.includes(teamId)
        ? followedIds.filter((id) => id !== teamId)
        : [...followedIds, teamId],
    )
  }

  return (
    <View className="team-selector">
      <View className="page-intro team-selector__intro">
        <View>
          <Text className="page-intro__eyebrow">TEAM PREFERENCES</Text>
          <Text className="page-intro__title">管理主队与关注</Text>
        </View>
        <Text className="page-intro__copy">每个账号保留一支主队，也可以关注多支球队。</Text>
      </View>
      <View className="team-selector__search">
        <Input
          className="team-selector__search-input"
          confirmType="search"
          placeholder="按球队名或学院搜索"
          value={query}
          onInput={(event) => onQueryChange(event.detail.value)}
        />
        {query && (
          <Button className="team-selector__clear" onClick={() => onQueryChange('')}>
            清空
          </Button>
        )}
      </View>
      {filteredTeams.length === 0 ? (
        <DataState kind="empty" title="没有匹配的球队" description="换个球队名或学院试试。" />
      ) : (
        <View className="team-selector__grid">
          {filteredTeams.map((team) => {
            const isPrimary = team.id === primaryId
            const isFollowed = followedIds.includes(team.id)
            return (
              <View
                className={'team-choice ' + (isPrimary ? 'team-choice--primary' : '')}
                key={team.id}
              >
                <View className="team-choice__identity">
                  <TeamCrest team={team} />
                  <View>
                    <Text>{team.name}</Text>
                    <Text>{team.collegeName}</Text>
                  </View>
                </View>
                <View className="team-choice__actions">
                  <Button
                    className={isPrimary ? 'team-choice__primary-active' : ''}
                    onClick={() => onPrimaryChange(team.id)}
                  >
                    {isPrimary ? '当前主队' : '设为主队'}
                  </Button>
                  <Button
                    className={isFollowed ? 'team-choice__follow-active' : ''}
                    disabled={isPrimary}
                    onClick={() => toggleFollow(team.id)}
                  >
                    {isPrimary ? '主队已关注' : isFollowed ? '取消关注' : '关注'}
                  </Button>
                </View>
              </View>
            )
          })}
        </View>
      )}
      <View className="team-selector__footer">
        {canCancel && (
          <Button className="button button--outline" disabled={saving} onClick={onCancel}>
            取消
          </Button>
        )}
        <Button
          className="button button--primary"
          disabled={!primaryId || saving}
          loading={saving}
          onClick={onSave}
        >
          保存选择
        </Button>
      </View>
    </View>
  )
}

function TeamDashboard({
  captain,
  captainError,
  data,
  followedTeams,
  saving,
  teamMatches,
  tournamentId,
  onEdit,
  onRemoveFollow,
  onCaptainChange,
  onCaptainRetry,
  onFollowPlayer,
  onUnfollowPlayer,
  playerFollows,
  playerBusy,
  primaryTeam,
}: {
  captain: CaptainWorkspaceResponse | null
  captainError: string | null
  data: TeamDashboardResponse
  followedTeams: TeamSummary[]
  saving: boolean
  teamMatches: MatchSummary[]
  tournamentId: string
  onEdit: () => void
  onRemoveFollow: (team: TeamSummary) => void
  onCaptainChange: (captain: CaptainWorkspaceResponse) => void
  onCaptainRetry: () => void
  onFollowPlayer: (playerId: string) => void
  onUnfollowPlayer: (playerId: string) => void
  playerFollows: PlayerFollowItem[]
  playerBusy: string | null
  primaryTeam: TeamSummary
}) {
  const [showAllMatches, setShowAllMatches] = useState(false)
  const [playerQuery, setPlayerQuery] = useState('')
  const [playerResults, setPlayerResults] = useState<PlayerFollowItem[]>([])
  const [teamPosts, setTeamPosts] = useState(data.posts)
  const [searchingPlayers, setSearchingPlayers] = useState(false)
  const [likeBusy, setLikeBusy] = useState<string | null>(null)
  const upcoming = teamMatches.find(isUpcomingMatch)
  const recent = [...teamMatches].reverse().find(isCompletedMatch)
  const highlights = [recent, upcoming].filter(
    (match, index, items): match is MatchSummary =>
      Boolean(match) && items.findIndex((item) => item?.id === match?.id) === index,
  )
  const searchPlayers = async () => {
    if (!playerQuery.trim()) {
      setPlayerResults([])
      return
    }
    if (searchingPlayers) return
    setSearchingPlayers(true)
    try {
      const result = await productRepository.search(playerQuery.trim(), 'PLAYER')
      setPlayerResults(
        result.players.map((player) => ({
          id: player.id,
          displayName: player.displayName,
          position: player.position,
          avatarUrl: player.avatarUrl,
          profileColor: player.profileColor,
          team: player.team,
        })),
      )
    } catch (error) {
      await Taro.showToast({
        title: error instanceof Error ? error.message : '球员搜索失败',
        icon: 'none',
      })
    } finally {
      setSearchingPlayers(false)
    }
  }
  const likePost = async (postId: string, liked: boolean) => {
    if (likeBusy) return
    setLikeBusy(postId)
    try {
      const result = await productRepository.setLike(postId, liked)
      setTeamPosts((current) =>
        current.map((item) =>
          item.id === postId
            ? { ...item, likedByMe: result.liked, likeCount: result.likeCount }
            : item,
        ),
      )
    } catch (error) {
      await Taro.showToast({
        title: error instanceof Error ? error.message : '点赞操作失败',
        icon: 'none',
      })
    } finally {
      setLikeBusy(null)
    }
  }

  return (
    <View className="my-team-dashboard">
      <TeamFollowBar
        followedTeams={followedTeams}
        primaryTeam={primaryTeam}
        saving={saving}
        tournamentId={tournamentId}
        onEdit={onEdit}
        onRemoveFollow={onRemoveFollow}
      />

      <PlayerFollowBar
        followed={playerFollows}
        query={playerQuery}
        results={playerResults}
        tournamentId={tournamentId}
        onFollow={onFollowPlayer}
        busy={playerBusy}
        onQueryChange={setPlayerQuery}
        onSearch={() => void searchPlayers()}
        searching={searchingPlayers}
        onUnfollow={onUnfollowPlayer}
      />

      <View className="my-team-hero" style={{ borderColor: data.team.primaryColor ?? '#1f6b45' }}>
        <View className="my-team-hero__identity">
          <TeamCrest team={data.team} size="large" />
          <View className="my-team-hero__copy">
            <Text className="my-team-hero__label">
              {data.team.id === primaryTeam.id ? '我的主队' : '我管理的球队'} ·{' '}
              {data.team.groupName ?? '参赛球队'}
            </Text>
            <Text className="my-team-hero__title">{data.team.name}</Text>
            <Text className="my-team-hero__college">{data.team.collegeName}</Text>
            <Text className="my-team-hero__motto">{data.team.motto}</Text>
          </View>
        </View>
      </View>

      <View className="my-team-section team-dynamics-section">
        <ProductSection kicker="TEAM FEED" title="球队动态" note={`${teamPosts.length} 条`} />
        {teamPosts.length > 0 ? (
          <View className="team-dynamics-list">
            {teamPosts.map((post) => (
              <PostCard
                key={post.id}
                post={post}
                onOpen={() =>
                  Taro.getEnv() === Taro.ENV_TYPE.WEAPP
                    ? void openPost(post.id)
                    : void Taro.navigateTo({
                        url: `/pages/post-detail/index?postId=${encodeURIComponent(post.id)}`,
                      })
                }
                onLike={() => void likePost(post.id, !post.likedByMe)}
              />
            ))}
          </View>
        ) : (
          <View className="surface">
            <Text className="team-glance__empty">暂无球队动态</Text>
          </View>
        )}
      </View>

      <View className="team-glance surface">
        <View className="team-glance__head">
          <View>
            <Text className="team-glance__kicker">MATCH SNAPSHOT</Text>
            <Text className="team-glance__title">近期与下一场</Text>
          </View>
          <Button className="team-glance__all" onClick={() => setShowAllMatches((value) => !value)}>
            {showAllMatches ? '收起全部' : '查看全部'}
          </Button>
        </View>
        <View className="team-glance__rows">
          {highlights.map((match) => (
            <CompactMatchRow
              key={match.id}
              label={isCompletedMatch(match) ? '最近一场' : '下一场'}
              match={match}
            />
          ))}
          {highlights.length === 0 && <Text className="team-glance__empty">暂无球队赛程</Text>}
        </View>
      </View>

      {showAllMatches && (
        <View className="my-team-section my-team-matches-section">
          <ProductSection
            kicker="FIXTURES"
            title="全部球队赛程"
            note={`${teamMatches.length} 场`}
          />
          <View className="my-team-match-grid">
            {teamMatches.map((match) => (
              <MatchCard key={match.id} match={match} onClick={() => void goToMatch(match.id)} />
            ))}
          </View>
        </View>
      )}

      <View className="my-team-section my-team-data-section">
        <ProductSection kicker="TEAM DATA" title="球队数据" note="来自比赛事实" />
        <View className="team-record">
          <Record value={data.stats.played} label="比赛" />
          <Record value={data.stats.won} label="胜" />
          <Record value={data.stats.drawn} label="平" />
          <Record value={data.stats.lost} label="负" />
          <Record value={data.stats.goalsFor + ':' + data.stats.goalsAgainst} label="进失球" />
          <Record value={data.stats.points} label="积分" accent />
        </View>
      </View>

      {captainError && (
        <View className="my-team-section">
          <DataState
            kind="error"
            title="球队管理暂不可用"
            description={captainError}
            onRetry={onCaptainRetry}
          />
        </View>
      )}
      {captain && (
        <>
          <CaptainProfileEditor teamId={data.team.id} onChange={onCaptainChange} />
          {Taro.getEnv() === Taro.ENV_TYPE.WEB && (
            <CaptainRosterWorkflow
              teamId={data.team.id}
              tournamentId={tournamentId}
              captain={captain}
              roster={data.roster}
              matches={teamMatches}
            />
          )}
          <CaptainWorkspace teamId={data.team.id} data={captain} onChange={onCaptainChange} />
        </>
      )}

      <View className="my-team-section">
        <ProductSection kicker="PROFILE" title="球队信息" />
        <View className="team-profile surface">
          <ProfileRow label="队长" value={data.team.captainName ?? '未设置'} />
          <ProfileRow label="教练" value={data.team.coachName ?? '未设置'} />
          <ProfileRow
            label="成立"
            value={data.team.foundedYear ? data.team.foundedYear + ' 年' : '未填写'}
          />
          <ProfileRow label="简介" value={data.team.description ?? '暂无简介'} multiline />
        </View>
      </View>

      <View className="team-roster-section">
        <ProductSection
          kicker="SQUAD"
          title="球队球员"
          note={`${data.roster.length} 名 · 正式参赛以锁定名单为准`}
        />
        <GroupedRoster roster={data.roster} tournamentId={tournamentId} />
      </View>
    </View>
  )
}

function PlayerFollowBar({
  busy,
  followed,
  query,
  results,
  searching,
  tournamentId,
  onFollow,
  onQueryChange,
  onSearch,
  onUnfollow,
}: {
  busy: string | null
  followed: PlayerFollowItem[]
  query: string
  results: PlayerFollowItem[]
  searching: boolean
  tournamentId: string
  onFollow: (playerId: string) => void
  onQueryChange: (value: string) => void
  onSearch: () => void
  onUnfollow: (playerId: string) => void
}) {
  const remove = async (player: PlayerFollowItem) => {
    const confirmation = await Taro.showModal({
      title: '取消关注球员',
      content: `确认不再关注 ${player.displayName}？`,
      confirmText: '取消关注',
    })
    if (confirmation.confirm) onUnfollow(player.id)
  }
  return (
    <View className="player-follow-panel surface">
      <View className="player-follow-panel__head">
        <View>
          <Text>关注球员</Text>
          <Text>球队和球员都可以加入你的关注</Text>
        </View>
        <View className="player-follow-panel__search">
          <Input
            disabled={searching}
            confirmType="search"
            placeholder="搜索球员"
            value={query}
            onConfirm={onSearch}
            onInput={(event) => onQueryChange(event.detail.value)}
          />
          <Button disabled={searching} loading={searching} onClick={onSearch}>
            搜索
          </Button>
        </View>
      </View>
      <ScrollView className="player-follow-panel__scroll" scrollX>
        <View className="player-follow-panel__list">
          {followed.map((player) => (
            <View
              className="followed-player-chip"
              key={player.id}
              onClick={() => void goToPlayer(player.id, tournamentId)}
              onLongPress={() => {
                if (!busy) void remove(player)
              }}
            >
              <UserAvatar
                avatarUrl={player.avatarUrl}
                color={player.profileColor}
                name={player.displayName}
                playerId={player.id}
                tournamentId={tournamentId}
                size="small"
              />
              <View>
                <PersonTrigger
                  playerId={player.id}
                  tournamentId={tournamentId}
                  name={player.displayName}
                >
                  <Text>{player.displayName}</Text>
                </PersonTrigger>
                <Text>{player.team?.shortName ?? positionLabel(player.position)}</Text>
              </View>
              <Button
                aria-label={`取消关注${player.displayName}`}
                disabled={Boolean(busy)}
                loading={busy === player.id}
                onClick={(event) => {
                  event.stopPropagation()
                  void remove(player)
                }}
              >
                取消
              </Button>
            </View>
          ))}
          {followed.length === 0 && (
            <Text className="player-follow-panel__empty">还没有关注球员</Text>
          )}
        </View>
      </ScrollView>
      {query.trim() && (
        <View className="player-search-results">
          {results.map((player) => {
            const isFollowed = followed.some((item) => item.id === player.id)
            return (
              <View key={player.id}>
                <UserAvatar
                  avatarUrl={player.avatarUrl}
                  color={player.profileColor}
                  name={player.displayName}
                  playerId={player.id}
                  tournamentId={tournamentId}
                  size="small"
                />
                <View>
                  <PersonTrigger
                    playerId={player.id}
                    tournamentId={tournamentId}
                    name={player.displayName}
                  >
                    <Text>{player.displayName}</Text>
                  </PersonTrigger>
                  <Text>{player.team?.name ?? positionLabel(player.position)}</Text>
                </View>
                <Button
                  disabled={isFollowed || Boolean(busy)}
                  loading={busy === player.id}
                  onClick={() => onFollow(player.id)}
                >
                  {isFollowed ? '已关注' : '关注'}
                </Button>
              </View>
            )
          })}
          {results.length === 0 && (
            <Text>{searching ? '正在搜索球员…' : '输入名字后点击搜索'}</Text>
          )}
        </View>
      )}
    </View>
  )
}

function CaptainWorkspace({
  teamId,
  data,
  onChange,
}: {
  teamId: string
  data: CaptainWorkspaceResponse
  onChange: (data: CaptainWorkspaceResponse) => void
}) {
  const positionKeys = POSITION_GROUPS.map((item) => item.key)
  const positionNames = POSITION_GROUPS.map((item) => item.label)
  const [busy, setBusy] = useState<string | null>(null)
  const [memberReason, setMemberReason] = useState('队长维护本队成员资料')
  const [memberError, setMemberError] = useState('')
  const [pendingMember, setPendingMember] = useState<{
    key: string
    action: () => Promise<CaptainWorkspaceResponse>
  } | null>(null)
  const actionLock = useRef(false)
  const run = async (
    key: string,
    action: () => Promise<CaptainWorkspaceResponse>,
    retainOnFailure = false,
    retry = false,
  ) => {
    if (actionLock.current || (pendingMember && !retry)) return
    actionLock.current = true
    setBusy(key)
    setMemberError('')
    try {
      onChange(await action())
      setPendingMember(null)
      await Taro.showToast({ title: '球队信息已更新', icon: 'success' })
    } catch (error) {
      const message = error instanceof Error ? error.message : '操作失败'
      if (retainOnFailure) {
        setMemberError(
          error instanceof RosterApiError && error.status === 409
            ? '成员资料已被更新，请重新读取球队管理后再操作。'
            : message,
        )
        if (!(error instanceof RosterApiError) || error.status === 0 || error.status >= 500)
          setPendingMember({ key, action })
        else setPendingMember(null)
      }
      await Taro.showToast({
        title: error instanceof Error ? error.message : '操作失败',
        icon: 'none',
      })
    } finally {
      actionLock.current = false
      setBusy(null)
    }
  }
  const review = async (applicationId: string, decision: 'APPROVED' | 'REJECTED') => {
    const confirmation = await Taro.showModal({
      title: decision === 'APPROVED' ? '批准入队' : '拒绝申请',
      content: '处理结果会通过消息通知申请人。',
      confirmText: decision === 'APPROVED' ? '批准' : '拒绝',
    })
    if (confirmation.confirm)
      await run(`application:${applicationId}`, () =>
        productRepository.reviewTeamApplication(teamId, applicationId, decision),
      )
  }
  const reloadMembers = async () => {
    if (actionLock.current) return
    if (pendingMember) {
      const answer = await Taro.showModal({
        title: '重新读取球队管理',
        content:
          '上次操作结果尚未确认。可以继续用原请求重试；重新读取会显示服务器当前状态，并结束本次重试。',
        confirmText: '重新读取',
      })
      if (!answer.confirm) return
    }
    actionLock.current = true
    setBusy('reload')
    setMemberError('')
    try {
      onChange(await productRepository.getCaptainWorkspace(teamId))
      setPendingMember(null)
    } catch (issue) {
      setMemberError(issue instanceof Error ? issue.message : '球队管理读取失败')
    } finally {
      actionLock.current = false
      setBusy(null)
    }
  }
  const remove = async (membershipId: string, name: string) => {
    if (busy || pendingMember) return
    const member = data.members.find((item) => item.id === membershipId)
    const updatedAt = (member as { updatedAt?: string } | undefined)?.updatedAt
    const h5 = Taro.getEnv() === Taro.ENV_TYPE.WEB
    if (h5 && (!updatedAt || memberReason.trim().length < 2)) {
      setMemberError('请重新读取成员版本，并填写至少 2 个字的修改原因。')
      return
    }
    const confirmation = await Taro.showModal({
      title: '移出球队',
      content: `确认将 ${name} 移出球队？`,
      confirmText: '移出',
    })
    if (confirmation.confirm) {
      const commandKey = createClientActionId('team-member')
      const reason = memberReason.trim()
      await run(
        `member:${membershipId}`,
        () =>
          h5
            ? teamManagementRepository.removeMember(
                teamId,
                membershipId,
                updatedAt!,
                reason,
                commandKey,
              )
            : productRepository.removeTeamMember(teamId, membershipId),
        h5,
      )
    }
  }
  const updatePosition = (
    member: CaptainWorkspaceResponse['members'][number],
    position: string,
  ) => {
    const h5 = Taro.getEnv() === Taro.ENV_TYPE.WEB
    const updatedAt = (member as { updatedAt?: string }).updatedAt
    if (h5 && (!updatedAt || memberReason.trim().length < 2)) {
      setMemberError('请重新读取成员版本，并填写至少 2 个字的修改原因。')
      return
    }
    const commandKey = createClientActionId('team-member')
    const reason = memberReason.trim()
    void run(
      `position:${member.id}`,
      () =>
        h5
          ? teamManagementRepository.updateMember(
              teamId,
              member.id,
              position,
              updatedAt!,
              reason,
              commandKey,
            )
          : productRepository.updateTeamMember(teamId, member.id, position),
      h5,
    )
  }
  return (
    <View className="my-team-section captain-workspace">
      <ProductSection kicker="CAPTAIN" title="球队管理" note="队长权限" />
      <View className="captain-grid">
        <View className="surface captain-applications">
          <Text className="captain-card-title">入队申请</Text>
          {data.applications
            .filter((item) => item.status === 'PENDING')
            .map((application) => (
              <View className="captain-application" key={application.id}>
                <UserAvatar
                  avatarUrl={application.player?.avatarUrl ?? application.applicant.avatarUrl}
                  name={application.player?.displayName ?? application.applicant.displayName}
                  userId={application.applicant.id}
                  size="small"
                />
                <View>
                  <Text>
                    <PersonTrigger
                      userId={application.applicant.id}
                      name={application.player?.displayName ?? application.applicant.displayName}
                    >
                      {application.player?.displayName ?? application.applicant.displayName}
                    </PersonTrigger>
                  </Text>
                  <Text>
                    {positionLabel(application.requestedPosition)} ·{' '}
                    {application.message ?? '未填写留言'}
                  </Text>
                </View>
                <View>
                  <Button
                    disabled={Boolean(busy)}
                    loading={busy === `application:${application.id}`}
                    onClick={() => void review(application.id, 'APPROVED')}
                  >
                    批准
                  </Button>
                  <Button
                    disabled={Boolean(busy)}
                    onClick={() => void review(application.id, 'REJECTED')}
                  >
                    拒绝
                  </Button>
                </View>
              </View>
            ))}
          {data.applications.every((item) => item.status !== 'PENDING') && (
            <Text className="captain-empty">暂无待处理申请</Text>
          )}
        </View>
        <View className="surface captain-members">
          <Text className="captain-card-title">成员与位置</Text>
          {Taro.getEnv() === Taro.ENV_TYPE.WEB ? (
            <Button disabled={Boolean(busy)} onClick={() => void reloadMembers()}>
              重新读取球队管理
            </Button>
          ) : null}
          {Taro.getEnv() === Taro.ENV_TYPE.WEB ? (
            <View>
              <Input
                aria-label="成员修改原因"
                value={memberReason}
                maxlength={500}
                disabled={Boolean(busy || pendingMember)}
                placeholder="成员修改原因"
                onInput={(event) => setMemberReason(event.detail.value)}
              />
              {memberError ? <div role="alert">{memberError}</div> : null}
              {pendingMember ? (
                <Button
                  disabled={Boolean(busy)}
                  onClick={() => void run(pendingMember.key, pendingMember.action, true, true)}
                >
                  重试原成员操作
                </Button>
              ) : null}
            </View>
          ) : null}
          {data.members.map((member) => (
            <View className="captain-member" key={member.id}>
              <UserAvatar
                avatarUrl={member.avatarUrl}
                name={member.displayName}
                userId={member.userId ?? undefined}
                playerId={member.playerId ?? undefined}
                size="small"
              />
              <View>
                <Text>
                  <PersonTrigger
                    userId={member.userId ?? undefined}
                    playerId={member.playerId ?? undefined}
                    name={member.displayName}
                  >
                    {member.displayName}
                  </PersonTrigger>
                  {member.isCaptain ? ' · 队长' : ''}
                </Text>
                <Text>{positionLabel(member.position)}</Text>
              </View>
              {Taro.getEnv() === Taro.ENV_TYPE.WEB ? (
                <select
                  className="captain-member__position"
                  aria-label={`${member.displayName}的场上位置`}
                  data-membership-id={member.id}
                  value={member.position ?? ''}
                  disabled={Boolean(busy || pendingMember)}
                  onChange={(event) => updatePosition(member, event.target.value)}
                >
                  <option value="" disabled>
                    未填写位置
                  </option>
                  {POSITION_GROUPS.map((position) => (
                    <option key={position.key} value={position.key}>
                      {position.label}
                    </option>
                  ))}
                </select>
              ) : (
                <Picker
                  mode="selector"
                  range={positionNames}
                  value={Math.max(
                    0,
                    positionKeys.indexOf(member.position as (typeof positionKeys)[number]),
                  )}
                  disabled={Boolean(busy || pendingMember)}
                  onChange={(event) =>
                    updatePosition(member, positionKeys[Number(event.detail.value)] ?? 'MIDFIELDER')
                  }
                >
                  <Button disabled={Boolean(busy || pendingMember)}>设置位置</Button>
                </Picker>
              )}
              <Button
                className="captain-member__remove"
                disabled={member.isCaptain || Boolean(busy || pendingMember)}
                loading={busy === `member:${member.id}`}
                onClick={() => void remove(member.id, member.displayName)}
              >
                移出
              </Button>
            </View>
          ))}
        </View>
      </View>
    </View>
  )
}

function TeamFollowBar({
  followedTeams,
  primaryTeam,
  saving,
  tournamentId,
  onEdit,
  onRemoveFollow,
}: {
  followedTeams: TeamSummary[]
  primaryTeam: TeamSummary
  saving: boolean
  tournamentId: string
  onEdit: () => void
  onRemoveFollow: (team: TeamSummary) => void
}) {
  return (
    <View className="team-follow-bar surface">
      <View className="team-follow-bar__label">
        <Text>我的关注</Text>
        <Text>点按球队可查看，点「取消」可取消关注</Text>
      </View>
      <ScrollView className="team-follow-bar__scroll" scrollX>
        <View className="team-follow-bar__list">
          <FollowedTeamChip
            isPrimary
            team={primaryTeam}
            tournamentId={tournamentId}
            onRemove={() => undefined}
          />
          {followedTeams.map((team) => (
            <FollowedTeamChip
              key={team.id}
              team={team}
              tournamentId={tournamentId}
              onRemove={() => onRemoveFollow(team)}
            />
          ))}
        </View>
      </ScrollView>
      <Button
        aria-label="管理主队与关注"
        className="team-follow-bar__add"
        disabled={saving}
        onClick={onEdit}
      >
        +
      </Button>
    </View>
  )
}

function FollowedTeamChip({
  isPrimary = false,
  team,
  tournamentId,
  onRemove,
}: {
  isPrimary?: boolean
  team: TeamSummary
  tournamentId: string
  onRemove: () => void
}) {
  const contextMenuProps = isPrimary
    ? {}
    : {
        onContextMenu: (event: { preventDefault: () => void; stopPropagation: () => void }) => {
          event.preventDefault()
          event.stopPropagation()
          onRemove()
        },
      }

  return (
    <View
      {...contextMenuProps}
      className={'followed-team-chip ' + (isPrimary ? 'followed-team-chip--primary' : '')}
      onClick={() => void goToTeam(team.id, tournamentId)}
      onLongPress={() => {
        if (!isPrimary) onRemove()
      }}
    >
      <TeamCrest team={team} size="small" />
      <View className="followed-team-chip__copy">
        <Text>{team.shortName}</Text>
        <Text>{isPrimary ? '主队' : '已关注'}</Text>
      </View>
      {!isPrimary && (
        <Button
          aria-label={`取消关注${team.name}`}
          className="followed-team-chip__remove"
          onClick={(event) => {
            event.stopPropagation()
            onRemove()
          }}
        >
          取消
        </Button>
      )}
    </View>
  )
}

function CompactMatchRow({ label, match }: { label: string; match: MatchSummary }) {
  if (Taro.getEnv() === Taro.ENV_TYPE.WEAPP) return <NativeMatchRow match={match} showDate />
  const hasScore = match.homeScore !== null && match.awayScore !== null
  return (
    <View className="compact-match-row" onClick={() => void goToMatch(match.id)}>
      <Text className="compact-match-row__label">{label}</Text>
      <Text className="compact-match-row__teams">
        {match.homeTeam?.shortName ?? '待定'}
        <Text className="compact-match-row__score">
          {hasScore ? ` ${match.homeScore} : ${match.awayScore} ` : ' vs '}
        </Text>
        {match.awayTeam?.shortName ?? '待定'}
      </Text>
      <Text className="compact-match-row__time">
        {formatDate(match.scheduledStartAt)} {formatTime(match.scheduledStartAt)}
      </Text>
      <Text className="compact-match-row__status">{matchStatusLabel(match.status)}</Text>
    </View>
  )
}

function GroupedRoster({
  roster,
  tournamentId,
}: {
  roster: TeamDashboardResponse['roster']
  tournamentId: string
}) {
  const knownPositions = new Set<string>(POSITION_GROUPS.map((group) => group.key))
  const groups = [
    ...POSITION_GROUPS.map((group) => ({
      ...group,
      players: roster.filter((player) => player.position === group.key),
    })),
    {
      key: 'OTHER',
      label: '其他',
      players: roster.filter((player) => !player.position || !knownPositions.has(player.position)),
    },
  ].filter((group) => group.players.length > 0)

  return (
    <View className="grouped-roster">
      {groups.map((group) => (
        <View className="squad-group" key={group.key}>
          <View className="squad-group__heading">
            <Text>{group.label}</Text>
            <Text>{group.players.length} 人</Text>
          </View>
          <View className="team-roster-grid">
            {group.players.map((player) => (
              <View
                className="squad-player"
                key={player.id}
                onClick={() => void goToPlayer(player.id, tournamentId)}
              >
                <Text className="squad-player__number">{player.shirtNumber ?? '-'}</Text>
                <UserAvatar
                  avatarUrl={player.avatarUrl}
                  name={player.displayName}
                  color={player.profileColor}
                  playerId={player.id}
                  tournamentId={tournamentId}
                />
                <View className="squad-player__copy">
                  <PersonTrigger
                    playerId={player.id}
                    tournamentId={tournamentId}
                    name={player.displayName}
                  >
                    <Text>{player.displayName}</Text>
                  </PersonTrigger>
                  <Text>
                    {positionLabel(player.position)} · {player.academicYear}
                  </Text>
                  {Taro.getEnv() === Taro.ENV_TYPE.WEB ? (
                    <Text>
                      {(player as { rosterSource?: string }).rosterSource === 'TEAM_MEMBERSHIP'
                        ? '球队成员 · 尚未列入赛事锁定名单'
                        : '赛事锁定名单'}
                    </Text>
                  ) : null}
                </View>
                <View className="squad-player__stats">
                  <Text>{player.appearances} 场</Text>
                  <Text>
                    {player.goals} 球 · {player.assists} 助
                  </Text>
                </View>
              </View>
            ))}
          </View>
        </View>
      ))}
    </View>
  )
}

function Record({
  value,
  label,
  accent = false,
}: {
  value: number | string
  label: string
  accent?: boolean
}) {
  return (
    <View className={'team-record__item ' + (accent ? 'team-record__item--accent' : '')}>
      <Text>{value}</Text>
      <Text>{label}</Text>
    </View>
  )
}

function ProfileRow({
  label,
  value,
  multiline = false,
}: {
  label: string
  value: string
  multiline?: boolean
}) {
  return (
    <View className={'team-profile__row ' + (multiline ? 'team-profile__row--multiline' : '')}>
      <Text>{label}</Text>
      <Text>{value}</Text>
    </View>
  )
}

function isCompletedMatch(match: MatchSummary): boolean {
  return match.status === 'FINISHED' || match.status === 'CONFIRMED'
}

function isUpcomingMatch(match: MatchSummary): boolean {
  return match.status === 'SCHEDULED' || match.status === 'CHECK_IN' || match.status === 'LIVE'
}

async function goToMatch(matchId: string) {
  if (Taro.getEnv() === Taro.ENV_TYPE.WEAPP) await openMatch(matchId)
  else
    await Taro.navigateTo({
      url: '/pages/readonly-match-detail/index?matchId=' + encodeURIComponent(matchId),
    })
}

async function goToTeam(teamId: string, tournamentId: string) {
  await openTeam(teamId, tournamentId)
}

async function goToPlayer(playerId: string, tournamentId: string) {
  await openPlayer(playerId, tournamentId)
}
