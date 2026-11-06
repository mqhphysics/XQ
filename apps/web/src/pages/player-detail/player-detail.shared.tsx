import { Image, Text, View } from '@tarojs/components'
import Taro, { getCurrentInstance } from '@tarojs/taro'
import { openTeam } from '../../features/product/team-navigation'
import { useCallback, useEffect, useState } from 'react'

import { PublicShell } from '../../components/public-shell'
import { DataState } from '../../components/public-ui'
import { PlayerPostFeed } from '../../components/player-posts'
import { MatchCard, ProductSection, TeamCrest, UserAvatar } from '../../components/product-ui'
import { footLabel, positionLabel } from '../../features/product/product.format'
import { productRepository, resolveMediaUrl } from '../../features/product/product.repository'
import type { PlayerDetailResponse } from '../../features/product/product.types'

import './index.scss'

type PageState =
  | { phase: 'loading' }
  | { phase: 'failed'; message: string }
  | { phase: 'ready'; player: PlayerDetailResponse }

export default function PlayerDetailPage() {
  const params = getCurrentInstance().router?.params
  const playerId = params?.playerId ?? ''
  const tournamentId = params?.tournamentId ?? ''
  const [state, setState] = useState<PageState>({ phase: 'loading' })

  const load = useCallback(async () => {
    if (!playerId) {
      setState({ phase: 'failed', message: '缺少球员参数。' })
      return
    }
    setState({ phase: 'loading' })
    try {
      setState({
        phase: 'ready',
        player: await productRepository.getPlayer(playerId, tournamentId),
      })
    } catch (error) {
      setState({
        phase: 'failed',
        message: error instanceof Error ? error.message : '球员档案加载失败。',
      })
    }
  }, [playerId, tournamentId])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <PublicShell active="data" showBack tournamentId={tournamentId}>
      {state.phase === 'loading' && <DataState kind="loading" title="正在读取球员档案" />}
      {state.phase === 'failed' && (
        <DataState
          kind="error"
          title="球员档案不可用"
          description={state.message}
          onRetry={() => void load()}
        />
      )}
      {state.phase === 'ready' && (
        <PlayerContent player={state.player} tournamentId={tournamentId} />
      )}
    </PublicShell>
  )
}
function PlayerContent({
  player,
  tournamentId,
}: {
  player: PlayerDetailResponse
  tournamentId: string
}) {
  const portrait = resolveMediaUrl(player.portraitUrl)
  return (
    <View>
      <View className="player-hero" style={{ borderColor: player.profileColor ?? '#1f6b45' }}>
        <View className="player-hero__identity">
          <View className="player-hero__photo">
            {portrait ? (
              <Image
                aria-label={`${player.displayName}的档案照片示意`}
                mode="aspectFill"
                src={portrait}
              />
            ) : (
              <UserAvatar
                avatarUrl={player.avatarUrl}
                name={player.displayName}
                color={player.profileColor}
                size="large"
              />
            )}
          </View>
          <View className="player-hero__copy">
            <Text className="player-hero__eyebrow">PLAYER PROFILE</Text>
            <Text className="player-hero__name">{player.displayName}</Text>
            
            <Text className="player-hero__meta">
              #{player.shirtNumber ?? '-'} · {positionLabel(player.position)}
              {player.secondaryPosition ? ' / ' + positionLabel(player.secondaryPosition) : ''}
            </Text>
          </View>
        </View>
        {player.team && (
          <View
            className="player-team-link"
            onClick={() =>
              void openTeam(player.team!.id, tournamentId)
            }
          >
            <TeamCrest team={player.team} />
            <View>
              <Text>{player.team.name}</Text>
              <Text>{player.tournamentName}</Text>
            </View>
          </View>
        )}
      </View>

      <View className="player-stat-strip">
        <PlayerStat label="出场" value={player.stats.appearances} />
        <PlayerStat label="首发" value={player.stats.starts} />
        <PlayerStat label="分钟" value={player.stats.minutes} />
        <PlayerStat label="进球" value={player.stats.goals} accent />
        <PlayerStat label="助攻" value={player.stats.assists} accent />
        <PlayerStat
          label="黄 / 红牌"
          value={player.stats.yellowCards + ' / ' + player.stats.redCards}
        />
      </View>

      <PlayerAbilities abilities={player.abilities} isDemo={player.isDemo} />

      <View className="player-detail-grid">
        <View>
          <ProductSection kicker="BIOGRAPHY" title="球员信息" />
          <View className="player-facts surface">
            <Fact label="年级" value={player.academicYear ?? '未填写'} />
            <Fact label="专业" value={player.major ?? '未填写'} />
            <Fact label="身高" value={player.heightCm ? player.heightCm + ' cm' : '未填写'} />
            <Fact label="惯用脚" value={footLabel(player.dominantFoot)} />
            <Fact label="家乡" value={player.hometown ?? '未填写'} />
            <Fact label="场上位置" value={positionLabel(player.position)} />
          </View>
        </View>
        <View>
          <ProductSection kicker="ABOUT" title="个人简介" />
          <View className="player-bio surface">
            <Text>{player.bio ?? '这位球员暂时没有填写个人简介。'}</Text>
          </View>
        </View>
      </View>

      <View className="player-matches">
        <ProductSection
          kicker="RECENT APPEARANCES"
          title="最近出场"
          note={player.recentMatches.length + ' 场'}
        />
        {player.recentMatches.length === 0 ? (
          <DataState kind="empty" title="暂无比赛出场记录" />
        ) : (
          <View className="player-match-grid">
            {player.recentMatches.map((match) => (
              <View className="player-match-wrap" key={match.id}>
                <MatchCard
                  match={match}
                  onClick={() =>
                    void Taro.navigateTo({
                      url:
                        '/pages/readonly-match-detail/index?matchId=' +
                        encodeURIComponent(match.id),
                    })
                  }
                />
                <Text className="player-match-wrap__appearance">
                  {match.minutesPlayed === null
                    ? ['SCHEDULED', 'CHECK_IN', 'LIVE', 'POSTPONED'].includes(match.status)
                      ? '待赛'
                      : '已参赛 · 分钟未记录'
                    : `${match.starter === null ? '' : match.starter ? '首发 · ' : '替补 · '}${match.minutesPlayed} 分钟`}
                </Text>
              </View>
            ))}
          </View>
        )}
      </View>
      <PlayerPostFeed playerId={player.id} playerName={player.displayName} tournamentId={tournamentId} posts={player.posts ?? []} />
    </View>
  )
}

