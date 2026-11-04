import { Button, Input, Picker, Text, View } from '@tarojs/components'
import Taro, { getCurrentInstance } from '@tarojs/taro'
import { useCallback, useEffect, useState } from 'react'

import { PublicShell } from '../../components/public-shell'
import { PersonTrigger } from '../../components/person-trigger'
import { DataState } from '../../components/public-ui'
import {
  MatchCard,
  PostCard,
  ProductSection,
  TeamCrest,
  UserAvatar,
} from '../../components/product-ui'
import { positionLabel } from '../../features/product/product.format'
import { productRepository } from '../../features/product/product.repository'
import { openPlayer } from '../../features/product/player-navigation'
import { readSession } from '../../features/product/session'
import { useDetailBack } from '../readonly-schedule/detail-back'
import type {
  TeamDashboardResponse,
  TeamRelationshipResponse,
} from '../../features/product/product.types'

import './index.scss'

const POSITION_GROUPS = [
  { key: 'FORWARD', label: '前锋' },
  { key: 'MIDFIELDER', label: '中场' },
  { key: 'DEFENDER', label: '后卫' },
  { key: 'GOALKEEPER', label: '门将' },
] as const

type PageState =
  | { phase: 'loading' }
  | { phase: 'failed'; message: string }
  | { phase: 'ready'; team: TeamDashboardResponse; tournamentId: string }

type RelationshipState =
  | { phase: 'guest' }
  | { phase: 'loading' }
  | { phase: 'failed'; message: string }
  | { phase: 'ready'; value: TeamRelationshipResponse }

export default function TeamDetailPage() {
  const params = getCurrentInstance().router?.params
  const teamId = params?.teamId ?? ''
  const routeTournamentId = params?.tournamentId ?? ''
  const [state, setState] = useState<PageState>({ phase: 'loading' })
  useDetailBack(
    `/pages/my-team/index${routeTournamentId ? `?tournamentId=${encodeURIComponent(routeTournamentId)}` : ''}`,
  )

  const load = useCallback(async () => {
    if (!teamId) {
      setState({ phase: 'failed', message: '缺少球队参数。' })
      return
    }
    setState({ phase: 'loading' })
    try {
      const tournamentId = routeTournamentId || (await productRepository.getHome()).tournament.id
      const team = await productRepository.getTeamDashboard(teamId, tournamentId)
      setState({ phase: 'ready', team, tournamentId })
    } catch (error) {
      setState({
        phase: 'failed',
        message: error instanceof Error ? error.message : '球队详情加载失败。',
      })
    }
  }, [routeTournamentId, teamId])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <PublicShell
      active="team"
      showBack
      tournamentId={state.phase === 'ready' ? state.tournamentId : routeTournamentId}
    >
      {state.phase === 'loading' && <DataState kind="loading" title="正在读取球队档案" />}
      {state.phase === 'failed' && (
        <DataState
          kind="error"
          title="球队详情不可用"
          description={state.message}
          onRetry={() => void load()}
        />
      )}
      {state.phase === 'ready' && (
        <TeamContent data={state.team} tournamentId={state.tournamentId} />
      )}
    </PublicShell>
  )
}

