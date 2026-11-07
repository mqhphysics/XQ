import Taro, { useDidHide, useDidShow } from '@tarojs/taro'
import { useEffect, useRef, useState } from 'react'
import { readSession } from '../product/session'
import { useStoredSessionUser } from '../product/current-user.weapp'
import { recordNativeMatchInterest } from './focus.repository.weapp'

/** A visible detail held for three seconds is an intentional read, unlike route prefetch. */
export function useNativeMatchInterest(matchId: string, active: boolean) {
  const [shown, setShown] = useState(true)
  const user = useStoredSessionUser()
  const recorded = useRef('')
  useDidShow(() => setShown(true))
  useDidHide(() => setShown(false))
  useEffect(() => {
    const token = readSession()?.accessToken
    const key = `${user?.id}:${matchId}`
    if (!active || !shown || !matchId || !token || recorded.current === key) return
    const timer = setTimeout(() => {
      if (readSession()?.accessToken !== token) return
      void recordNativeMatchInterest(matchId)
        .then(({ accepted }) => {
          if (readSession()?.accessToken !== token) return
          recorded.current = key
          if (accepted) Taro.eventCenter.trigger('xiaoqiu:native-match-interest')
        })
        .catch(() => {})
    }, 3000)
    return () => clearTimeout(timer)
  }, [matchId, active, shown, user?.id, user?.organizationId])
}
