import Taro, { getCurrentInstance } from '@tarojs/taro'
import { useEffect } from 'react'
import { DataState } from '../public-ui'
import type { NativeSection } from '../../features/native-navigation/history.logic.weapp'
export function NativeTabRedirect({ section }: { section: NativeSection }) {
  useEffect(() => {
    const params = getCurrentInstance().router?.params || {}
    const query = Object.entries(params)
      .filter(([key, value]) => key !== 'section' && typeof value === 'string')
      .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
      .join('&')
    void Taro.reLaunch({ url: `/pages/index/index?section=${section}${query ? `&${query}` : ''}` })
  }, [section])
  return <DataState kind="loading" title="正在打开页面" />
}
