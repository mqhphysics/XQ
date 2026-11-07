import Taro from '@tarojs/taro'
import { readNativeHistory } from '../native-navigation/index.weapp'
import { safeLoginReturn } from './login-return.logic'
import { nativeTabPaths } from '../native-navigation/history.logic.weapp'
const key = 'xiaoqiu.login-return.v1'
let opening = false
export async function requestNativeLogin(message = '登录后可以继续这项操作') {
  if (opening) return
  opening = true
  try {
    if (
      !(await Taro.showModal({ title: '登录晓球', content: message, confirmText: '去登录' }))
        .confirm
    )
      return
    const history = readNativeHistory(),
      route = Taro.getCurrentInstance().router
    const path = route?.path || '/pages/index/index'
    const normalized = '/' + path.replace(/^\/+/, '').split('?')[0]
    const query = Object.entries(route?.params || {})
      .filter(([, value]) => value !== undefined)
      .map(([name, value]) => `${encodeURIComponent(name)}=${encodeURIComponent(value!)}`)
      .join('&')
    const target =
      (Object.values(nativeTabPaths).includes(normalized)
        ? history.entries[history.cursor]?.url
        : undefined) || normalized + (query ? '?' + query : '')
    Taro.setStorageSync(key, { url: safeLoginReturn(target), at: Date.now() })
    await Taro.reLaunch({ url: '/pages/login/index' })
  } finally {
    opening = false
  }
}
export async function resumeNativeLogin() {
  const saved = Taro.getStorageSync<{ url?: string; at?: number }>(key)
  Taro.removeStorageSync(key)
  const url =
    saved &&
    typeof saved.at === 'number' &&
    Date.now() - saved.at >= 0 &&
    Date.now() - saved.at < 600000
      ? safeLoginReturn(saved.url || '')
      : '/pages/index/index'
  await Taro.reLaunch({ url })
}
