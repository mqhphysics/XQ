import { Button, Picker, ScrollView, Switch, Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useEffect, useMemo, useState } from 'react'
import { NativeRefreshScroll } from '../../features/product/native-refresh.weapp'
import { PublicShell } from '../../components/public-shell'
import { DataState } from '../../components/public-ui'
import { NativeDialog } from '../../components/native-ui/index.weapp'
import { NativeMatchRow } from '../../components/native-match-row/index.weapp'
import {
  NativeTournamentSelect,
  useNativeCompetition,
} from '../../components/native-ui/competition.weapp'
import { productRepository } from '../../features/product/product.repository'
import { readSession } from '../../features/product/session'
import { formatDate } from '../../features/product/product.format'
import type {
  CompetitionDataResponse,
  MatchSummary,
  TeamSummary,
} from '../../features/product/product.types'
import {
  emptyScheduleFilter,
  filterNativeSchedule,
  nativeMatchDate,
  nativeMatchStage,
  type NativeScheduleFilter,
} from './native-schedule.logic.weapp'
import './index.weapp.scss'

export default function NativeSchedulePage() {
  const { state, load, tournamentId } = useNativeCompetition()
  return (
    <PublicShell active="schedule" tournamentId={tournamentId}>
      {state.phase === 'loading' && <DataState kind="loading" title="正在读取赛程" />}
      {state.phase === 'failed' && (
        <DataState
          kind="error"
          title="赛程暂不可用"
          description={state.message}
          onRetry={() => void load()}
        />
      )}
      {state.phase === 'ready' && (
        <ScheduleContent
          key={state.data.tournament.id}
          data={state.data}
          onTournament={(id) => void load(id)}
        />
      )}
    </PublicShell>
  )
}
function ScheduleContent({
  data,
  onTournament,
}: {
  data: CompetitionDataResponse
  onTournament: (id: string) => void
}) {
  const [filter, setFilter] = useState(emptyScheduleFilter)
  const [draft, setDraft] = useState(emptyScheduleFilter)
  const [filterOpen, setFilterOpen] = useState(false)
  const [progress, setProgress] = useState(false)
  const [primary, setPrimary] = useState<TeamSummary | null>(null)
  useEffect(() => {
    let current = true
    if (readSession())
      void productRepository
        .getTeamPreferences(data.tournament.id)
        .then((value) => {
          if (current) setPrimary(value.primaryTeam)
        })
        .catch(() => {})
    return () => {
      current = false
    }
  }, [data.tournament.id])
  const matches = useMemo(
    () => filterNativeSchedule(data.schedule, filter, primary?.id),
    [data.schedule, filter, primary?.id],
  )
  const groups = useMemo(() => {
    const result = new Map<string, MatchSummary[]>()
    matches.forEach((match) => {
      const date = nativeMatchDate(match.scheduledStartAt)
      result.set(date, [...(result.get(date) ?? []), match])
    })
    return [...result.entries()]
  }, [matches])
  const dates = [
    ...new Set(
      data.schedule
        .map((match) => nativeMatchDate(match.scheduledStartAt))
        .filter((date) => date !== 'TBD'),
    ),
  ].sort()
  const teams = new Map<string, TeamSummary>()
  data.schedule.forEach((match) => {
    if (match.homeTeam) teams.set(match.homeTeam.id, match.homeTeam)
    if (match.awayTeam) teams.set(match.awayTeam.id, match.awayTeam)
  })
  const stages = [...new Set(data.schedule.map(nativeMatchStage))]
  const count =
    Number(Boolean(filter.team)) +
    Number(Boolean(filter.stage)) +
    Number(filter.status !== 'all') +
    Number(filter.primaryOnly) +
    Number(filter.descending)
  return (
    <View className="native-schedule">
      <View className="native-page-top">
        <Text className="native-page-title">赛程</Text>
        <View className="native-schedule-controls">
          <Button
            className={`native-schedule-filter${count ? ' is-active' : ''}`}
            aria-label="筛选赛程"
            onClick={() => {
              setDraft(filter)
              setFilterOpen(true)
            }}
          >
            <View className="native-schedule-filter__icon" />
            {count > 0 && <Text className="native-schedule-filter__count">{count}</Text>}
          </Button>
          <NativeTournamentSelect data={data} onSelect={onTournament} />
        </View>
      </View>
      <ScrollView
        className="native-date-rail"
        onTouchStart={(event) => event.stopPropagation()}
        onTouchMove={(event) => event.stopPropagation()}
        onTouchEnd={(event) => event.stopPropagation()}
        scrollX
        showScrollbar={false}
        enhanced
        scrollIntoView={filter.date ? `native-date-${filter.date}` : 'native-date-all'}
        scrollWithAnimation
      >
        <View className="native-date-rail__items">
          <Button
            id="native-date-all"
            className={!filter.date ? 'is-active' : ''}
            onClick={() => setFilter((value) => ({ ...value, date: '' }))}
          >
            <Text>全部</Text>
            <Text>日期</Text>
          </Button>
          {dates.map((date) => (
            <Button
              id={`native-date-${date}`}
              key={date}
              className={filter.date === date ? 'is-active' : ''}
              onClick={() => setFilter((value) => ({ ...value, date }))}
            >
              <Text>{date.slice(5).replace('-', '/')}</Text>
              <Text>{formatDate(`${date}T12:00:00+08:00`).slice(-2)}</Text>
            </Button>
          ))}
        </View>
      </ScrollView>
      <View className="native-schedule-summary">
        <Text>
          {`${filter.date ? filter.date.slice(5).replace('-', '/') : '全部日期'} · ${matches.length} 场比赛`}
        </Text>
        <Button className="native-button native-button--quiet" onClick={() => setProgress(true)}>
          赛事进度 ›
        </Button>
      </View>
      <NativeRefreshScroll className="native-schedule-list" scrollY showScrollbar={false} enhanced>
        {groups.length ? (
          groups.map(([date, items]) => (
            <View className="native-schedule-day" key={date}>
              <View className="native-schedule-day__title">
                <Text>
                  {date === 'TBD' ? '日期待定' : formatDate(items[0]?.scheduledStartAt ?? null)}
                </Text>
                <Text>{items.length} 场</Text>
              </View>
              {items.map((match) => (
                <NativeMatchRow key={match.id} match={match} />
              ))}
            </View>
          ))
        ) : (
          <DataState kind="empty" title="没有符合条件的比赛" />
        )}
      </NativeRefreshScroll>
      {filterOpen && (
        <NativeDialog
          title="筛选赛程"
          compact
          onClose={() => setFilterOpen(false)}
          footer={
            <>
              <Button
                className="native-button"
                onClick={() => setDraft({ ...emptyScheduleFilter, date: filter.date })}
              >
                重置
              </Button>
              <Button
                className="native-button native-button--primary"
                onClick={() => {
                  setFilter(draft)
                  setFilterOpen(false)
                }}
              >
                应用筛选
              </Button>
            </>
          }
        >
          <SelectRow
            label="球队"
            value={draft.team}
            options={[
              { value: '', label: '全部球队' },
              ...[...teams.values()].map((team) => ({ value: team.id, label: team.name })),
            ]}
            onChange={(team) => setDraft((value) => ({ ...value, team }))}
          />
          <SelectRow
            label="比赛阶段"
            value={draft.stage}
            options={[
              { value: '', label: '全部阶段' },
              ...stages.map((stage) => ({
                value: stage,
                label: stage === 'GROUP' ? '小组赛' : stage === 'KNOCKOUT' ? '淘汰赛' : stage,
              })),
            ]}
            onChange={(stage) => setDraft((value) => ({ ...value, stage }))}
          />
          <SelectRow
            label="比赛状态"
            value={draft.status}
            options={[
              { value: 'all', label: '全部状态' },
              { value: 'upcoming', label: '未开始' },
              { value: 'live', label: '进行中' },
              { value: 'finished', label: '已结束' },
            ]}
            onChange={(status) =>
              setDraft((value) => ({ ...value, status: status as NativeScheduleFilter['status'] }))
            }
          />
          <SelectRow
            label="日期排序"
            value={draft.descending ? 'desc' : 'asc'}
            options={[
              { value: 'asc', label: '正序' },
              { value: 'desc', label: '倒序' },
            ]}
            onChange={(order) => setDraft((value) => ({ ...value, descending: order === 'desc' }))}
          />
          <View className="native-select-row">
            <View>
              <Text>只看我的主队</Text>
              <Text className="native-note">{primary?.name ?? '登录并选择主队后可用'}</Text>
            </View>
            <Switch
              color="#376b45"
              checked={draft.primaryOnly}
              onChange={(event) => {
                if (event.detail.value && !primary) {
                  void Taro.showToast({ title: '请先登录并选择主队', icon: 'none' })
                  return
                }
                setDraft((value) => ({ ...value, primaryOnly: event.detail.value }))
              }}
            />
          </View>
        </NativeDialog>
      )}
      {progress && (
        <NativeDialog title="赛事进度" compact onClose={() => setProgress(false)}>
          {data.bracket.map((round) => (
            <View className="native-select-row" key={round.id}>
              <Text>{round.name}</Text>
              <Text>
                {
                  round.matches.filter((match) => ['FINISHED', 'CONFIRMED'].includes(match.status))
                    .length
                }{' '}
                / {round.matches.length} 场完成
              </Text>
            </View>
          ))}
        </NativeDialog>
      )}
    </View>
  )
}
function SelectRow({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: string
  options: Array<{ value: string; label: string }>
  onChange: (value: string) => void
}) {
  const index = Math.max(
    0,
    options.findIndex((item) => item.value === value),
  )
  return (
    <View className="native-select-row">
      <Text>{label}</Text>
      <Picker
        mode="selector"
        range={options}
        rangeKey="label"
        value={index}
        onChange={(event) => onChange(options[Number(event.detail.value)]?.value ?? '')}
      >
        <View className="native-select">
          <Text>{options[index]?.label}</Text>
          <View className="native-select__chevron" />
        </View>
      </Picker>
    </View>
  )
}
