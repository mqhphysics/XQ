import Taro, { useDidShow } from '@tarojs/taro'
import { useEffect, useRef } from 'react'
import { hasPendingNativeEdits } from '../native-navigation/leave-guard.weapp'
import { canDragNativeMain } from '../native-navigation/index.weapp'
import { canPromptNativeUpdate } from './update.logic'

export function useNativeUpdate() {
  const safeToUpdate = () => {
    const pages = Taro.getCurrentPages()
    return canPromptNativeUpdate(pages[pages.length - 1]?.route || '', hasPendingNativeEdits(), canDragNativeMain())
  }
  const ready = useRef(false),
    prompting = useRef(false),
    declined = useRef(false)
  const show = async () => {
    if (
      !ready.current ||
      prompting.current ||
      declined.current ||
      !safeToUpdate()
    )
      return
    prompting.current = true
    try {
      const answer = await Taro.showModal({
        title: '新版本已准备好',
        content: '现在重新打开晓球即可使用新版本。本机已保存的草稿会保留。',
        confirmText: '立即更新',
        cancelText: '稍后',
      })
      if (answer.confirm && safeToUpdate()) Taro.getUpdateManager().applyUpdate()
      else declined.current = true
    } finally {
      prompting.current = false
    }
  }
  useDidShow(() => {
    void show()
  })
  useEffect(() => {
    if (Taro.getEnv() !== Taro.ENV_TYPE.WEAPP) return
    let active = true
    const manager = Taro.getUpdateManager()
    manager.onUpdateReady(() => {
      if (active) {
        ready.current = true
        void show()
      }
    })
    manager.onUpdateFailed(() => {
      if (active) void Taro.showToast({ title: '新版下载暂未完成，稍后重新打开再试', icon: 'none' })
    })
    return () => {
      active = false
    }
  }, [])
}
