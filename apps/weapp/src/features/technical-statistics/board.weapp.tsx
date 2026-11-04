import { Button, Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useContext, useEffect, useRef, useState } from 'react'
import { NativeDialog } from '../../components/native-ui/index.weapp'
import { NativePlayerPortrait } from '../../components/native-ui/match-lineups.weapp'
import { readSession } from '../product/session'
import { nativeBack } from '../native-navigation/index.weapp'
import {
  NativeDetailEntryContext,
  nativeDetailScrollLockEvent,
} from '../native-navigation/detail-context.weapp'
import { useNativePreferences } from '../../components/native-ui/preferences.weapp'
import type { useTechnicalRecorder } from './use-recorder.weapp'
import {
  technicalId,
  technicalState,
  technicalTotals,
  type TechnicalMetric,
  type TechnicalOutcome,
} from './repository.weapp'
import {
  recentRecords,
  recorderGeometry,
  recorderModeOf,
  recorderRows,
  recorderTeamState,
  resolveRecorderLineup,
  substitute,
  type RecorderLineup,
  type RecorderMode,
} from './board.logic.weapp'
import { NativeLineupSort } from './lineup-sort.weapp'
import './board.weapp.scss'

type Recorder = ReturnType<typeof useTechnicalRecorder>
/** Mock palette: 犯规 warm, failures muted grey, cards gold/red, 进球 solid green. */
const keyTone = (button: { outcome: TechnicalOutcome; tone?: string }) =>
  button.outcome === 'GOAL'
    ? 'goal'
    : button.outcome === 'FOUL'
      ? 'warm'
      : button.tone === 'warm'
        ? 'muted'
        : button.tone || 'green'
