import Taro from '@tarojs/taro'
import { useEffect, type PropsWithChildren } from 'react'

import { mountSoftFocus } from './components/public-shell/focus-style'
import { AccountBoundary } from './components/account-boundary'
import { readSession, subscribeToExternalSessionChanges } from './features/product/session'
import { AppOverlays, PublicAppOverlays } from './components/app-overlays'
import { useNativeUpdate } from './features/product/update.weapp'

import './app.scss'
import './components/native-loading/index.weapp.scss'
import './features/product/native-refresh.weapp.scss'
import './components/native-navigation/content-pager.weapp.scss'
// Shared native social primitives have one stylesheet owner across embedded and physical pages.
import './components/native-social/social.weapp.scss'
import './features/technical-statistics/entry.weapp.scss'
import './features/readonly-match/clock.weapp.scss'
import './app-box-sizing'
import './components/viewport-page'

export default function App({ children }: PropsWithChildren) {
  useNativeUpdate()
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
