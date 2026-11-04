import { Button, Text, View } from '@tarojs/components'
import { useCallback, useEffect, useMemo, useState } from 'react'

import { PublicShell } from '../../components/public-shell'
import { DataState } from '../../components/public-ui'
import { MatchStatus, ProductSection, TeamCrest, UserAvatar } from '../../components/product-ui'
import { createBracketLayout } from '../../features/competition/competition.logic'
import { formatDate, formatTime } from '../../features/product/product.format'
import {
  loadCompetition,
  peekCompetition,
  productRepository,
} from '../../features/product/product.repository'
import { useLiveSearchParam } from '../../features/product/route-query'
import { openPlayer } from '../../features/product/player-navigation'
import { openMatch } from '../../features/product/match-navigation'
import { PersonTrigger } from '../../components/person-trigger'
import type {
  CompetitionDataResponse,
  PlayerStats,
  StandingRow,
} from '../../features/product/product.types'

import './index.scss'

type ViewMode = 'overview' | 'standings' | 'bracket' | 'leaders'
type PageState =
  | { phase: 'loading' }
  | { phase: 'failed'; message: string }
  | { phase: 'ready'; data: CompetitionDataResponse }

const views: Array<{ key: ViewMode; label: string }> = [
  { key: 'overview', label: '概览' },
  { key: 'standings', label: '积分榜' },
  { key: 'bracket', label: '淘汰赛' },
  { key: 'leaders', label: '球员榜' },
]

export default function DataCenterPage() {
  const routeTournamentId = useLiveSearchParam('tournamentId')
  const [state, setState] = useState<PageState>(() => {
    const cached = peekCompetition(routeTournamentId)
    return cached ? { phase: 'ready', data: cached } : { phase: 'loading' }
  })
  const [mode, setMode] = useState<ViewMode>('overview')
  const [leaderMode, setLeaderMode] = useState<'scorers' | 'assists'>('scorers')

  const load = useCallback(
    async (requestedId?: string) => {
      const explicit = requestedId || routeTournamentId
      if (!peekCompetition(explicit)) setState({ phase: 'loading' })
      try {
        setState({
          phase: 'ready',
          data: explicit
            ? await productRepository.getCompetitionData(explicit)
            : await loadCompetition(),
        })
      } catch (error) {
        setState({
          phase: 'failed',
          message: error instanceof Error ? error.message : '赛事数据加载失败。',
        })
      }
    },
    [routeTournamentId],
  )

  useEffect(() => {
    void load()
  }, [load])

  const tournamentId = state.phase === 'ready' ? state.data.tournament.id : routeTournamentId
  return (
    <PublicShell active="data" tournamentId={tournamentId}>
      {state.phase === 'loading' && <DataState kind="loading" title="正在计算赛事数据" />}
      {state.phase === 'failed' && (
        <DataState
          kind="error"
          title="赛事数据不可用"
          description={state.message}
          onRetry={() => void load()}
        />
      )}
      {state.phase === 'ready' && (
        <View>
          <View className="data-hero">
            <View>
              <Text className="data-hero__eyebrow">COMPETITION DATA</Text>
              <Text className="data-hero__title">{state.data.tournament.name}</Text>
              <Text className="data-hero__subtitle">{state.data.tournament.seasonName}</Text>
            </View>
            <View className="season-switcher">
              <Text className="season-switcher__label">赛季</Text>
              <View className="season-switcher__buttons">
                {state.data.seasons.map((season) => (
                  <Button
                    className={
                      'season-button ' +
                      (season.tournamentId === state.data.tournament.id
                        ? 'season-button--active'
                        : '')
                    }
                    key={season.tournamentId}
                    onClick={() => void load(season.tournamentId)}
                  >
                    {season.year}
                  </Button>
                ))}
              </View>
            </View>
          </View>

          <View className="data-view-tabs">
            {views.map((view) => (
              <Button
                className={'data-view-tab ' + (mode === view.key ? 'data-view-tab--active' : '')}
                key={view.key}
                onClick={() => setMode(view.key)}
              >
                {view.label}
              </Button>
            ))}
          </View>

          <View className="data-context-note">
            <Text>胜 3 分 · 平 1 分 · 同分优先比较净胜球</Text>
            <Text>数据更新于 {formatDataTimestamp(state.data.updatedAt)}</Text>
          </View>

          {mode === 'overview' && (
            <Overview
              data={state.data}
              onGoBracket={() => setMode('bracket')}
              onGoLeaders={() => setMode('leaders')}
              onGoStandings={() => setMode('standings')}
            />
          )}
          {mode === 'standings' && <Standings groups={state.data.groups} />}
          {mode === 'bracket' && <Bracket data={state.data} />}
          {mode === 'leaders' && (
            <Leaders
              active={leaderMode}
              assists={state.data.leaders.assists}
              scorers={state.data.leaders.scorers}
              tournamentId={state.data.tournament.id}
              onChange={setLeaderMode}
            />
          )}
        </View>
      )}
    </PublicShell>
  )
}

