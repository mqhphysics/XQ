import { Button, Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useCallback, useEffect, useRef, useState } from 'react'
import { productRepository } from '../product/product.repository'
import { readSession } from '../product/session'
import { useNativeRefreshTask } from '../product/native-refresh.weapp'
import type { MatchCheckin } from '../product/product.types'
import './checkin-preview.weapp.scss'

/** The approved design, now backed by server attendance rather than a preview counter. */
export function NativeMatchCheckin({ matchId }: { matchId: string }) {
  const [value, setValue] = useState<MatchCheckin | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('')
  const alive = useRef(true),
    lock = useRef(false),
    sequence = useRef(0)
  const load = useCallback(async () => {
    if (lock.current) return
    const ticket = ++sequence.current
    setLoading(true)
    setError('')
    try {
      const next = await productRepository.getMatchCheckin(matchId)
      if (alive.current && ticket === sequence.current) {
        setValue(next)
        setError('')
      }
    } catch (issue) {
      if (alive.current && ticket === sequence.current)
        setError(issue instanceof Error ? issue.message : '打卡状态读取失败，请重试')
    } finally {
      if (alive.current && ticket === sequence.current) setLoading(false)
    }
  }, [matchId])
  useNativeRefreshTask(load)
  useEffect(() => {
    alive.current = true
    setValue(null)
    void load()
    return () => {
      alive.current = false
      sequence.current++
    }
  }, [load])
  const checkIn = async () => {
    if (lock.current || value?.checkedIn) return
    if (!readSession()) {
      void Taro.showToast({ title: '登录后可以打卡', icon: 'none' })
      return
    }
    lock.current = true
    setBusy(true)
    setError('')
    const ticket = ++sequence.current
    try {
      const next = await productRepository.checkInMatch(matchId)
      if (alive.current && ticket === sequence.current) setValue(next)
    } catch (issue) {
      if (alive.current) setError(issue instanceof Error ? issue.message : '打卡未成功，请重试')
    } finally {
      lock.current = false
      if (alive.current) setBusy(false)
    }
  }
  return (
    <View className="native-checkin-preview">
      <View className="native-checkin-preview__intro">
        <Text>一起见证这场比赛</Text>
        <Text>到场支持，留下你的观赛足迹</Text>
      </View>
      <View className="native-checkin-preview__count">
        <Text>{value ? value.count : '—'}</Text>
        <Text>人已打卡</Text>
      </View>
      <Button
        className={value?.checkedIn ? 'native-checkin-button is-checked' : 'native-checkin-button'}
        loading={busy}
        disabled={busy || !value || value.checkedIn}
        onClick={() => void checkIn()}
      >
        <View className="native-checkin-button__mark">{value?.checkedIn ? '✓' : '+'}</View>
        <Text>
          {value?.checkedIn
            ? '已打卡'
            : busy
              ? '正在打卡'
              : !value
                ? loading
                  ? '正在读取'
                  : '暂时无法打卡'
                : '为这场比赛打卡'}
        </Text>
      </Button>
      <Text className="native-checkin-preview__note">
        {value?.checkedIn ? '这一场，有你在场' : '点击打卡，和大家一起为校园足球加油'}
      </Text>
      {error && (
        <>
          <Text className="native-error">{error}</Text>
          <Button className="native-button" disabled={busy} onClick={() => void load()}>
            重新读取
          </Button>
        </>
      )}
    </View>
  )
}
