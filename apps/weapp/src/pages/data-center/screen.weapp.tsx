import { Button, Swiper, SwiperItem, Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useEffect, useState } from 'react'
import { NativeRefreshScroll } from '../../features/product/native-refresh.weapp'
import { PublicShell } from '../../components/public-shell'
import { DataState } from '../../components/public-ui'
import { NativeDialog } from '../../components/native-ui/index.weapp'
import {
  NativeTournamentSelect,
  useNativeCompetition,
  useNativePanelHeight,
} from '../../components/native-ui/competition.weapp'
import { NativeKnockout } from '../../components/native-ui/knockout.weapp'
import { hasReachedKnockout } from '../../components/native-ui/mobile-cup.logic.weapp'
import { cupQualifyingPlaces } from '../../components/native-ui/cup-preview.logic'
import { TeamCrest } from '../../components/product-ui'
import { openPlayer } from '../../features/product/player-navigation'
import { openTeam } from '../../features/product/team-navigation'
import type {
  CompetitionDataResponse,
  PlayerStats,
  StandingRow,
  TeamSummary,
} from '../../features/product/product.types'
import { useNativeViewport } from '../../features/native-navigation/viewport.weapp'
import { nativeWideWindow } from '../../features/native-navigation/viewport.logic.weapp'
import './index.weapp.scss'
import {
  takeNativeDataEntry,
  registerNativePanelBack,
  useNestedNativeSwipe,
} from '../../features/native-navigation/index.weapp'
import { useNativePanelVisible } from '../../components/native-navigation/panel-context.weapp'

const tabs = ['积分', '射手榜', '助攻榜']
export default function NativeDataScreen() {
  const { state, load, tournamentId } = useNativeCompetition({ viewerDefault: true })
  return (
    <>
      <PublicShell active="data" tournamentId={tournamentId}>
        {state.phase === 'loading' && <DataState kind="loading" title="正在读取赛事数据" />}
        {state.phase === 'failed' && (
          <DataState
            kind="error"
            title="数据暂不可用"
            description={state.message}
            onRetry={() => void load()}
          />
        )}
        {state.phase === 'ready' && (
          <NativeDataContent
            key={state.data.tournament.id}
            data={state.data}
            onTournament={(id) => void load(id)}
          />
        )}
      </PublicShell>
    </>
  )
}
/** Wide windows only: the website's 赛事数据 title and three KPI tags (index.h5.tsx DataHero). */
function WideDataHero({ data }: { data: CompetitionDataResponse }) {
  const teams = new Set<string>()
  for (const match of data.schedule) {
    if (match.homeTeam) teams.add(match.homeTeam.id)
    if (match.awayTeam) teams.add(match.awayTeam.id)
  }
  for (const group of data.groups) for (const row of group.standings) teams.add(row.teamId)
  const finished = data.schedule.filter(
    (match) =>
      ['FINISHED', 'CONFIRMED'].includes(match.status) &&
      match.homeScore !== null &&
      match.awayScore !== null,
  )
  const goals = finished.reduce(
    (total, match) => total + (match.homeScore ?? 0) + (match.awayScore ?? 0),
    0,
  )
  const stats: Array<[string, string, number, string]> = [
    ['teams', '参赛球队', teams.size, '支'],
    ['pitch', '已赛场次', finished.length, '场'],
    ['ball', '总进球', goals, '个'],
  ]
  return (
    <View className="native-data-hero">
      <Text className="native-data-hero__title">赛事数据</Text>
      <View className="native-data-hero__kpis">
        {stats.map(([icon, label, value, unit]) => (
          <View className="native-data-hero__stat" key={icon}>
            <View className={`native-data-hero__icon native-data-hero__icon--${icon}`} />
            <View className="native-data-hero__copy">
              <Text className="native-data-hero__label">{label}</Text>
              <View className="native-data-hero__line">
                <Text className="native-data-hero__value">{value}</Text>
                <Text className="native-data-hero__unit">{unit}</Text>
              </View>
            </View>
          </View>
        ))}
      </View>
    </View>
  )
}

