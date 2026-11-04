import { Button, Text, View } from '@tarojs/components'
import type { BaseEventOrig } from '@tarojs/components/types/common'
import Taro from '@tarojs/taro'
import { useCallback, useEffect, useMemo, useState } from 'react'

import { PublicShell } from '../../components/public-shell'
import { DataState } from '../../components/public-ui'
import { MatchStatus, TeamCrest } from '../../components/product-ui'
import {
  filterAndSortSchedule,
  groupScheduleMatches,
  teamDetailUrl,
  type ScheduleDirection,
  type ScheduleFilter,
} from '../../features/competition/competition.logic'
import { formatLongDate, formatTime } from '../../features/product/product.format'
import { loadCompetition, peekCompetition } from '../../features/product/product.repository'
import { useLiveSearchParam } from '../../features/product/route-query'
import { openMatch } from '../../features/product/match-navigation'
import type { CompetitionDataResponse, MatchSummary } from '../../features/product/product.types'

import './index.scss'

type PageState =
  | { phase: 'loading' }
  | { phase: 'failed'; message: string }
  | { phase: 'ready'; data: CompetitionDataResponse }

export default function SchedulePage() {
  const routeTournamentId = useLiveSearchParam('tournamentId')
  const [state, setState] = useState<PageState>(() => {
    const cached = peekCompetition(routeTournamentId)
    return cached ? { phase: 'ready', data: cached } : { phase: 'loading' }
  })
  const [filter, setFilter] = useState<ScheduleFilter>('all')
  const [direction, setDirection] = useState<ScheduleDirection>('asc')

  const load = useCallback(async () => {
    if (!peekCompetition(routeTournamentId)) setState({ phase: 'loading' })
    try {
      setState({ phase: 'ready', data: await loadCompetition(routeTournamentId) })
    } catch (error) {
      setState({
        phase: 'failed',
        message: error instanceof Error ? error.message : '赛程加载失败。',
      })
    }
  }, [routeTournamentId])

  useEffect(() => {
    void load()
  }, [load])

  const tournamentId = state.phase === 'ready' ? state.data.tournament.id : routeTournamentId
  return (
    <PublicShell active="schedule" tournamentId={tournamentId}>
      {state.phase === 'loading' && <DataState kind="loading" title="正在读取完整赛程" />}
      {state.phase === 'failed' && (
        <DataState
          kind="error"
          title="赛程不可用"
          description={state.message}
          onRetry={() => void load()}
        />
      )}
      {state.phase === 'ready' && (
        <ScheduleContent
          data={state.data}
          direction={direction}
          filter={filter}
          onDirectionChange={setDirection}
          onFilterChange={setFilter}
        />
      )}
    </PublicShell>
  )
}

function ScheduleContent({
  data,
  direction,
  filter,
  onDirectionChange,
  onFilterChange,
}: {
  data: CompetitionDataResponse
  direction: ScheduleDirection
  filter: ScheduleFilter
  onDirectionChange: (value: ScheduleDirection) => void
  onFilterChange: (value: ScheduleFilter) => void
}) {
  const groups = useMemo(
    () => groupScheduleMatches(filterAndSortSchedule(data.schedule, filter, direction)),
    [data.schedule, direction, filter],
  )

  return (
    <View>
      <View className="schedule-controls">
        <View className="schedule-controls__context">
          <Text>{data.tournament.name}</Text>
          <Text>{data.schedule.length} 场比赛</Text>
        </View>
        <View className="schedule-controls__actions">
          <View className="schedule-segment" aria-label="比赛状态筛选">
            <FilterButton
              active={filter === 'all'}
              label="全部"
              onClick={() => onFilterChange('all')}
            />
            <FilterButton
              active={filter === 'upcoming'}
              label="未开始"
              onClick={() => onFilterChange('upcoming')}
            />
            <FilterButton
              active={filter === 'finished'}
              label="已结束"
              onClick={() => onFilterChange('finished')}
            />
          </View>
          <View className="schedule-order" aria-label="日期排序">
            <Button
              className={direction === 'asc' ? 'schedule-order__active' : ''}
              onClick={() => onDirectionChange('asc')}
            >
              正序
            </Button>
            <Button
              className={direction === 'desc' ? 'schedule-order__active' : ''}
              onClick={() => onDirectionChange('desc')}
            >
              倒序
            </Button>
          </View>
        </View>
      </View>

      {groups.length === 0 ? (
        <DataState kind="empty" title="当前筛选下没有比赛" />
      ) : (
        <View className="schedule-timeline">
          {groups.map((group) => (
            <View className="schedule-day" key={group.dateKey}>
              <View className="schedule-day__date">
                <Text>{formatLongDate(group.matches[0]?.scheduledStartAt ?? null)}</Text>
                <Text>{group.matches.length} 场</Text>
              </View>
              <View className="schedule-day__matches">
                {group.matches.map((match) => (
                  <ScheduleMatch key={match.id} match={match} />
                ))}
              </View>
            </View>
          ))}
        </View>
      )}
    </View>
  )
}

