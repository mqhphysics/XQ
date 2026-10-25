import Taro from '@tarojs/taro'
import { nativeTabPaths } from '../native-navigation/history.logic.weapp'
import {
  openNativeDetail,
  readNativeHistory,
  stepNativeDetail,
} from '../native-navigation/index.weapp'
import { nativeWriteEnabled } from './config.weapp'
import { readSession } from '../product/session'

export async function openNativeComposer(
  options: {
    tournamentId?: string | undefined
    teamId?: string | undefined
    quotePostId?: string | undefined
  } = {},
) {
  if (!nativeWriteEnabled('publishPosts')) return
  if (!readSession()) {
    await Taro.showToast({ title: '登录后可以发布动态', icon: 'none' })
    return
  }
  const query = Object.entries(options)
    .filter(([, value]) => Boolean(value))
    .map(([key, value]) => `${key}=${encodeURIComponent(value!)}`)
    .join('&')
  await openNativeDetail(`/pages/compose/index${query ? `?${query}` : ''}`)
}
export async function finishNativeSocialPage() {
  await Taro.hideKeyboard().catch(() => {})
  const pages = Taro.getCurrentPages(),
    current = pages[pages.length - 1]
  if (
    Object.values(nativeTabPaths).includes(`/${current?.route}`) &&
    readNativeHistory().cursor >= 0
  )
    await stepNativeDetail(-1)
  else if (pages.length > 1) await Taro.navigateBack()
  else await Taro.reLaunch({ url: '/pages/index/index' })
}