function NativeDataContent({
  data,
  onTournament,
}: {
  data: CompetitionDataResponse
  onTournament: (id: string) => void
}) {
  const [tab, setTab] = useState(() => (takeNativeDataEntry() === -1 ? tabs.length - 1 : 0))
  const visible = useNativePanelVisible()
  useEffect(() => {
    const show = () => setTab(0)
    Taro.eventCenter.on('xiaoqiu:data:standings', show)
    return () => {
      Taro.eventCenter.off('xiaoqiu:data:standings', show)
    }
  }, [])
  useEffect(() => {
    if (!visible) return
    const direction = takeNativeDataEntry()
    if (direction) setTab(direction === -1 ? tabs.length - 1 : 0)
    return registerNativePanelBack(() => {
      if (!tab) return false
      setTab(tab - 1)
      return true
    })
  }, [visible, tab])
  const showKnockout = hasReachedKnockout(data)
  const height = useNativePanelHeight('.native-data-swiper')
  const gestures = useNestedNativeSwipe(tab, tabs.length, setTab, false, true)
  const wide = nativeWideWindow(useNativeViewport())
  return (
    <View className="native-data" {...gestures}>
      {wide && <WideDataHero data={data} />}
      <View className="native-data-toolbar" id="native-guide-data-toolbar">
        <NativeTournamentSelect data={data} onSelect={onTournament} season />
        <View className="native-data-tabs" role="tablist">
          {tabs.map((title, index) => (
            <Button
              hoverClass="native-press"
              hoverStartTime={0}
              hoverStayTime={60}
              key={title}
              className={tab === index ? 'is-active' : ''}
              aria-selected={tab === index}
              onClick={() => setTab(index)}
            >
              {index === 0 && showKnockout ? '对阵' : title}
            </Button>
          ))}
        </View>
      </View>
      <Swiper
        id="native-guide-data-board"
        className={`native-data-swiper${showKnockout ? ' native-data-swiper--cup' : ''}`}
        current={tab}
        duration={280}
        easingFunction="easeOutCubic"
        onChange={(event) => setTab(event.detail.current)}
        style={`height:${height}px;`}
      >
        <SwiperItem>
          <NativeRefreshScroll
            id="native-data-groups"
            className="native-data-scroll"
            scrollY
            showScrollbar={false}
          >
            {showKnockout && <NativeKnockout data={data} />}
            <View className={showKnockout ? 'native-data-after-cup' : ''}>
              {showKnockout && data.groups.length > 0 && (
                <Text className="native-section-title">小组赛积分</Text>
              )}
              {(!showKnockout || data.groups.length > 0) && <Groups data={data} />}
            </View>
          </NativeRefreshScroll>
        </SwiperItem>
        <SwiperItem>
          <NativeRefreshScroll
            id="native-data-scorers"
            className={`native-data-scroll${showKnockout ? ' native-data-scroll--inset' : ''}`}
            scrollY
            showScrollbar={false}
          >
            <LeaderTable
              rows={data.leaders.scorers}
              mode="goals"
              tournamentId={data.tournament.id}
            />
          </NativeRefreshScroll>
        </SwiperItem>
        <SwiperItem>
          <NativeRefreshScroll
            id="native-data-assists"
            className={`native-data-scroll${showKnockout ? ' native-data-scroll--inset' : ''}`}
            scrollY
            showScrollbar={false}
          >
            <LeaderTable
              rows={data.leaders.assists}
              mode="assists"
              tournamentId={data.tournament.id}
            />
          </NativeRefreshScroll>
        </SwiperItem>
      </Swiper>
    </View>
  )
}
function Groups({ data }: { data: CompetitionDataResponse }) {
  const qualifyingPlaces = cupQualifyingPlaces(data)
  const [detail, setDetail] = useState<StandingRow | null>(null)
  const teams = new Map<string, TeamSummary>()
  data.schedule.forEach((match) => {
    if (match.homeTeam) teams.set(match.homeTeam.id, match.homeTeam)
    if (match.awayTeam) teams.set(match.awayTeam.id, match.awayTeam)
  })
  return (
    <View className="native-data-panel">
      {data.groups.length === 0 && <Text className="native-note">小组积分尚未发布</Text>}
      {data.groups.map((group) => (
        <View className="native-group" key={group.id}>
          <View className="native-group__title">
            <Text>{group.name}</Text>
            <Text className="native-group__count">{group.standings.length} 支球队</Text>
          </View>
          <View className="native-standing native-standing--head">
            <Text>#</Text>
            <Text>球队</Text>
            <Text>场</Text>
            <Text>胜</Text>
            <Text>平</Text>
            <Text>负</Text>
            <Text>净</Text>
            <Text>分</Text>
          </View>
          {group.standings.map((row, index) => (
            <Button
              hoverClass="native-press"
              hoverStartTime={0}
              hoverStayTime={60}
              key={row.teamId}
              className={`native-standing${index < qualifyingPlaces ? ' native-standing--qualified' : ''}`}
              onClick={() => setDetail(row)}
            >
              <Text
                className={`native-standing__rank${row.rank === 1 ? ' native-standing__rank--first' : ''}`}
              >
                {row.rank}
              </Text>
              <View className="native-standing__team">
                <TeamCrest team={teams.get(row.teamId) ?? null} interactive={false} size="small" />
                <Text>{row.shortName || row.teamName}</Text>
              </View>
              <Text>{row.played}</Text>
              <Text>{row.won}</Text>
              <Text>{row.drawn}</Text>
              <Text>{row.lost}</Text>
              <Text>{row.goalDifference}</Text>
              <Text className="native-standing__points">{row.points}</Text>
            </Button>
          ))}
        </View>
      ))}
      <Text className="native-note native-data-footnote">
        {qualifyingPlaces === 1 ? '小组第一名晋级' : '小组前两名晋级'} · 胜 3 分，平 1 分
      </Text>
      {detail && (
        <NativeDialog
          title={detail.teamName}
          compact
          onClose={() => setDetail(null)}
          footer={
            <Button
              hoverClass="native-press"
              hoverStartTime={0}
              hoverStayTime={60}
              className="native-button native-button--primary"
              onClick={() => {
                void openTeam(detail.teamId, data.tournament.id)
                setDetail(null)
              }}
            >
              球队档案
            </Button>
          }
        >
          <View className="native-stats-grid">
            {[
              ['排名', detail.rank],
              ['积分', detail.points],
              ['比赛', detail.played],
              ['胜', detail.won],
              ['平', detail.drawn],
              ['负', detail.lost],
              ['进球', detail.goalsFor],
              ['失球', detail.goalsAgainst],
              ['净胜球', detail.goalDifference],
            ].map(([label, value]) => (
              <View key={String(label)}>
                <Text>{value}</Text>
                <Text>{label}</Text>
              </View>
            ))}
          </View>
        </NativeDialog>
      )}
    </View>
  )
}
function LeaderTable({
  rows,
  mode,
  tournamentId,
}: {
  rows: PlayerStats[]
  mode: 'goals' | 'assists'
  tournamentId: string
}) {
  return (
    <View className="native-data-panel">
      <Text className="native-section-title">{mode === 'goals' ? '射手榜' : '助攻榜'}</Text>
      <View className="native-leader native-leader--head">
        <Text>#</Text>
        <Text>球员 / 球队</Text>
        <Text>出场</Text>
        <Text>{mode === 'goals' ? '进球' : '助攻'}</Text>
      </View>
      {rows.length === 0 && (
        <Text className="native-note">暂无{mode === 'goals' ? '进球' : '助攻'}记录</Text>
      )}
      {rows.map((player, index) => (
        <Button
          hoverClass="native-press"
          hoverStartTime={0}
          hoverStayTime={60}
          className="native-leader"
          key={player.id}
          onClick={() => void openPlayer(player.id, tournamentId)}
        >
          <Text className={`native-leader__rank native-leader__rank--${index + 1}`}>
            {index + 1}
          </Text>
          <View>
            <Text className="native-leader__name">{player.displayName}</Text>
            <View className="native-leader__team">
              <TeamCrest team={player.team} interactive={false} size="small" />
              <Text>{player.team?.name ?? '未分配球队'}</Text>
            </View>
          </View>
          <Text>{player.appearances}</Text>
          <Text className="native-leader__value">{player[mode]}</Text>
        </Button>
      ))}
    </View>
  )
}