function FilterButton({
  active,
  label,
  onClick,
}: {
  active: boolean
  label: string
  onClick: () => void
}) {
  return (
    <Button
      className={'schedule-filter-button ' + (active ? 'schedule-filter-button--active' : '')}
      onClick={onClick}
    >
      {label}
    </Button>
  )
}

function ScheduleMatch({ match }: { match: MatchSummary }) {
  const hasScore = match.homeScore !== null && match.awayScore !== null
  const hasPenalty = match.homePenaltyScore !== null || match.awayPenaltyScore !== null
  return (
    <View className="schedule-match" onClick={() => void openMatch(match.id, match.tournamentId)}>
      <View className="schedule-match__head">
        <Text>{match.roundName ?? match.title}</Text>
        <MatchStatus status={match.status} />
      </View>
      <View className="schedule-match__main">
        <ScheduleTeam
          team={match.homeTeam}
          placeholder={match.homePlaceholder ?? '主队待定'}
          tournamentId={match.tournamentId}
        />
        <View className="schedule-match__center">
          <Text className={hasScore ? 'schedule-match__score' : 'schedule-match__kickoff'}>
            {hasScore
              ? `${match.homeScore} : ${match.awayScore}`
              : formatTime(match.scheduledStartAt)}
          </Text>
          <Text>
            {hasPenalty
              ? `点球 ${match.homePenaltyScore ?? 0} : ${match.awayPenaltyScore ?? 0}`
              : hasScore
                ? formatTime(match.scheduledStartAt)
                : '开赛'}
          </Text>
        </View>
        <ScheduleTeam
          away
          team={match.awayTeam}
          placeholder={match.awayPlaceholder ?? '客队待定'}
          tournamentId={match.tournamentId}
        />
      </View>
      <View className="schedule-match__foot">
        <Text>{match.venue?.name ?? '场地待定'}</Text>
        <Text>查看详情</Text>
      </View>
      {match.statusReason && <Text className="schedule-match__reason">{match.statusReason}</Text>}
    </View>
  )
}

function ScheduleTeam({
  team,
  placeholder,
  tournamentId,
  away = false,
}: {
  team: MatchSummary['homeTeam']
  placeholder: string
  tournamentId: string
  away?: boolean
}) {
  const openTeam = (event: BaseEventOrig) => {
    const url = teamDetailUrl(event, team?.id, tournamentId)
    if (url) void Taro.navigateTo({ url })
  }
  return (
    <View
      aria-label={team ? `查看${team.name}` : placeholder}
      className={`schedule-match__team ${away ? 'schedule-match__team--away' : ''} ${team ? 'schedule-match__team--linked' : ''}`}
      onClick={openTeam}
    >
      {!away && <TeamCrest team={team} size="small" />}
      <Text>{team?.name ?? placeholder}</Text>
      {away && <TeamCrest team={team} size="small" />}
    </View>
  )
}