function TeamContent({
  data,
  tournamentId,
}: {
  data: TeamDashboardResponse
  tournamentId: string
}) {
  const authenticated = Boolean(readSession())
  const [relationship, setRelationship] = useState<RelationshipState>(
    authenticated ? { phase: 'loading' } : { phase: 'guest' },
  )
  const [position, setPosition] = useState('MIDFIELDER')
  const [message, setMessage] = useState('')
  const [applying, setApplying] = useState(false)
  const loadRelationship = useCallback(async () => {
    if (!readSession()) {
      setRelationship({ phase: 'guest' })
      return
    }
    setRelationship({ phase: 'loading' })
    try {
      setRelationship({
        phase: 'ready',
        value: await productRepository.getTeamRelationship(data.team.id),
      })
    } catch (error) {
      setRelationship({
        phase: 'failed',
        message: error instanceof Error ? error.message : '球队关系加载失败',
      })
    }
  }, [data.team.id])
  useEffect(() => {
    void loadRelationship()
  }, [loadRelationship])
  const apply = async () => {
    if (!readSession()) {
      await Taro.reLaunch({ url: '/pages/login/index' })
      return
    }
    setApplying(true)
    try {
      setRelationship({
        phase: 'ready',
        value: await productRepository.applyToTeam(data.team.id, position, message),
      })
      await Taro.showToast({ title: '申请已提交', icon: 'success' })
    } catch (error) {
      await Taro.showToast({
        title: error instanceof Error ? error.message : '申请提交失败',
        icon: 'none',
      })
    } finally {
      setApplying(false)
    }
  }
  const knownPositions = new Set<string>(POSITION_GROUPS.map((group) => group.key))
  const rosterGroups = [
    ...POSITION_GROUPS.map((group) => ({
      ...group,
      players: data.roster.filter((player) => player.position === group.key),
    })),
    {
      key: 'OTHER',
      label: '其他',
      players: data.roster.filter(
        (player) => !player.position || !knownPositions.has(player.position),
      ),
    },
  ].filter((group) => group.players.length > 0)

  return (
    <View>
      <View
        className="public-team-hero"
        style={{ borderColor: data.team.primaryColor ?? '#1f6b45' }}
      >
        <View className="public-team-hero__identity">
          <TeamCrest team={data.team} size="large" />
          <View className="public-team-hero__copy">
            <Text className="public-team-hero__eyebrow">
              {data.team.teamCode} · {data.team.groupName}
            </Text>
            <Text className="public-team-hero__title">{data.team.name}</Text>
            <Text className="public-team-hero__college">{data.team.collegeName}</Text>
            <Text className="public-team-hero__motto">{data.team.motto}</Text>
          </View>
        </View>
        <View className="public-team-hero__staff">
          <View>
            <Text>队长</Text>
            <Text>{data.team.captainName ?? '未设置'}</Text>
          </View>
          <View>
            <Text>教练</Text>
            <Text>{data.team.coachName ?? '未设置'}</Text>
          </View>
          <View className="team-join-action">
            {relationship.phase === 'guest' ? (
              <Button onClick={() => void Taro.reLaunch({ url: '/pages/login/index' })}>
                登录后申请加入
              </Button>
            ) : relationship.phase === 'loading' ? (
              <Text>正在读取球队关系…</Text>
            ) : relationship.phase === 'failed' ? (
              <View>
                <Text>{relationship.message}</Text>
                <Button onClick={() => void loadRelationship()}>重试</Button>
              </View>
            ) : relationship.value.isCaptain ? (
              <Button
                onClick={() =>
                  void Taro.reLaunch({
                    url: `/pages/my-team/index?tournamentId=${encodeURIComponent(tournamentId)}&teamId=${encodeURIComponent(data.team.id)}`,
                  })
                }
              >
                进入球队管理
              </Button>
            ) : relationship.value.membershipStatus === 'ACTIVE' ? (
              <Text>已是球队成员</Text>
            ) : relationship.value.application?.status === 'PENDING' ? (
              <Text>入队申请待审批</Text>
            ) : (
              <>
                <Picker
                  mode="selector"
                  range={POSITION_GROUPS.map((item) => item.label)}
                  value={Math.max(
                    0,
                    POSITION_GROUPS.findIndex((item) => item.key === position),
                  )}
                  onChange={(event) =>
                    setPosition(POSITION_GROUPS[Number(event.detail.value)]?.key ?? 'MIDFIELDER')
                  }
                >
                  <Button>选择位置 · {positionLabel(position)}</Button>
                </Picker>
                <Input
                  maxlength={500}
                  placeholder="给队长留言（选填）"
                  value={message}
                  onInput={(event) => setMessage(event.detail.value)}
                />
                <Button loading={applying} onClick={() => void apply()}>
                  申请加入
                </Button>
              </>
            )}
          </View>
        </View>
      </View>

      <View className="public-team-section">
        <ProductSection
          kicker="MATCHES"
          title="近期比赛"
          actionLabel="全部赛程"
          onAction={() =>
            void Taro.reLaunch({
              url: `/pages/readonly-schedule/index?tournamentId=${encodeURIComponent(tournamentId)}`,
            })
          }
        />
        <View className="public-team-match-grid">
          {[...data.recentMatches.slice(0, 1), ...data.upcomingMatches.slice(0, 1)].map((match) => (
            <MatchCard
              key={match.id}
              match={match}
              onClick={() =>
                void Taro.navigateTo({
                  url: '/pages/readonly-match-detail/index?matchId=' + encodeURIComponent(match.id),
                })
              }
            />
          ))}
        </View>
      </View>

      <View className="public-team-section">
        <ProductSection kicker="TEAM FEED" title="球队动态" note={`${data.posts.length} 条`} />
        <View className="public-team-posts">
          {data.posts.map((post) => (
            <PostCard
              key={post.id}
              post={post}
              onOpen={() =>
                void Taro.navigateTo({
                  url: `/pages/post-detail/index?postId=${encodeURIComponent(post.id)}`,
                })
              }
            />
          ))}
          {data.posts.length === 0 && <Text className="public-team-empty">暂无球队动态</Text>}
        </View>
      </View>

      <View className="public-team-record">
        <Record value={data.stats.played} label="比赛" />
        <Record value={data.stats.won} label="胜" />
        <Record value={data.stats.drawn} label="平" />
        <Record value={data.stats.lost} label="负" />
        <Record value={data.stats.goalsFor + ':' + data.stats.goalsAgainst} label="进失球" />
        <Record value={data.stats.points} label="积分" accent />
      </View>

      <View className="public-team-about surface">
        <Text className="public-team-about__label">球队简介</Text>
        <Text className="public-team-about__body">{data.team.description ?? '暂无球队简介。'}</Text>
        <Text className="public-team-about__founded">
          {data.team.foundedYear ? '成立于 ' + data.team.foundedYear + ' 年' : ''}
        </Text>
      </View>

      <View className="public-team-section">
        <ProductSection
          kicker="SQUAD"
          title={Taro.getEnv() === Taro.ENV_TYPE.WEB ? '球队球员' : '完整阵容'}
          note={data.roster.length + ' 名球员'}
        />
        {Taro.getEnv() === Taro.ENV_TYPE.WEB ? (
          <Text className="public-team-eligibility-note">
            球队成员与赛事锁定名单分别维护，正式参赛资格以赛事审核结果为准。
          </Text>
        ) : null}
        <View className="public-roster-groups">
          {rosterGroups.map((group) => (
            <View className="public-roster-group surface" key={group.key}>
              <View className="public-roster-group__heading">
                <Text>{group.label}</Text>
                <Text>{group.players.length} 人</Text>
              </View>
              <View className="public-roster">
                <View className="public-roster__head">
                  <Text>号码</Text>
                  <Text>球员</Text>
                  <Text>位置 / 年级</Text>
                  <Text>出场</Text>
                  <Text>进球</Text>
                  <Text>助攻</Text>
                </View>
                {group.players.map((player) => (
                  <View
                    className="public-roster__row"
                    key={player.id}
                    onClick={() => void openPlayer(player.id, tournamentId)}
                  >
                    <Text className="public-roster__number">{player.shirtNumber ?? '-'}</Text>
                    <View className="public-roster__player">
                      <UserAvatar
                        avatarUrl={player.avatarUrl}
                        playerId={player.id}
                        tournamentId={tournamentId}
                        name={player.displayName}
                        color={player.profileColor}
                        size="small"
                      />
                      <PersonTrigger
                        playerId={player.id}
                        tournamentId={tournamentId}
                        name={player.displayName}
                      >
                        <Text>{player.displayName}</Text>
                      </PersonTrigger>
                    </View>
                    <Text className="public-roster__position">
                      {positionLabel(player.position)} · {player.academicYear}
                      {Taro.getEnv() === Taro.ENV_TYPE.WEB ? (
                        <Text className="public-roster__source">
                          {(player as { rosterSource?: string }).rosterSource === 'TEAM_MEMBERSHIP'
                            ? '球队成员 · 未在赛事锁定名单中'
                            : '赛事锁定名单'}
                        </Text>
                      ) : null}
                    </Text>
                    <Text>{player.appearances}</Text>
                    <Text>{player.goals}</Text>
                    <Text>{player.assists}</Text>
                  </View>
                ))}
              </View>
            </View>
          ))}
        </View>
      </View>
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
    <View
      className={'public-team-record__item ' + (accent ? 'public-team-record__item--accent' : '')}
    >
      <Text>{value}</Text>
      <Text>{label}</Text>
    </View>
  )
}
