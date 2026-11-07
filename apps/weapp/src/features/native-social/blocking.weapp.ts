import Taro from '@tarojs/taro'
import { useEffect, useState } from 'react'
import { messageRepository } from '../messages/repository.weapp'
import { readSession } from '../product/session'
import { resetProductGetCache } from '../product/get-cache'
import { requestNativeLogin } from '../product/login-return.weapp'

export const nativeBlockEvent = 'xiaoqiu:native-blocks-changed'
export interface NativeBlockChange {
  owner: string
  userId: string
  blocked: boolean
}
const blocked = new Map<string, Set<string>>()
const key = () => {
  const user = readSession()?.user
  return user ? `${user.organizationId}:${user.id}` : ''
}
const current = (userId: string) => blocked.get(key())?.has(userId) ?? false
export const isNativeAuthorBlocked = current
Taro.eventCenter.on(nativeBlockEvent, (change: NativeBlockChange) => {
  if (change.owner !== readSession()?.user.id) return
  const users = blocked.get(key()) || new Set<string>()
  if (change.blocked) users.add(change.userId)
  else users.delete(change.userId)
  blocked.set(key(), users)
  resetProductGetCache()
})

export function useNativeBlockedAuthor(userId: string) {
  const [hidden, setHidden] = useState(() => current(userId))
  useEffect(() => {
    setHidden(current(userId))
    const changed = (change: NativeBlockChange) => {
      if (change.owner === readSession()?.user.id && change.userId === userId)
        setHidden(change.blocked)
    }
    Taro.eventCenter.on(nativeBlockEvent, changed)
    return () => {
      Taro.eventCenter.off(nativeBlockEvent, changed)
    }
  }, [userId, key()])
  return hidden
}

export function useNativeBlockUpdates() {
  const [, refresh] = useState(0)
  useEffect(() => {
    const changed = (change: NativeBlockChange) => {
      if (change.owner === readSession()?.user.id) refresh((value) => value + 1)
    }
    Taro.eventCenter.on(nativeBlockEvent, changed)
    return () => {
      Taro.eventCenter.off(nativeBlockEvent, changed)
    }
  }, [])
}

export async function blockNativeUser(userId: string, name: string) {
  const session = readSession()
  if (!session) {
    await requestNativeLogin('登录后可以管理屏蔽')
    return false
  }
  if (userId === session.user.id) return false
  const choice = await Taro.showModal({
    title: `拉黑${name ? `“${name}”` : '这位用户'}？`,
    content:
      '你将不再看到对方的动态和评论，对方也不能给你发私信或评论你的内容。可在消息设置中解除。',
    confirmText: '拉黑',
    confirmColor: '#a74f43',
  })
  if (!choice.confirm) return false
  await messageRepository.block(userId)
  if (session.accessToken !== readSession()?.accessToken) return false
  Taro.eventCenter.trigger(nativeBlockEvent, { owner: session.user.id, userId, blocked: true })
  void Taro.showToast({ title: '已拉黑，可在消息设置中管理', icon: 'none' })
  return true
}
