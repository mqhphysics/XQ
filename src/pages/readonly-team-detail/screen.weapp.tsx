import { NativeContentPager } from '../../components/native-navigation/content-pager.weapp'
import { Button, Input, Picker, Text, View } from '@tarojs/components'
import Taro, { getCurrentInstance } from '@tarojs/taro'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useNativeRefreshTask } from '../../features/product/native-refresh.weapp'
import { PublicShell, updatePrimaryTeamCache } from '../../components/public-shell'
import { DataState } from '../../components/public-ui'
import { PostCard, TeamCrest } from '../../components/product-ui'
import { NativeMatchRow } from '../../components/native-match-row/index.weapp'
import { NativeDialog } from '../../components/native-ui/index.weapp'
import { NativePlayerFace } from '../../components/native-ui/player-face.weapp'
import {
  NativeDetailTabs,
  NativeFacts,
  NativeProfileCover,
  NativeStats,
} from '../../components/native-navigation/profile-parts.weapp'
import { useNativeRouteState } from '../../features/native-navigation/index.weapp'
import { productRepository, peekNativeProduct } from '../../features/product/product.repository'
import { openPlayer } from '../../features/product/player-navigation'
import { openPost } from '../../features/product/post-navigation'
import { positionLabel } from '../../features/product/product.format'
import { readSession } from '../../features/product/session'
import type {
  TeamDashboardResponse,
  TeamPreferencesResponse,
  TeamRelationshipResponse,
} from '../../features/product/product.types'