function Overview({
  data,
  onGoBracket,
  onGoLeaders,
  onGoStandings,
}: {
  data: CompetitionDataResponse
  onGoBracket: () => void
  onGoLeaders: () => void
  onGoStandings: () => void
}) {
  const finished = data.schedule.filter((match) =>
    ['FINISHED', 'CONFIRMED'].includes(match.status),
  ).length
  const live = data.schedule.filter((match) => match.status === 'LIVE').length
  const teams = new Set(
    data.schedule.flatMap((match) => [match.homeTeam?.id, match.awayTeam?.id]).filter(Boolean),
  ).size
  return (
    <View>
      <View className="data-kpi-grid">
        <Kpi value={teams} label="参赛球队" />
        <Kpi value={data.schedule.length} label="全部比赛" />
        <Kpi value={finished} label="已结束" />
        <Kpi value={live} label="正在进行" live />
      </View>

      <View className="data-overview-grid">
        <View className="data-overview-block">
          <ProductSection kicker="GROUP STAGE" title="小组形势" note="积分优先" />
          {data.groups.length === 0 ? (
            <View className="compact-empty">本赛季采用淘汰赛赛制</View>
          ) : (
            <View className="surface overview-standings">
              {data.groups.map((group) => (
                <View className="overview-group" key={group.id}>
                  <Text className="overview-group__name">{group.name}</Text>
                  {group.standings.slice(0, 3).map((row) => (
                    <View className="overview-group__row" key={row.teamId}>
                      <Text>{row.rank}</Text>
                      <Text>{row.teamName}</Text>
                      <Text>{row.points} 分</Text>
                    </View>
                  ))}
                </View>
              ))}
              <Button className="data-more-button" onClick={onGoStandings}>
                查看完整积分榜
              </Button>
            </View>
          )}
        </View>

        <View className="data-overview-block">
          <ProductSection kicker="LEADERS" title="射手领跑" note="进球数" />
          <View className="surface overview-leaders">
            {data.leaders.scorers.slice(0, 5).map((player, index) => (
              <View className="overview-leader" key={player.id}>
                <Text className="overview-leader__rank">{index + 1}</Text>
                <UserAvatar
                  name={player.displayName}
                  playerId={player.id}
                  tournamentId={data.tournament.id}
                  size="small"
                />
                <View className="overview-leader__copy">
                  <PersonTrigger
                    playerId={player.id}
                    tournamentId={data.tournament.id}
                    name={player.displayName}
                  >
                    <Text>{player.displayName}</Text>
                  </PersonTrigger>
                  <Text>{player.team?.name ?? '暂无球队'}</Text>
                </View>
                <Text className="overview-leader__value">{player.goals}</Text>
              </View>
            ))}
            <Button className="data-more-button" onClick={onGoLeaders}>
              查看球员榜
            </Button>
          </View>
        </View>
      </View>

      {data.bracket.length > 0 && (
        <View className="data-overview-bracket">
          <ProductSection
            kicker="KNOCKOUT"
            title="淘汰赛进程"
            note={data.bracket.length + ' 个轮次'}
          />
          <View className="overview-bracket-rounds">
            {data.bracket.map((round) => (
              <View className="overview-bracket-round" key={round.id}>
                <Text>{round.name}</Text>
                <Text>{round.matches.length} 场</Text>
              </View>
            ))}
            <Button className="data-more-button data-more-button--inline" onClick={onGoBracket}>
              展开对阵
            </Button>
          </View>
        </View>
      )}
    </View>
  )
}