const read = (key: string): unknown => {
  try {
    return Taro.getStorageSync(key)
  } catch {
    return null
  }
}
const write = (key: string, value: unknown) => {
  try {
    Taro.setStorageSync(key, value)
  } catch {
    void Taro.showToast({ title: '设置暂未保存', icon: 'none' })
  }
}
export function NativeTechnicalBoard({
  recorder,
  onMode,
}: {
  recorder: Recorder
  onMode: (mode: 'live' | 'summary') => void
}) {
  const { workspace, error, busy, unsynced } = recorder
  const user = readSession()?.user,
    owner = `${user?.organizationId}:${user?.id}`,
    modeKey = `xiaoqiu:recorder-mode:${owner}`
  const [side, setSide] = useState(0),
    [playerId, setPlayerId] = useState<string | null>(null),
    [lineups, setLineups] = useState<Record<string, RecorderLineup>>({}),
    [sorting, setSorting] = useState(false),
    [swapping, setSwapping] = useState<string | null>(null),
    [mode, setMode] = useState<RecorderMode>(() => recorderModeOf(read(modeKey))),
    [pulse, setPulse] = useState<{ id: number; key: string } | null>(null)
  const [available, setAvailable] = useState(() => Taro.getWindowInfo().windowHeight - 110)
  const sequence = useRef(0),
    { reduceMotion } = useNativePreferences()
  const team = workspace!.teams[side] || workspace!.teams[0]!,
    key = `xiaoqiu:recorder-lineup:v2:${owner}:${workspace!.matchId}:${team.id}`
  useEffect(() => {
    let active = true
    /* Inside the detail layer the board sits below Taro's custom-component boundary, where a
       page-scoped query finds nothing; `>>>` from the page-level host reaches it. */
    const measure = () =>
      Taro.nextTick(() =>
        Taro.createSelectorQuery()
          .select('.native-record-board')
          .boundingClientRect()
          .selectAll('.native-detail-host >>> .native-record-board')
          .boundingClientRect()
          .exec((result: unknown[]) => {
            if (!active) return
            type Rect = { top: number; width: number } | null
            const rect = [result?.[0] as Rect, ...((result?.[1] as Rect[] | null) ?? [])].find(
                (item) => !!item?.width,
              ),
              window = Taro.getWindowInfo()
            const safe = Math.max(
              0,
              window.screenHeight - (window.safeArea?.bottom ?? window.screenHeight),
            )
            if (rect?.width) setAvailable(window.windowHeight - rect.top - safe - 6)
          }),
      )
    measure()
    Taro.onWindowResize(measure)
    return () => {
      active = false
      Taro.offWindowResize(measure)
    }
  }, [])
  /* The board is sized to the screen; lock the detail layer's scroll/bounce/pull-to-refresh. */
  const entry = useContext(NativeDetailEntryContext)
  useEffect(() => {
    if (!entry) return
    Taro.eventCenter.trigger(nativeDetailScrollLockEvent, entry.id, true)
    return () => {
      Taro.eventCenter.trigger(nativeDetailScrollLockEvent, entry.id, false)
    }
  }, [entry])
  const lineup = resolveRecorderLineup(team.players, lineups[key] ?? read(key)),
    byId = new Map(team.players.map((player) => [player.id, player])),
    onPitch = lineup.pitch.map((id) => byId.get(id)!).filter(Boolean)
  const saveLineup = (next: RecorderLineup) => {
    setLineups((value) => ({ ...value, [key]: next }))
    write(key, next)
  }
  const switchMode = (next: RecorderMode) => {
    if (next === mode) return
    setMode(next)
    write(modeKey, next)
  }
  const geometry = recorderGeometry(available, mode),
    rows = recorderRows(mode),
    totals = technicalTotals(workspace!.operations, team.id, playerId),
    state = technicalState(workspace!.operations),
    recent = recentRecords(state.active, workspace!.teams)
  const count = (metric: TechnicalMetric, outcome: TechnicalOutcome) => {
    if (
      recorder.append({
        id: technicalId(),
        occurredAt: new Date().toISOString(),
        kind: 'COUNT',
        teamId: team.id,
        playerId,
        metric,
        outcome,
      })
    )
      setPulse({ id: ++sequence.current, key: metric + outcome })
  }
  const outgoing = swapping ? byId.get(swapping) : undefined
  return (
    <View
      className={`native-record-board native-record-board--rows is-${mode}${reduceMotion ? ' is-reduced' : ''}`}
      style={`height:${geometry.height}px;--record-row:${geometry.rowHeight}px;`}
      aria-label="现场记录"
    >
      <View className="native-record-toolbar">
        <Button
          className="native-record-back"
          aria-label="返回比赛"
          onClick={() => void nativeBack()}
        >
          <View className="native-page-back__icon" />
        </Button>
        <View className="native-record-teams">
          {workspace!.teams.map((item, index) => (
            <Button
              key={item.id}
              className={`native-record-team is-${recorderTeamState(index, side, playerId)}`}
              aria-pressed={index === side && !playerId}
              onClick={() => {
                setSide(index)
                setPlayerId(null)
              }}
            >
              {item.name || item.shortName}
            </Button>
          ))}
        </View>
        <Button
          className="native-record-menu"
          aria-label="球员排序与记录方式"
          onClick={() => setSorting(true)}
        >
          <View />
          <View />
          <View />
        </Button>
      </View>
      <View className="native-record-players">
        {onPitch.length ? (
          onPitch.map((player) => (
            <View
              key={player.id}
              id={'record-player-' + player.id}
              className={`native-record-player${playerId === player.id ? ' is-active' : ''}`}
              role="button"
              aria-pressed={playerId === player.id}
              aria-label={`${player.shirtNumber || ''}号 ${player.displayName}，长按换人`}
              hoverClass="is-pressed"
              hoverStartTime={0}
              hoverStayTime={60}
              onClick={() => setPlayerId(player.id)}
              onLongPress={() => {
                void Taro.vibrateShort({ type: 'medium' }).catch(() => {})
                setSwapping(player.id)
              }}
            >
              <View className="native-record-player__face">
                <NativePlayerPortrait
                  player={player}
                  color={playerId === player.id ? '#1f6b45' : '#3d6f55'}
                />
              </View>
              <Text className="native-record-player__number">{player.shirtNumber || '—'}</Text>
              <Text className="native-record-player__name">{player.displayName}</Text>
            </View>
          ))
        ) : (
          <Text className="native-record-players__empty">暂无球员，记录将计入全队</Text>
        )}
      </View>
      <View className="native-record-recent" aria-label="最近 3 条记录">
        {recent.length ? (
          recent.map((item, index) => (
            <Text key={item.id} className={index ? '' : 'is-latest'}>
              {item.text}
            </Text>
          ))
        ) : (
          <Text className="is-empty">暂无记录 · 点选球员后点按下方按钮</Text>
        )}
      </View>
      <View className="native-record-board__rows">
        {rows.map((row) => (
          <View className="native-record-row" key={row.metric}>
            <Text className="native-record-row__label">
              {row.metric === 'CHANCE' ? '机会' : row.label}
            </Text>
            <View className="native-record-row__keys">
              {row.buttons.map((button) => (
                <View
                  key={button.outcome}
                  className={`native-record-key ${keyTone(button)}`}
                  role="button"
                  aria-label={`${row.label}${button.label}，当前${totals[button.field]}次`}
                  aria-disabled={!workspace!.canRecord}
                  hoverClass={workspace!.canRecord ? 'is-pressed' : 'none'}
                  hoverStartTime={0}
                  hoverStayTime={70}
                  onClick={() => {
                    if (workspace!.canRecord) count(row.metric, button.outcome)
                  }}
                >
                  <Text className="native-record-key__label">{button.label}</Text>
                  <Text className="native-record-key__count">{totals[button.field]}</Text>
                  {pulse?.key === row.metric + button.outcome && (
                    <View key={pulse.id} className="native-record-key__pulse" />
                  )}
                </View>
              ))}
            </View>
          </View>
        ))}
      </View>
      <View className="native-record-footer">
        <Button
          className={`native-record-status${error ? ' is-error' : ''}`}
          disabled={busy || (!error && !unsynced && workspace!.canRecord)}
          onClick={() => {
            if (!workspace!.canRecord)
              void Taro.showToast({ title: workspace!.reason || '当前仅可查看', icon: 'none' })
            else void recorder.sync()
          }}
        >
          <View className={`native-record-status__dot${unsynced ? ' is-pending' : ''}`} />
          <Text>
            {!workspace!.canRecord
              ? '只读'
              : error
                ? '同步失败 · 重试'
                : busy
                  ? '同步中'
                  : unsynced
                    ? `${unsynced}笔待同步`
                    : '已同步'}
          </Text>
        </Button>
        <View className="native-record-mode" role="radiogroup" aria-label="记录项目">
          {(['lite', 'full'] as const).map((value) => (
            <View
              key={value}
              className={`native-record-mode__item${mode === value ? ' is-active' : ''}`}
              role="radio"
              aria-checked={mode === value}
              onClick={() => switchMode(value)}
            >
              {value === 'lite' ? '精简' : '完整'}
            </View>
          ))}
        </View>
        <Button
          className="native-record-undo"
          disabled={!workspace!.canRecord || !state.undoTarget}
          onClick={() => {
            if (state.undoTarget)
              recorder.append({
                id: technicalId(),
                occurredAt: new Date().toISOString(),
                kind: 'UNDO',
                targetId: state.undoTarget,
              })
          }}
        >
          ↶ 撤回
        </Button>
      </View>
      {outgoing && (
        <NativeDialog title={`换下 ${outgoing.displayName}`} onClose={() => setSwapping(null)}>
          {lineup.bench.length ? (
            <View className="native-record-swap">
              {lineup.bench.map((id) => {
                const player = byId.get(id)
                if (!player) return null
                return (
                  <View
                    key={id}
                    className="native-record-swap__item"
                    role="button"
                    hoverClass="is-pressed"
                    onClick={() => {
                      saveLineup(substitute(lineup, outgoing.id, id))
                      if (playerId === outgoing.id) setPlayerId(id)
                      setSwapping(null)
                    }}
                  >
                    <View className="native-record-player__face">
                      <NativePlayerPortrait player={player} color="#3d6f55" />
                    </View>
                    <Text className="native-record-player__number">
                      {player.shirtNumber || '—'}
                    </Text>
                    <Text className="native-record-player__name">{player.displayName}</Text>
                  </View>
                )
              })}
            </View>
          ) : (
            <Text className="native-record-swap__empty">没有替补球员</Text>
          )}
        </NativeDialog>
      )}
      {sorting && (
        <NativeDialog title="球员排序" compact={false} onClose={() => setSorting(false)}>
          <View className="native-record-modes" role="tablist" aria-label="切换记录方式">
            {/* The board itself is 单项记录, so it is the selected segment here. */}
            <View role="tab" className="native-record-modes__item is-active" aria-selected>
              单项记录
            </View>
            <View
              role="tab"
              className="native-record-modes__item"
              aria-selected={false}
              onClick={() => onMode('summary')}
            >
              填写汇总
            </View>
          </View>
          <NativeLineupSort players={team.players} lineup={lineup} onChange={saveLineup} />
        </NativeDialog>
      )}
    </View>
  )
}
