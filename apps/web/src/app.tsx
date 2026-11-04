import Taro from '@tarojs/taro'
import { useEffect, type PropsWithChildren } from 'react'

import { mountSoftFocus } from './components/public-shell/focus-style'
import { AccountBoundary } from './components/account-boundary'
import { readSession, subscribeToExternalSessionChanges } from './features/product/session'
import { AppOverlays, PublicAppOverlays } from './components/app-overlays'

import './app.scss'
import './app-box-sizing'
import './components/viewport-page'

export default function App({ children }: PropsWithChildren) {
  // Native system cursors site-wide: the PNG cursor skin rendered as a blocky black hand on links.
  useEffect(() => mountSoftFocus(), [])

  useEffect(
    () =>
      subscribeToExternalSessionChanges(() => {
        void Taro.reLaunch({
          url: readSession() ? '/pages/index/index' : '/pages/login/index',
        }).catch(() => {
          void Taro.showToast({ title: '登录状态已变化，请刷新页面', icon: 'none' })
        })
      }),
    [],
  )

  return (
    <AccountBoundary overlays={<AppOverlays />} publicOverlays={<PublicAppOverlays />}>
      {children}
    </AccountBoundary>
  )
}