function Kpi({ value, label, live = false }: { value: number; label: string; live?: boolean }) {
  return (
    <View className={'data-kpi ' + (live ? 'data-kpi--live' : '')}>
      <Text className="data-kpi__value">{value}</Text>
      <Text className="data-kpi__label">{label}</Text>
    </View>
  )
}

function Standings({ groups }: { groups: CompetitionDataResponse['groups'] }) {
  if (groups.length === 0) {
    return (
      <DataState kind="empty" title="本赛季没有小组积分榜" description="该赛季采用淘汰赛赛制。" />
    )
  }
  return (
    <View className="standings-page">
      <ProductSection kicker="GROUP TABLES" title="小组赛积分榜" note="胜 3 分 · 平 1 分" />
      <View className="standings-grid">
        {groups.map((group) => (
          <View className="standing-table surface" key={group.id}>
            <Text className="standing-table__title">{group.name}</Text>
            <View className="standing-table__head">
              <Text>排名</Text>
              <Text>球队</Text>
              <Text>赛</Text>
              <Text>净胜</Text>
              <Text>积分</Text>
            </View>
            {group.standings.map((row) => (
              <StandingTableRow key={row.teamId} row={row} />
            ))}
          </View>
        ))}
      </View>
    </View>
  )
}

function StandingTableRow({ row }: { row: StandingRow }) {
  return (
    <View
      className={'standing-table__row ' + (row.rank <= 2 ? 'standing-table__row--qualifying' : '')}
    >
      <Text>{row.rank}</Text>
      <View className="standing-table__team">
        <Text
          className="standing-table__color"
          style={{ backgroundColor: row.primaryColor ?? '#758079' }}
        />
        <Text>{row.teamName}</Text>
      </View>
      <Text>{row.played}</Text>
      <Text>
        {row.goalDifference > 0 ? '+' : ''}
        {row.goalDifference}
      </Text>
      <Text className="standing-table__points">{row.points}</Text>
    </View>
  )
}

function Bracket({ data }: { data: CompetitionDataResponse }) {
  const layout = useMemo(() => createBracketLayout(data.bracket), [data.bracket])
  const matches = useMemo(
    () => new Map(data.bracket.flatMap((round) => round.matches).map((match) => [match.id, match])),
    [data.bracket],
  )
  if (data.bracket.length === 0) {
    return (
      <DataState kind="empty" title="暂无淘汰赛对阵" description="晋级席位确认后将在这里显示。" />
    )
  }
  const openingRound = data.bracket[0]
  const openingTeams =
    openingRound?.matches.filter((match) => !match.matchCode.includes('THIRD')).length ?? 0
  return (
    <View className="bracket-page">
      <ProductSection
        kicker="BRACKET"
        title="淘汰赛晋级树"
        note={`${openingTeams} 场首轮 · 三四名赛独立支线`}
      />
      <View className="bracket-scroll">
        <View
          className="bracket-canvas"
          style={{ width: `${layout.width}px`, height: `${layout.height}px` }}
        >
          {layout.rounds.map((round) => (
            <Text
              className="bracket-round__title"
              key={round.id}
              style={{ left: `${round.x}px`, width: `${round.width}px` }}
            >
              {round.name}
            </Text>
          ))}
          {layout.connectors.map((connector) => (
            <View
              className={`bracket-connector bracket-connector--${connector.orientation}`}
              key={connector.id}
              style={{
                left: `${connector.x}px`,
                top: `${connector.y}px`,
                width: `${connector.width}px`,
                height: `${connector.height}px`,
              }}
            />
          ))}
          {layout.nodes.map((node) => {
            const match = matches.get(node.matchId)
            if (!match) return null
            return (
              <View
                className={`bracket-match-slot ${node.placement ? 'bracket-match-slot--third' : ''}`}
                key={node.id}
                style={{
                  left: `${node.x}px`,
                  top: `${node.y}px`,
                  width: `${node.width}px`,
                  height: `${node.height}px`,
                }}
              >
                {node.placement && (
                  <Text className="bracket-match__label">三四名赛 · 独立支线</Text>
                )}
                <View
                  className="bracket-match"
                  onClick={() => void openMatch(match.id, match.tournamentId)}
                >
                  <View className="bracket-match__meta">
                    <Text>
                      {formatDate(match.scheduledStartAt)} {formatTime(match.scheduledStartAt)}
                    </Text>
                    <MatchStatus status={match.status} />
                  </View>
                  <BracketTeam
                    team={match.homeTeam}
                    placeholder={match.homePlaceholder}
                    score={match.homeScore}
                  />
                  <BracketTeam
                    team={match.awayTeam}
                    placeholder={match.awayPlaceholder}
                    score={match.awayScore}
                  />
                </View>
              </View>
            )
          })}
        </View>
      </View>
    </View>
  )
}

