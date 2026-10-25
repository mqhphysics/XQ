import { NativeContentPager } from '../../components/native-navigation/content-pager.weapp'
import { Button, Image, Text, View } from '@tarojs/components'
import { getCurrentInstance } from '@tarojs/taro'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useNativeRefreshTask } from '../../features/product/native-refresh.weapp'
import { PublicShell } from '../../components/public-shell'
import { DataState } from '../../components/public-ui'
import { PostCard, TeamCrest } from '../../components/product-ui'
import { NativeMatchRow } from '../../components/native-match-row/index.weapp'
import {
  NativeDetailTabs,
  NativeFacts,
  NativeProfileCover,
  NativeStats,
} from '../../components/native-navigation/profile-parts.weapp'
import { useNativeRouteState } from '../../features/native-navigation/index.weapp'
import {
  productRepository,
  resolveMediaUrl,
  peekNativeProduct,
} from '../../features/product/product.repository'
import { footLabel, positionLabel } from '../../features/product/product.format'
import { openTeam } from '../../features/product/team-navigation'
import { openPost } from '../../features/product/post-navigation'
import type { PlayerDetailResponse } from '../../features/product/product.types'
import { NativeSelfPlayerDialog } from '../me/identities.weapp'
import { NativePlayerFace } from '../../components/native-ui/player-face.weapp'
import { useNativeCurrentUser } from '../../features/product/current-user.weapp'
import { ownsNativePlayer } from '../../features/product/native-profile.logic.weapp'

const tabs = ['动态', '赛程', '数据', '资料']
export default function NativePlayerScreen({
  playerId: suppliedPlayer,
  tournamentId: suppliedTournament,
  compact = false,
}: { playerId?: string | undefined; tournamentId?: string | undefined; compact?: boolean } = {}) {
  const params = getCurrentInstance().router?.params,
    playerId = suppliedPlayer || params?.playerId || '',
    tournamentId = suppliedTournament || params?.tournamentId || ''
  const [player, setPlayer] = useNativeRouteState<PlayerDetailResponse | null>(
      'player-data',
      peekNativeProduct<PlayerDetailResponse>(
        `/public/players/${encodeURIComponent(playerId)}${tournamentId ? `?tournamentId=${encodeURIComponent(tournamentId)}` : ''}`,
      ) || null,
    ),
    [tab, setTab] = useNativeRouteState('player-tab', 0)
  const [error, setError] = useState(''),
    [attempt, setAttempt] = useState(0),
    [editing, setEditing] = useState(false)
  const user = useNativeCurrentUser()
  const ownPlayer = ownsNativePlayer(user, player)
  const loadSequence = useRef(0)
  const load = useCallback(async () => {
    const ticket = ++loadSequence.current
    try {
      const value = await productRepository.getPlayer(playerId, tournamentId)
      if (ticket === loadSequence.current) {
        setPlayer(value)
        setError('')
      }
    } catch (issue) {
      if (ticket === loadSequence.current)
        setError(issue instanceof Error ? issue.message : '档案读取失败')
    }
  }, [playerId, tournamentId, attempt, setPlayer])
  useNativeRefreshTask(load)
  useEffect(() => {
    void load()
    return () => {
      loadSequence.current++
    }
  }, [load])
  return (
    <PublicShell active="data" showBack tournamentId={tournamentId}>
      {!player && !error && <DataState kind="loading" title="正在读取球员档案" />}
      {error && (
        <DataState
          kind="error"
          title="球员档案暂不可用"
          description={error}
          onRetry={() => setAttempt((value) => value + 1)}
        />
      )}
      {player && (
        <View className="native-player-detail">
          <NativeProfileCover player src={player.coverUrl} compact={compact}>
            <View className="native-profile-portrait">
              {player.portraitUrl ? (
                <Image src={resolveMediaUrl(player.portraitUrl)!} mode="aspectFill" />
              ) : (
                <NativePlayerFace name={player.displayName} avatarUrl={player.avatarUrl} large />
              )}
            </View>
            <View className="native-profile-cover__copy">
              <Text>{player.displayName}</Text>
              <Text>
                {player.shirtNumber ? `${player.shirtNumber} 号 · ` : ''}
                {positionLabel(player.position)}
              </Text>
              {player.team && (
                <Button
                  className="native-player-team"
                  onClick={() => void openTeam(player.team!.id, tournamentId)}
                >
                  <TeamCrest team={player.team} interactive={false} size="small" />
                  <Text>{player.team.name}</Text>
                </Button>
              )}
            </View>
          </NativeProfileCover>
          {ownPlayer && (
            <Button className="native-button native-player-edit" onClick={() => setEditing(true)}>
              编辑球员资料
            </Button>
          )}
          <NativeDetailTabs tabs={tabs} selected={tab} onSelect={setTab} />
          <NativeContentPager
            index={tab}
            onSelect={setTab}
            pages={[
              <>
                {player.posts?.length ? (
                  player.posts.map((post) => (
                    <PostCard key={post.id} post={post} onOpen={() => void openPost(post.id)} />
                  ))
                ) : (
                  <Text className="native-profile-copy">暂无球员动态</Text>
                )}
              </>,
              <>
                {player.recentMatches.map((match) => (
                  <View key={match.id}>
                    <NativeMatchRow match={match} showDate />
                    <Text className="native-note">
                      {match.starter ? '首发' : '替补'} · {match.minutesPlayed} 分钟
                    </Text>
                  </View>
                ))}
                {!player.recentMatches.length && (
                  <Text className="native-profile-copy">暂无比赛记录</Text>
                )}
              </>,
              <>
                <NativeStats
                  values={[
                    ['出场', player.stats.appearances],
                    ['首发', player.stats.starts],
                    ['分钟', player.stats.minutes],
                    ['进球', player.stats.goals],
                    ['助攻', player.stats.assists],
                    ['黄 / 红牌', `${player.stats.yellowCards} / ${player.stats.redCards}`],
                  ]}
                />
                <Text className="native-profile-section-title">五维能力</Text>
                {(
                  [
                    ['射门', player.abilities.shooting],
                    ['速度', player.abilities.speed],
                    ['盘带', player.abilities.dribbling],
                    ['传球', player.abilities.passing],
                    ['防守', player.abilities.defending],
                  ] as const
                ).map(([label, value]) => (
                  <View className="native-ability" key={label}>
                    <Text>{label}</Text>
                    <View>
                      <View style={`width:${Math.max(0, Math.min(value || 0, 100))}%;`} />
                    </View>
                    <Text>{value ?? '—'}</Text>
                  </View>
                ))}
              </>,
              <>
                <NativeFacts
                  values={[
                    ['年级', player.academicYear || '未填写'],
                    ['专业', player.major || '未填写'],
                    ['身高', player.heightCm ? `${player.heightCm} cm` : '未填写'],
                    ['惯用脚', footLabel(player.dominantFoot)],
                    ['家乡', player.hometown || '未填写'],
                    ['位置', positionLabel(player.position)],
                  ]}
                />
                <Text className="native-profile-section-title">个人简介</Text>
                <Text className="native-profile-copy">
                  {player.bio || '这位球员暂时没有填写简介'}
                </Text>
              </>,
            ]}
          />
          {editing && user && ownPlayer && (
            <NativeSelfPlayerDialog
              playerId={playerId}
              user={user}
              tournamentId={tournamentId}
              onClose={() => setEditing(false)}
              onSaved={() => setAttempt((value) => value + 1)}
            />
          )}
        </View>
      )}
    </PublicShell>
  )
}
