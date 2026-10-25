import { Button, Text, View } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { useCallback, useEffect, useRef, useState } from 'react'
import { NativeDialog } from '../native-ui/index.weapp'
import { campusRepository } from '../../features/campus/campus.repository.h5'
import { readSession } from '../../features/product/session'
import { WELCOME_COPY } from './welcome.logic.h5'

const completedHere = new Set<string>()
export function NativeCampusWelcome() {
  const user = readSession()?.user
  const identity = user ? `${user.organizationId}:${user.id}` : ''
  const storageKey = `xiaoqiu:weapp:welcome:v1:${identity}`
  const serverNeedsCompletion = useRef(false)
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const load = useCallback(async () => {
    if (!identity || completedHere.has(identity) || Taro.getStorageSync(storageKey) === true) return
    try {
      const profile = await campusRepository.me()
      const current = readSession()?.user
      if (`${current?.organizationId}:${current?.id}` !== identity) return
      serverNeedsCompletion.current = !profile.onboardingCompletedAt
      setOpen(true)
    } catch {
      /* Home remains usable when the welcome state cannot be read. */
    }
  }, [identity, storageKey])
  useEffect(() => {
    void load()
  }, [load])
  useDidShow(() => {
    void load()
  })
  const dismiss = async () => {
    if (busy) return
    const current = readSession()?.user
    if (`${current?.organizationId}:${current?.id}` !== identity) {
      setOpen(false)
      return
    }
    setBusy(true)
    try {
      if (serverNeedsCompletion.current) await campusRepository.onboarding('TUTORIAL_COMPLETE')
      Taro.setStorageSync(storageKey, true)
      completedHere.add(identity)
      setOpen(false)
    } catch {
      setError('暂时无法保存首次浏览状态，请重试')
    } finally {
      setBusy(false)
    }
  }
  if (!open) return null
  return (
    <NativeDialog
      title={WELCOME_COPY.title}
      compact={false}
      busy={busy}
      onClose={() => void dismiss()}
      footer={
        <Button
          className="native-button native-button--primary"
          loading={busy}
          onClick={() => void dismiss()}
        >
          开始浏览
        </Button>
      }
    >
      <Text className="native-welcome-intro">{WELCOME_COPY.subtitle}</Text>
      <View className="native-welcome-items">
        <Text>在「赛程」「数据」查看比赛时间、比分与积分，切换不同赛事和赛季。</Text>
        <Text>{WELCOME_COPY.bullets[1]!.text}</Text>
        <Text>在「绿茵动态」浏览球场照片和校园故事，点击动态查看完整内容。</Text>
        <Text>网站与小程序共用你的账号、球队、比赛和公告信息。</Text>
      </View>
      <Text className="native-note">{WELCOME_COPY.footer}</Text>
      {error && <Text className="native-error">{error}</Text>}
    </NativeDialog>
  )
}
