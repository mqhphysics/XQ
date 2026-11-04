import { Button, Picker, ScrollView, Switch, Text, View } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { useNativePanelVisible } from '../../components/native-navigation/panel-context.weapp'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNativeRefreshTask } from '../../features/product/native-refresh.weapp'
import { campusRepository } from '../../features/campus/campus.repository.h5'
import { realTournaments } from '../../features/product/competition-scope.weapp'
import { nativeFocusLabel } from '../index/home-display.logic.weapp'
import { switchNativeSection } from '../../features/native-navigation/index.weapp'
import { NativeRefreshScroll } from '../../features/product/native-refresh.weapp'
import { PublicShell } from '../../components/public-shell'
import { DataState } from '../../components/public-ui'
import { NativeDialog } from '../../components/native-ui/index.weapp'
import { NativeMatchRow } from '../../components/native-match-row/index.weapp'
import { TeamCrest } from '../../components/product-ui'
import { WideScheduleRow } from './wide-row.weapp'
import { useNativeViewport } from '../../features/native-navigation/viewport.weapp'
import { nativeWideWindow } from '../../features/native-navigation/viewport.logic.weapp'
import { openTeam } from '../../features/product/team-navigation.weapp'
import { productRepository } from '../../features/product/product.repository'
import { readSession } from '../../features/product/session'
import { formatDate, formatTime } from '../../features/product/product.format'
import type { CompetitionDataResponse, TeamSummary } from '../../features/product/product.types'
import {
  emptyScheduleFilter,
  filterNativeSchedule,
  nativeMatchDate,
  nativeRelativeDay,
  nativeMatchStage,
  nativeScheduleDayGroups,
  type NativeScheduleFilter,
} from './native-schedule.logic.weapp'
import './index.weapp.scss'

