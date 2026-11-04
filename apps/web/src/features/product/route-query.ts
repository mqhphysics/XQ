import { getCurrentInstance, useDidShow } from '@tarojs/taro'
import { useState } from 'react'

/** Tab pages stay mounted, so the route query is read again whenever the page is shown. */
export function useLiveSearchParam(name: string): string {
  const read = () => {
    const value = getCurrentInstance().router?.params?.[name]
    return typeof value === 'string' ? value : ''
  }
  const [value, setValue] = useState(read)
  useDidShow(() => {
    const next = read()
    setValue((current) => (current === next ? current : next))
  })
  return value
}
