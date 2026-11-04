import { useEffect, useRef, useState } from 'react'
import Taro from '@tarojs/taro'
import { productRepository } from '../product/product.repository'
import { readSession } from '../product/session'
import type { MatchCheckin } from '../product/product.types'
import './checkin.h5.scss'
export function WebMatchCheckin({ matchId }: { matchId: string }) {
  const [value, setValue] = useState<MatchCheckin | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('')
  const sequence = useRef(0),
    lock = useRef(false)
  useEffect(() => {
    const ticket = ++sequence.current
    setValue(null)
    setError('')
    void productRepository.getMatchCheckin(matchId).then(
      (next) => {
        if (ticket === sequence.current) setValue(next)
      },
      (issue) => {
        if (ticket === sequence.current)
          setError(issue instanceof Error ? issue.message : '打卡状态读取失败')
      },
    )
    return () => {
      sequence.current++
    }
  }, [matchId])
  const checkIn = async () => {
    if (lock.current || value?.checkedIn) return
    if (!readSession()) {
      void Taro.showToast({ title: '登录后可以打卡', icon: 'none' })
      return
    }
    const ticket = sequence.current
    lock.current = true
    setBusy(true)
    setError('')
    try {
      const next = await productRepository.checkInMatch(matchId)
      if (ticket === sequence.current) setValue(next)
    } catch (issue) {
      if (ticket === sequence.current)
        setError(issue instanceof Error ? issue.message : '打卡未成功，请重试')
    } finally {
      lock.current = false
      if (ticket === sequence.current) setBusy(false)
    }
  }
  return (
    <section className="match-checkin surface">
      <h3>一起见证这场比赛</h3>
      <p>到场支持，留下你的观赛足迹</p>
      <div className="match-checkin__count">
        <strong>{value ? value.count : '—'}</strong> 人已打卡
      </div>
      <button
        type="button"
        className="button button--primary"
        disabled={!value || busy || value.checkedIn}
        onClick={() => void checkIn()}
      >
        {value?.checkedIn ? '✓ 已打卡' : busy ? '正在打卡' : '为这场比赛打卡'}
      </button>
      <p>{value?.checkedIn ? '这一场，有你在场' : '点击打卡，和大家一起为校园足球加油'}</p>
      {error && <p role="alert">{error}</p>}
    </section>
  )
}
