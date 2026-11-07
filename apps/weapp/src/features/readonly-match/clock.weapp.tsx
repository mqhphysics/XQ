import { Button, Text, View } from '@tarojs/components'
import Taro, { useDidHide, useDidShow } from '@tarojs/taro'
import { useCallback, useContext, useEffect, useRef, useState } from 'react'
import { NativeDetailActiveContext } from '../native-navigation/detail-context.weapp'
import { useNativePanelVisible } from '../../components/native-navigation/panel-context.weapp'
import { readSession } from '../product/session'
import { leagueDate, leagueTime } from '../product/league-time'
import { matchClockRepository } from './clock.repository.weapp'
import { clockDigits, projectMatchClock, type MatchClockSnapshot } from './clock.logic.weapp'

const phaseLabels = {
  PENDING: '待确认开赛',
  FIRST_HALF: '上半场',
  HALF_TIME: '中场剩余',
  SECOND_HALF: '下半场',
  FINISHED: '比赛结束',
  UNAVAILABLE: '未开启计时',
}
const actionId = () =>
  'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    const value = Math.floor(Math.random() * 16)
    return (char === 'x' ? value : (value & 3) | 8).toString(16)
  })
const actualTime = (value: string) =>
  `${leagueTime(value)}:${String(leagueDate(value)?.getUTCSeconds() ?? 0).padStart(2, '0')}`
export function NativeMatchClock({
  matchId,
  initial,
  allowStart = false,
  compact = false,
  onChanged,
}: {
  matchId: string
  initial?: MatchClockSnapshot | null | undefined
  allowStart?: boolean
  compact?: boolean
  onChanged?: ((clock: MatchClockSnapshot) => void) | undefined
}) {
  const active = useContext(NativeDetailActiveContext),
    panelVisible = useNativePanelVisible()
  const [visible, setVisible] = useState(true)
  useDidHide(() => setVisible(false))
  useDidShow(() => setVisible(true))
  const [clock, setClock] = useState<MatchClockSnapshot | null>(initial || null),
    [receivedAt, setReceivedAt] = useState(Date.now),
    [now, setNow] = useState(Date.now)
  const [error, setError] = useState(''),
    [busy, setBusy] = useState(false)
  const sequence = useRef(0),
    alive = useRef(true),
    lock = useRef(false),
    attempt = useRef(''),
    changedCallback = useRef(onChanged)
  changedCallback.current = onChanged
  const publish = (value: MatchClockSnapshot, notify = false) => {
    setClock(value)
    setReceivedAt(Date.now())
    setNow(Date.now())
    setError('')
    if (notify) changedCallback.current?.(value)
  }
  const load = useCallback(async () => {
    if (!matchId || lock.current) return
    const ticket = ++sequence.current,
      token = readSession()?.accessToken
    try {
      const value = await matchClockRepository.load(matchId)
      if (alive.current && ticket === sequence.current && token === readSession()?.accessToken)
        publish(value, true)
    } catch (reason) {
      if (alive.current && ticket === sequence.current)
        setError(reason instanceof Error ? reason.message : '计时暂未刷新')
    }
  }, [matchId])
  useEffect(() => {
    alive.current = true
    attempt.current = ''
    setClock(initial || null)
    setReceivedAt(Date.now())
    return () => {
      alive.current = false
      sequence.current++
    }
  }, [matchId])
  useEffect(() => {
    if (!active || !panelVisible || !visible) return
    void load()
    const timer = setInterval(() => void load(), 15000)
    const changed = (event: { matchId: string; clock: MatchClockSnapshot }) => {
      if (event.matchId === matchId) {
        sequence.current++
        publish(event.clock)
      }
    }
    Taro.eventCenter.on('xiaoqiu:native-match-clock', changed)
    return () => {
      clearInterval(timer)
      sequence.current++
      Taro.eventCenter.off('xiaoqiu:native-match-clock', changed)
    }
  }, [active, panelVisible, visible, load, matchId])
  useEffect(() => {
    if (
      !active ||
      !panelVisible ||
      !visible ||
      !clock?.startedAt ||
      clock.phase === 'FINISHED' ||
      clock.phase === 'UNAVAILABLE'
    )
      return
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [active, panelVisible, visible, clock?.startedAt, clock?.phase])
  const start = async () => {
    if (!clock?.canStart || !allowStart || lock.current) return
    const token = readSession()?.accessToken
    if (!token) {
      setError('请先登录后确认开赛')
      return
    }
    lock.current = true
    setBusy(true)
    sequence.current++
    if (!attempt.current) attempt.current = actionId()
    try {
      const value = await matchClockRepository.start(matchId, attempt.current)
      if (!alive.current || token !== readSession()?.accessToken) return
      publish(value, true)
      Taro.eventCenter.trigger('xiaoqiu:native-match-clock', { matchId, clock: value })
    } catch (reason) {
      if (alive.current)
        setError(reason instanceof Error ? reason.message : '开赛时间未确认，请重试')
    } finally {
      lock.current = false
      if (alive.current) setBusy(false)
    }
  }
  const projected = clock ? projectMatchClock(clock, now - receivedAt) : null
  const running =
    projected && ['FIRST_HALF', 'HALF_TIME', 'SECOND_HALF', 'FINISHED'].includes(projected.phase)
  const displaySeconds =
    projected?.phase === 'HALF_TIME'
      ? Math.max(0, (clock?.intervalMinutes || 0) * 60 - projected.phaseElapsedSeconds)
      : projected?.elapsedSeconds || 0
  return (
    <View className={`native-match-clock${compact ? ' native-match-clock--compact' : ''}`}>
      <View className="native-match-clock__copy">
        <View className="native-match-clock__main">
          <Text>
            {projected ? phaseLabels[projected.phase] : error ? '计时暂不可用' : '正在读取计时'}
          </Text>
          {running && <Text>{clockDigits(displaySeconds)}</Text>}
        </View>
        {clock && (
          <Text className="native-match-clock__source">
            {compact && error
              ? '计时未刷新'
              : clock.startedAt
                ? clock.startSource === 'MANUAL'
                  ? `实际开球 ${actualTime(clock.startedAt)}`
                  : `默认开球 ${leagueTime(clock.startedAt)}`
                : clock.scheduledStartAt
                  ? `计划 ${leagueTime(clock.scheduledStartAt)}`
                  : '开球时间待定'}
          </Text>
        )}
        {!compact && clock?.phase === 'PENDING' && clock.autoStartsAt && (
          <Text className="native-match-clock__note">
            无人确认时，{leagueTime(clock.autoStartsAt)} 启用默认计时
          </Text>
        )}
        {error && (!compact || !clock) && (
          <Text className="native-match-clock__error">{compact ? '计时未刷新' : error}</Text>
        )}
      </View>
      {allowStart && clock?.canStart && (
        <Button
          className="native-match-clock__start"
          disabled={busy}
          loading={busy}
          onClick={() => void start()}
        >
          <View className="native-match-clock__play" />
          <Text>比赛开始</Text>
        </Button>
      )}
      {error && !clock && (
        <Button className="native-match-clock__retry" onClick={() => void load()}>
          重试
        </Button>
      )}
    </View>
  )
}