const tabs = ['动态', '赛程', '球员', '数据', '资料']
export default function NativeTeamScreen({
  teamId: suppliedTeam,
  tournamentId: suppliedTournament,
  compact = false,
}: { teamId?: string | undefined; tournamentId?: string | undefined; compact?: boolean } = {}) {
  const params = getCurrentInstance().router?.params
  const teamId = suppliedTeam || params?.teamId || '',
    tournamentId = suppliedTournament || params?.tournamentId || ''
  const [data, setData] = useNativeRouteState<TeamDashboardResponse | null>(
    'team-data',
    peekNativeProduct<TeamDashboardResponse>(
      `/public/teams/${encodeURIComponent(teamId)}/dashboard${tournamentId ? `?tournamentId=${encodeURIComponent(tournamentId)}` : ''}`,
    ) || null,
  )
  const [tab, setTab] = useNativeRouteState('team-tab', 0)
  const [error, setError] = useState(''),
    [attempt, setAttempt] = useState(0)
  const loadSequence = useRef(0)
  const load = useCallback(async () => {
    const ticket = ++loadSequence.current
    try {
      const value = await productRepository.getTeamDashboard(teamId, tournamentId || undefined)
      if (ticket === loadSequence.current) {
        setData(value)
        setError('')
      }
    } catch (issue) {
      if (ticket === loadSequence.current)
        setError(issue instanceof Error ? issue.message : '档案读取失败')
    }
  }, [teamId, tournamentId, attempt, setData])
  useNativeRefreshTask(load)
  useEffect(() => {
    void load()
    return () => {
      loadSequence.current++
    }
  }, [load])
  return (
    <PublicShell active="team" showBack tournamentId={tournamentId}>
      {!data && !error && <DataState kind="loading" title="正在读取球队档案" />}
      {error && (
        <DataState
          kind="error"
          title="球队档案暂不可用"
          description={error}
          onRetry={() => setAttempt((value) => value + 1)}
        />
      )}
      {data && (
        <View>
          <TeamActions data={data} compact={compact} />
          <NativeDetailTabs tabs={tabs} selected={tab} onSelect={setTab} />
          <NativeContentPager
            index={tab}
            onSelect={setTab}
            pages={[
              <>
                {data.posts.length ? (
                  data.posts.map((post) => (
                    <PostCard key={post.id} post={post} onOpen={() => void openPost(post.id)} />
                  ))
                ) : (
                  <Text className="native-profile-copy">暂无球队动态</Text>
                )}
              </>,
              <>
                {[...data.upcomingMatches, ...data.recentMatches].map((match) => (
                  <NativeMatchRow key={match.id} match={match} showDate />
                ))}
                {!data.upcomingMatches.length && !data.recentMatches.length && (
                  <Text className="native-profile-copy">暂无已公布赛程</Text>
                )}
              </>,
              <>
                <View className="native-profile-roster">
                  {data.roster.map((player) => (
                    <Button
                      key={player.id}
                      onClick={() => void openPlayer(player.id, tournamentId)}
                    >
                      <NativePlayerFace
                        playerId={player.id}
                        tournamentId={tournamentId}
                        loadPortrait={tab === 2}
                        avatarUrl={player.avatarUrl}
                        name={player.displayName}
                      />
                      <View>
                        <Text>
                          {player.shirtNumber ? `${player.shirtNumber} · ` : ''}
                          {player.displayName}
                        </Text>
                        <Text>
                          {positionLabel(player.position)} · {player.appearances} 场
                        </Text>
                      </View>
                      <Text>
                        {player.goals} 球 · {player.assists} 助
                      </Text>
                    </Button>
                  ))}
                </View>
              </>,
              <NativeStats
                values={[
                  ['场次', data.stats.played],
                  ['胜 / 平 / 负', `${data.stats.won}/${data.stats.drawn}/${data.stats.lost}`],
                  ['积分', data.stats.points],
                  ['进球', data.stats.goalsFor],
                  ['失球', data.stats.goalsAgainst],
                  ['净胜球', data.stats.goalDifference],
                ]}
              />,
              <>
                <NativeFacts
                  values={[
                    ['成立', data.team.foundedYear || '未登记'],
                    ['院系', data.team.collegeName || '未登记'],
                    ['队长', data.team.captainName || '未登记'],
                    ['教练', data.team.coachName || '未登记'],
                    ['小组', data.team.groupName || '未分组'],
                  ]}
                />
                <Text className="native-profile-section-title">球队简介</Text>
                <Text className="native-profile-copy">
                  {data.team.description || '暂无球队简介'}
                </Text>
                <Text className="native-profile-section-title">人员变动</Text>
                <Text className="native-profile-copy">暂无已登记的公开人员变动记录</Text>
              </>,
            ]}
          />
        </View>
      )}
    </PublicShell>
  )
}
function TeamActions({ data, compact }: { data: TeamDashboardResponse; compact: boolean }) {
  const [prefs, setPrefs] = useState<TeamPreferencesResponse | null>(null),
    [relation, setRelation] = useState<TeamRelationshipResponse | null>(null)
  const [busy, setBusy] = useState(false),
    [join, setJoin] = useState(false),
    [message, setMessage] = useState(''),
    [position, setPosition] = useState(2)
  const positions = ['GOALKEEPER', 'DEFENDER', 'MIDFIELDER', 'FORWARD']
  useEffect(() => {
    let current = true
    if (readSession()) {
      void productRepository
        .getTeamPreferences()
        .then((value) => {
          if (current) setPrefs(value)
        })
        .catch(() => {})
      void productRepository
        .getTeamRelationship(data.team.id)
        .then((value) => {
          if (current) setRelation(value)
        })
        .catch(() => {})
    }
    return () => {
      current = false
    }
  }, [data.team.id])
  const act = async (mode: 'primary' | 'follow' | 'join') => {
    if (busy) return
    if (!readSession()) {
      void Taro.showToast({ title: '登录后可以操作', icon: 'none' })
      return
    }
    if (mode === 'join') {
      setJoin(true)
      return
    }
    setBusy(true)
    try {
      const before = await productRepository.getTeamPreferences()
      const primary = mode === 'primary' ? data.team.id : before.primaryTeam?.id
      if (!primary) throw new Error('请先选择一支主队')
      const ids = before.followedTeams.map((team) => team.id)
      const followed =
        mode === 'follow'
          ? ids.includes(data.team.id)
            ? ids.filter((id) => id !== data.team.id)
            : [...ids, data.team.id]
          : ids
      const next = await productRepository.updateTeamPreferences(
        primary,
        followed.filter((id) => id !== primary),
      )
      setPrefs(next)
      updatePrimaryTeamCache(next.primaryTeam)
      Taro.eventCenter.trigger('xiaoqiu:native-team-preferences')
    } catch (issue) {
      void Taro.showToast({
        title: issue instanceof Error ? issue.message : '操作失败',
        icon: 'none',
      })
    } finally {
      setBusy(false)
    }
  }
  const apply = async () => {
    if (busy) return
    setBusy(true)
    try {
      setRelation(await productRepository.applyToTeam(data.team.id, positions[position]!, message))
      setJoin(false)
      void Taro.showToast({ title: '申请已提交', icon: 'none' })
    } catch (issue) {
      void Taro.showToast({
        title: issue instanceof Error ? issue.message : '申请失败',
        icon: 'none',
      })
    } finally {
      setBusy(false)
    }
  }
  return (
    <>
      <View className="native-team-cover">
        <NativeProfileCover src={data.team.coverUrl} compact={compact}>
          <TeamCrest team={data.team} size="large" interactive={false} />
          <View className="native-profile-cover__copy">
            <Text>{data.team.name}</Text>
            <Text>{data.team.collegeName || '校园足球球队'}</Text>
            <Text>{data.team.motto || '每一次奔跑，都为共同的热爱'}</Text>
          </View>
          <View className="native-profile-actions native-team-cover-actions">
            <Button
              disabled={busy || prefs?.primaryTeam?.id === data.team.id}
              onClick={async () => {
                const followed = prefs?.followedTeams.some((team) => team.id === data.team.id)
                if (followed) {
                  const result = await Taro.showActionSheet({
                    itemList: ['设为我的主队', '取消关注'],
                  }).catch(() => null)
                  if (result) void act(result.tapIndex === 0 ? 'primary' : 'follow')
                } else if (!prefs?.primaryTeam) {
                  const result = await Taro.showActionSheet({ itemList: ['设为我的主队'] }).catch(
                    () => null,
                  )
                  if (result) void act('primary')
                } else void act('follow')
              }}
            >
              {prefs?.primaryTeam?.id === data.team.id
                ? '我的主队'
                : prefs?.followedTeams.some((team) => team.id === data.team.id)
                  ? '已关注'
                  : '关注球队'}
            </Button>
            <Button
              disabled={
                busy ||
                relation?.membershipStatus === 'ACTIVE' ||
                relation?.application?.status === 'PENDING'
              }
              onClick={() => void act('join')}
            >
              {relation?.membershipStatus === 'ACTIVE'
                ? '已在队中'
                : relation?.application?.status === 'PENDING'
                  ? '申请中'
                  : '申请加入'}
            </Button>
          </View>
        </NativeProfileCover>
      </View>
      {join && (
        <NativeDialog
          title="申请加入球队"
          busy={busy}
          onClose={() => setJoin(false)}
          footer={
            <Button
              className="native-button native-button--primary"
              loading={busy}
              onClick={() => void apply()}
            >
              提交申请
            </Button>
          }
        >
          <Picker
            range={positions.map(positionLabel)}
            value={position}
            onChange={(event) => setPosition(Number(event.detail.value))}
          >
            <Text className="native-profile-copy">
              位置 · {positionLabel(positions[position]!)}
            </Text>
          </Picker>
          <Input
            className="native-input"
            value={message}
            maxlength={500}
            placeholder="给队长留言（选填）"
            onInput={(event) => setMessage(event.detail.value)}
          />
        </NativeDialog>
      )}
    </>
  )
}