function PlayerAbilities({
  abilities,
}: {
  abilities: PlayerDetailResponse['abilities']
  isDemo: boolean
}) {
  const dimensions = [
    { key: 'shooting', label: '射门', value: abilities.shooting },
    { key: 'speed', label: '速度', value: abilities.speed },
    { key: 'dribbling', label: '盘带', value: abilities.dribbling },
    { key: 'passing', label: '传球', value: abilities.passing },
    { key: 'defending', label: '防守', value: abilities.defending },
  ]
  if (dimensions.every(({ value }) => value === null)) return null
  const points = dimensions.map(({ value }, index) => {
    const angle = ((-90 + index * 72) * Math.PI) / 180
    const radius = (43 * Math.min(100, Math.max(0, value ?? 0))) / 100
    return `${50 + Math.cos(angle) * radius}% ${50 + Math.sin(angle) * radius}%`
  })
  return (
    <View className="player-abilities surface">
      <View className="player-abilities__heading">
        <View>
          <Text className="player-abilities__eyebrow">PLAYER ATTRIBUTES</Text>
          <Text className="player-abilities__title">五维能力</Text>
        </View>
        
      </View>
      <View className="player-abilities__content">
        <View className="player-radar" aria-label="射门、速度、盘带、传球、防守五维图">
          <View className="player-radar__grid" />
          <View className="player-radar__grid player-radar__grid--inner" />
          <View
            className="player-radar__shape"
            style={{ clipPath: `polygon(${points.join(', ')})` }}
          />
          {dimensions.map(({ key, label }) => (
            <Text className={`player-radar__label player-radar__label--${key}`} key={key}>
              {label}
            </Text>
          ))}
        </View>
        <View className="player-abilities__list">
          {dimensions.map(({ key, label, value }) => (
            <View className="player-ability" key={key}>
              <Text className="player-ability__label">{label}</Text>
              <View className="player-ability__track">
                <View style={{ width: `${value ?? 0}%` }} />
              </View>
              <Text className="player-ability__value">{value ?? '—'}</Text>
            </View>
          ))}
        </View>
      </View>
    </View>
  )
}

function PlayerStat({
  label,
  value,
  accent = false,
}: {
  label: string
  value: number | string
  accent?: boolean
}) {
  return (
    <View className={'player-stat ' + (accent ? 'player-stat--accent' : '')}>
      <Text>{value}</Text>
      <Text>{label}</Text>
    </View>
  )
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <View className="player-fact">
      <Text>{label}</Text>
      <Text>{value}</Text>
    </View>
  )
}
