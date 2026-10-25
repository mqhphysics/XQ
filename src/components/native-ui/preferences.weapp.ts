import Taro from '@tarojs/taro'
import { useEffect, useState } from 'react'
import { readSession } from '../../features/product/session'
import type { NativePreferences } from './preferences'
import './preferences.weapp.scss'

export const defaultNativePreferences: NativePreferences = {
  reduceMotion: false,
  largeText: false,
  autoplayGif: false,
}
const event = 'xiaoqiu:native-preferences'
function key() {
  const user = readSession()?.user
  return `xiaoqiu:weapp:preferences:v1:${user?.organizationId || 'public'}:${user?.id || 'visitor'}`
}
export function readNativePreferences(): NativePreferences {
  const value = Taro.getStorageSync(key()) as Partial<NativePreferences> | undefined
  return {
    reduceMotion: value?.reduceMotion === true,
    largeText: value?.largeText === true,
    autoplayGif: value?.autoplayGif === true,
  }
}
export function saveNativePreferences(value: NativePreferences) {
  Taro.setStorageSync(key(), value)
  Taro.eventCenter.trigger(event)
}
export function useNativePreferences(): NativePreferences {
  const [value, setValue] = useState(readNativePreferences)
  useEffect(() => {
    const update = () => setValue(readNativePreferences())
    Taro.eventCenter.on(event, update)
    return () => {
      Taro.eventCenter.off(event, update)
    }
  }, [])
  return value
}
