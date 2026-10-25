import Taro from '@tarojs/taro'
import { useContext, useEffect, useRef } from 'react'
import { NativeDetailActiveContext } from './detail-context.weapp'
type Guard = {
  dirty: () => boolean
  busy: () => boolean
  discard: () => void
  retainOnDetailOpen: () => boolean
}
const guards = new Set<Guard>()
const layers: Array<() => Promise<boolean>> = []
export async function confirmNativeDiscard(dirty: boolean, busy = false) {
  if (busy) {
    void Taro.showToast({ title: '正在保存，请稍候', icon: 'none' })
    return false
  }
  if (!dirty) return true
  return (
    await Taro.showModal({
      title: '尚未保存',
      content: '本次修改还没有保存，确定放弃并离开吗？',
      confirmText: '放弃修改',
      cancelText: '继续编辑',
      confirmColor: '#376646',
    })
  ).confirm
}
export async function allowNativeLeave(preserveDrafts = false) {
  const active = [...guards]
  const leaving = active.filter((guard) => !preserveDrafts || !guard.retainOnDetailOpen())
  if (
    !(await confirmNativeDiscard(
      leaving.some((guard) => guard.dirty()),
      active.some((guard) => guard.busy()),
    ))
  )
    return false
  for (const guard of leaving) if (guard.dirty()) guard.discard()
  return true
}
export function useNativeLeaveProtection(
  dirty: boolean,
  busy: boolean,
  discard: () => void,
  retainOnDetailOpen = false,
) {
  const active = useContext(NativeDetailActiveContext)
  const latest = useRef({ dirty, busy, discard, active, retainOnDetailOpen })
  latest.current = { dirty, busy, discard, active, retainOnDetailOpen }
  useEffect(() => {
    const guard: Guard = {
      dirty: () => latest.current.active && latest.current.dirty,
      busy: () => latest.current.active && latest.current.busy,
      retainOnDetailOpen: () => latest.current.retainOnDetailOpen,
      discard: () => {
        latest.current.dirty = false
        latest.current.discard()
      },
    }
    guards.add(guard)
    return () => {
      guards.delete(guard)
    }
  }, [])
}
export function useNativeBackLayer(close: () => Promise<boolean>, enabled = true) {
  const latest = useRef(close)
  latest.current = close
  useEffect(() => {
    if (!enabled) return
    const layer = () => latest.current()
    layers.push(layer)
    return () => {
      const index = layers.indexOf(layer)
      if (index >= 0) layers.splice(index, 1)
    }
  }, [enabled])
}
export async function closeNativeBackLayer() {
  const layer = layers[layers.length - 1]
  if (!layer) return false
  await layer()
  return true
}