function BracketTeam({
  team,
  placeholder: _placeholder,
  score,
}: {
  team: CompetitionDataResponse['schedule'][number]['homeTeam']
  placeholder: string | null | undefined
  score: number | null
}) {
  return (
    <View className="bracket-match__team">
      <TeamCrest team={team} size="small" />
      <Text>{team?.name ?? '待定'}</Text>
      <Text>{score ?? '-'}</Text>
    </View>
  )
}

function Leaders({
  active,
  assists,
  scorers,
  tournamentId,
  onChange,
}: {
  active: 'scorers' | 'assists'
  assists: PlayerStats[]
  scorers: PlayerStats[]
  tournamentId: string
  onChange: (value: 'scorers' | 'assists') => void
}) {
  const rows = active === 'scorers' ? scorers : assists
  const [showAll, setShowAll] = useState(false)
  const [listKey, setListKey] = useState(active)
  if (listKey !== active) {
    setListKey(active)
    setShowAll(false)
  }
  const visible = showAll ? rows : rows.slice(0, 8)
  return (
    <View className="leaders-page">
      <View className="leaders-heading">
        <ProductSection kicker="PLAYER RANKING" title="个人数据榜" note="公开比赛数据" />
        <View className="leader-toggle">
          <Button
            className={active === 'scorers' ? 'leader-toggle__active' : ''}
            onClick={() => onChange('scorers')}
          >
            射手榜
          </Button>
          <Button
            className={active === 'assists' ? 'leader-toggle__active' : ''}
            onClick={() => onChange('assists')}
          >
            助攻榜
          </Button>
        </View>
      </View>
      {rows.length === 0 ? (
        <DataState
          kind="empty"
          title={active === 'scorers' ? '暂无射手数据' : '暂无助攻数据'}
          description="已结束比赛产生统计后将在这里显示。"
        />
      ) : (
        <View className={'leader-table surface' + (showAll ? ' leader-table--scroll' : '')}>
          <View className="leader-table__head">
            <Text>排名</Text>
            <Text>球员</Text>
            <Text>球队</Text>
            <Text>出场</Text>
            <Text>{active === 'scorers' ? '进球' : '助攻'}</Text>
          </View>
          {visible.map((player, index) => (
            <View
              className="leader-table__row"
              key={player.id}
              onClick={() => void openPlayer(player.id, tournamentId)}
            >
              <Text className="leader-table__rank">{index + 1}</Text>
              <View className="leader-table__player">
                <UserAvatar
                  name={player.displayName}
                  playerId={player.id}
                  tournamentId={tournamentId}
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
              <Text>{player.team?.shortName ?? '-'}</Text>
              <Text>{player.appearances}</Text>
              <Text className="leader-table__value">
                {active === 'scorers' ? player.goals : player.assists}
              </Text>
            </View>
          ))}
        </View>
      )}
      {!showAll && rows.length > 8 && (
        <Button className="leader-more" onClick={() => setShowAll(true)}>
          查看更多
        </Button>
      )}
    </View>
  )
}

function formatDataTimestamp(value: string): string {
  return `${formatDate(value).split('周')[0]} ${formatTime(value)}`
}
