import { Button, Text, View } from '@tarojs/components'
import Taro, { getCurrentInstance } from '@tarojs/taro'
import { useCallback, useEffect, useState } from 'react'
import { nativeBack } from './index.weapp'
import { nativeSocialUrl, type NativeSocialRoute } from './social-route.logic.weapp'

export function NativeSocialRedirect({ route }: { route: NativeSocialRoute }) {
  const [error, setError] = useState('')
  const current = getCurrentInstance().router
  const hashAt = current?.path?.indexOf('#') ?? -1
  const url = nativeSocialUrl(
    route,
    current?.params || {},
    hashAt >= 0 ? current!.path.slice(hashAt) : '',
  )
  const open = useCallback(async () => {
    if (!url) {
      setError('链接无效，请返回后重新打开')
      return
    }
    try {
      await Taro.redirectTo({ url })
    } catch {
      setError('页面暂未打开，请重试')
    }
  }, [url])
  useEffect(() => {
    void open()
  }, [open])
  return (
    <View style="padding:64rpx 28rpx;color:#6b7a64;">
      <Text>{error || '正在打开页面…'}</Text>
      {error && (
        <>
          <Button className="native-button" onClick={() => void open()}>
            重试
          </Button>
          <Button className="native-button" onClick={() => void nativeBack()}>
            返回
          </Button>
        </>
      )}
    </View>
  )
}
