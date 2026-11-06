import Taro from '@tarojs/taro'
import { readSession } from './session'
export const profileEntryEvent = 'xiaoqiu:profile-entry'
let pending: { panel: 'reports' | 'manageIdentity' | 'adminReports'; token: string } | null = null
export function queueProfileEntry(url: string) {
  const panel = /[?&]panel=([^&]+)/.exec(url)?.[1]
  const token = readSession()?.accessToken
  if (!token || !['reports', 'identity', 'adminReports'].includes(panel || '')) return
  pending = {
    panel:
      panel === 'identity'
        ? 'manageIdentity'
        : panel === 'adminReports'
          ? 'adminReports'
          : 'reports',
    token,
  }
  Taro.eventCenter.trigger(profileEntryEvent)
}
export function takeProfileEntry() {
  const item = pending
  pending = null
  return item?.token === readSession()?.accessToken ? item?.panel : undefined
}