type ScheduleData = CompetitionDataResponse & { labels: Record<string, string> }
export default function NativeSchedulePage() {
  const [scope, setScope] = useState('all'),
    [state, setState] = useState<{ data: ScheduleData | null; error: string; loading: boolean }>({
      data: null,
      error: '',
      loading: true,
    }),
    [options, setOptions] = useState<Array<{ id: string; name: string }>>([])
  const sequence = useRef(0)
  const load = useCallback(async () => {
    const ticket = ++sequence.current
    try {
      const catalog = await campusRepository.catalog(),
        available = realTournaments(catalog)
      if (ticket !== sequence.current) return
      setOptions(available.map((t) => ({ id: t.id, name: t.name })))
      const chosen = scope === 'all' ? available : available.filter((t) => t.id === scope)
      if (!chosen.length) throw Error('暂无已发布的正式赛事')
      const datasets = await Promise.all(
        chosen.map((t) => productRepository.getCompetitionData(t.id)),
      )
      const labels: Record<string, string> = {}
      const schedule = datasets.flatMap((dataset, index) =>
        dataset.schedule.map((match) => {
          const tournament = chosen[index]!,
            competition = catalog.competitions.find(
              (c) => c.id === tournament.competitionDefinitionId,
            )
          labels[match.id] = nativeFocusLabel(
            {
              ...match,
              focusCupName: competition?.cupName || '',
              focusGender: competition?.gender || '',
            },
            tournament.name,
          ).replace(/小组([A-Z])/, '$1组')
          return match
        }),
      )
      if (ticket !== sequence.current) return
      setState({ data: { ...datasets[0]!, schedule, labels }, error: '', loading: false })
    } catch (error) {
      if (ticket === sequence.current)
        setState((old) => ({
          ...old,
          error: error instanceof Error ? error.message : '赛程读取失败',
          loading: false,
        }))
    }
  }, [scope])
  useNativeRefreshTask(load)
  useEffect(() => {
    void load()
    return () => {
      sequence.current++
    }
  }, [load])
  return (
    <PublicShell active="schedule">
      {state.loading && !state.data && <DataState kind="loading" title="正在读取所有赛程" />}
      {state.error && (
        <DataState kind="error" title="赛程暂不可用" description={state.error} onRetry={load} />
      )}
      {state.data && (
        <ScheduleContent
          key={scope}
          data={state.data}
          scope={scope}
          options={options}
          onTournament={setScope}
        />
      )}
    </PublicShell>
  )
}
function ScheduleContent({
  data,
  scope,
  options,
  onTournament,
}: {
  data: ScheduleData
  scope: string
  options: Array<{ id: string; name: string }>
  onTournament: (id: string) => void
}) {
  const [filter, setFilter] = useState(emptyScheduleFilter)
  const visible = useNativePanelVisible()
  const [today, setToday] = useState(() => nativeMatchDate(new Date().toISOString()))
  const [listTarget, setListTarget] = useState('')
  const [listHeight, setListHeight] = useState(0)
  const jumpToDay = (date: string) => {
    setListTarget('')
    Taro.nextTick(() => setListTarget(`native-schedule-day-${date}`))
  }
  useDidShow(() => setToday(nativeMatchDate(new Date().toISOString())))
  useEffect(() => {
    if (visible) {
      setFilter((current) => ({ ...current, date: '' }))
      setListTarget('')
      Taro.nextTick(() =>
        Taro.createSelectorQuery()
          .select('.native-schedule-list')
          .boundingClientRect((rect) => {
            const height = (rect as { height?: number })?.height
            if (height) setListHeight(Math.ceil(height))
          })
          .exec(() => jumpToDay(today)),
      )
    }
  }, [visible, today, data.tournament.id])
  const [draft, setDraft] = useState(emptyScheduleFilter)
  const [filterOpen, setFilterOpen] = useState(false)
  const [selectOpen, setSelectOpen] = useState(false)
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
  const wide = nativeWideWindow(useNativeViewport())
  const matches = useMemo(
    () => filterNativeSchedule(data.schedule, filter, primary?.id),
    [data.schedule, filter, primary?.id],
  )
  const groups = useMemo(
    () => nativeScheduleDayGroups(matches, filter, today),
    [matches, filter, today],
  )
  const dates = [
    ...new Set([
      today,
      ...data.schedule
        .map((match) => nativeMatchDate(match.scheduledStartAt))
        .filter((date) => date !== 'TBD'),
    ]),
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
  const openProgress = () => {
    void switchNativeSection('data', undefined, 1).then(() =>
      Taro.nextTick(() => Taro.eventCenter.trigger('xiaoqiu:data:standings')),
    )
  }
  return (
    <View className={`native-schedule${wide ? ' native-schedule--wide' : ''}`}>
      <View className="native-page-top">
        <Text className="native-page-title">赛程</Text>
        <View className="native-schedule-controls" id="native-guide-schedule-controls">
          <Button
            className={`native-schedule-filter${count ? ' is-active' : ''}`}
            aria-label="筛选赛程"
            onClick={() => {
              setDraft(filter)
              setFilterOpen(true)
            }}
          >
            <View className="native-schedule-filter__icon" />
            {wide && <Text className="native-schedule-filter__label">筛选</Text>}
            {count > 0 && <Text className="native-schedule-filter__count">{count}</Text>}
          </Button>
          {wide && (
            <Button className="native-schedule-bracket" onClick={openProgress}>
              <View className="native-schedule-bracket__icon" />
              <Text>对阵图</Text>
            </Button>
          )}
          <Button className="native-select" onClick={() => setSelectOpen(true)}>
            <Text>
              {scope === 'all' ? '所有赛事' : options.find((o) => o.id === scope)?.name || '赛事'}
            </Text>
            <View className="native-select__chevron" />
          </Button>
        </View>
      </View>
      <ScrollView
        id="native-guide-schedule-dates"
        className="native-date-rail"
        onTouchStart={(event) => event.stopPropagation()}
        onTouchMove={(event) => event.stopPropagation()}
        onTouchEnd={(event) => event.stopPropagation()}
        scrollX
        showScrollbar={false}
        enhanced
        scrollIntoView={`native-date-${filter.date || today}`}
        scrollWithAnimation
      >
        <View className="native-date-rail__items">
          <Button
            id="native-date-all"
            className={!filter.date ? 'is-active' : ''}
            onClick={() => {
              setFilter((value) => ({ ...value, date: '' }))
              jumpToDay(today)
            }}
          >
            <Text>全部</Text>
            <Text>日期</Text>
          </Button>
          {dates.map((date) => (
            <Button
              id={`native-date-${date}`}
              key={date}
              className={`${filter.date === date ? 'is-active' : ''}${date === today ? ' is-today' : ''}`}
              onClick={() => {
                setFilter((value) => ({ ...value, date }))
                jumpToDay(date)
              }}
            >
              <Text>{date.slice(5).replace('-', '/')}</Text>
              <Text>
                {nativeRelativeDay(date, today) || formatDate(`${date}T12:00:00+08:00`).slice(-2)}
              </Text>
            </Button>
          ))}
        </View>
      </ScrollView>
      <View className="native-schedule-summary" id="native-guide-schedule-summary">
        <Text>
          {`${filter.date ? filter.date.slice(5).replace('-', '/') : '全部日期'} · ${matches.length} 场比赛`}
        </Text>
        <Button
          className="native-button native-button--quiet"
          onClick={openProgress}
        >
          赛事进度 ›
        </Button>
      </View>
      <NativeRefreshScroll
        id="native-guide-schedule-list"
        className="native-schedule-list"
        scrollIntoView={listTarget}
        scrollY
        showScrollbar={false}
        enhanced
      >
        {groups.length ? (
          groups.map(([date, items]) => (
            <View
              className="native-schedule-day"
              id={`native-schedule-day-${date}`}
              key={date}
              style={
                date === groups[groups.length - 1]?.[0] && listHeight
                  ? `min-height:${listHeight}px;`
                  : ''
              }
            >
              <View className="native-schedule-day__title">
                <Text>
                  {date === 'TBD'
                    ? '日期待定'
                    : `${nativeRelativeDay(date, today) ? nativeRelativeDay(date, today) + ' · ' : ''}${formatDate(`${date}T12:00:00+08:00`)}`}
                </Text>
                <Text>{items.length} 场</Text>
              </View>
              {!items.length && (
                <View className="native-schedule-day__empty">
                  <Text>今天暂无{count ? '符合筛选的' : ''}比赛</Text>
                  <Text>可以上下查看其他日期</Text>
                </View>
              )}
              {items.map((match) =>
                wide ? (
                  <WideScheduleRow
                    key={match.id}
                    match={match}
                    competitionLabel={data.labels[match.id]}
                  />
                ) : (
                  <NativeMatchRow
                    key={match.id}
                    match={match}
                    competitionLabel={data.labels[match.id]}
                  />
                ),
              )}
            </View>
          ))
        ) : (
          <DataState kind="empty" title="没有符合条件的比赛" />
        )}
      </NativeRefreshScroll>
      {wide && (
        <WideScheduleAside
          primary={primary}
          schedule={data.schedule}
          tournamentId={data.tournament.id}
          today={today}
        />
      )}
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
                  jumpToDay(draft.date || today)
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
      {selectOpen && (
        <NativeDialog title="选择赛程" onClose={() => setSelectOpen(false)}>
          {[{ id: 'all', name: '所有赛事' }, ...options].map((option) => (
            <Button
              key={option.id}
              className={
                scope === option.id
                  ? 'native-tournament-option is-selected'
                  : 'native-tournament-option'
              }
              onClick={() => {
                setSelectOpen(false)
                onTournament(option.id)
              }}
            >
              {option.name}
              {scope === option.id ? ' ✓' : ''}
            </Button>
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

/** Wide windows only: the website's right column (我的主队 + 赛事进程). */
function WideScheduleAside({
  primary,
  schedule,
  tournamentId,
  today,
}: {
  primary: TeamSummary | null
  schedule: ScheduleData['schedule']
  tournamentId: string
  today: string
}) {
  const next = primary
    ? schedule
        .filter(
          (match) =>
            (match.homeTeam?.id === primary.id || match.awayTeam?.id === primary.id) &&
            !['FINISHED', 'CONFIRMED', 'CANCELLED', 'ABANDONED'].includes(match.status) &&
            nativeMatchDate(match.scheduledStartAt) >= today,
        )
        .sort((a, b) => String(a.scheduledStartAt).localeCompare(String(b.scheduledStartAt)))[0]
    : undefined
  const knockout = schedule.filter((match) => nativeMatchStage(match) === 'KNOCKOUT').length
  return (
    <View className="native-schedule-aside">
      <View className="native-schedule-aside__card">
        <View className="native-schedule-aside__head">
          <Text className="native-schedule-aside__title">我的主队</Text>
          {primary && (
            <Text
              className="native-schedule-aside__link"
              onClick={() => void openTeam(primary.id, tournamentId)}
            >
              查看球队主页 →
            </Text>
          )}
        </View>
        {primary ? (
          <View className="native-schedule-aside__team">
            <View className="native-schedule-aside__crest">
              <TeamCrest team={primary} size="medium" interactive={false} />
            </View>
            <View className="native-schedule-aside__copy">
              <Text className="native-schedule-aside__name">{primary.name}</Text>
              <Text className="native-schedule-aside__note">为每一场热爱而战</Text>
            </View>
          </View>
        ) : (
          <Text className="native-schedule-aside__empty">登录并选择主队后，这里会显示下一场比赛。</Text>
        )}
        {next && (
          <View className="native-schedule-aside__next">
            <Text className="native-schedule-aside__label">下一场比赛</Text>
            <Text className="native-schedule-aside__meta">
              {next.scheduledStartAt
                ? `${formatDate(next.scheduledStartAt)} · ${formatTime(next.scheduledStartAt)}`
                : '时间待定'}
            </Text>
            <Text className="native-schedule-aside__vs">
              {`${next.homeTeam?.shortName || next.homeTeam?.name || '待定'}  VS  ${next.awayTeam?.shortName || next.awayTeam?.name || '待定'}`}
            </Text>
            {next.venue && <Text className="native-schedule-aside__meta">{next.venue.name}</Text>}
          </View>
        )}
      </View>
      <View className="native-schedule-aside__card">
        <View className="native-schedule-aside__head">
          <Text className="native-schedule-aside__title">赛事进程</Text>
          <Text
            className="native-schedule-aside__link"
            onClick={() => {
              void switchNativeSection('data', undefined, 1).then(() =>
                Taro.nextTick(() => Taro.eventCenter.trigger('xiaoqiu:data:standings')),
              )
            }}
          >
            查看完整赛程 →
          </Text>
        </View>
        <Text className="native-schedule-aside__empty">
          {knockout ? `淘汰赛共 ${knockout} 场` : '暂无淘汰赛安排'}
        </Text>
      </View>
    </View>
  )
}
