import Taro, { useDidHide } from '@tarojs/taro'
import { useEffect, useRef, useState } from 'react'
import { readSession } from '../product/session'
import {
  technicalApi,
  technicalState,
  type TechnicalOperation,
  type TechnicalWorkspace,
} from './repository.weapp'
type Draft = { workspace: TechnicalWorkspace; pending: TechnicalOperation[] }
export function useTechnicalRecorder(matchId: string) {
  const owner = useRef(readSession()),
    server = useRef<TechnicalWorkspace | null>(null),
    pending = useRef<TechnicalOperation[]>([])
  const alive = useRef(true),
    locked = useRef(false),
    timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const [workspace, setWorkspace] = useState<TechnicalWorkspace | null>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [unsynced, setUnsynced] = useState(0)
  const key = `xiaoqiu:technical:v1:${owner.current?.user.organizationId}:${owner.current?.user.id}:${matchId}`
  const sameOwner = () =>
    !!owner.current && owner.current.accessToken === readSession()?.accessToken
  const publish = (validated?: TechnicalOperation[]) => {
    if (!alive.current || !sameOwner() || !server.current) return
    const operations = validated ?? [...server.current.operations, ...pending.current]
    try {
      if (!validated) technicalState(operations)
      setWorkspace({ ...server.current, operations })
    } catch {
      setError('本机操作与云端记录冲突；草稿仍保留，可重试或选择采用云端记录')
    }
    setUnsynced(pending.current.length)
    try {
      Taro.setStorageSync(key, {
        workspace: server.current,
        pending: pending.current,
      } satisfies Draft)
    } catch {
      setError('本机保存失败，请保持此页打开并重试同步')
    }
  }
  const merge = (fresh: TechnicalWorkspace) => {
    if (fresh.matchId !== matchId || fresh.recorderUserId !== owner.current?.user.id)
      throw Error('统计记录归属不匹配')
    const known = new Set(fresh.operations.map((x) => x.id))
    pending.current = pending.current.filter((x) => !known.has(x.id))
    server.current = fresh
  }
  const sync = async () => {
    if (
      locked.current ||
      !sameOwner() ||
      !server.current ||
      !pending.current.length ||
      !server.current.canRecord
    )
      return
    locked.current = true
    if (alive.current) setBusy(true)
    let successful = false
    try {
      const response = await technicalApi.append(
        matchId,
        server.current.version,
        pending.current.slice(0, 100),
      )
      if (!sameOwner()) return
      merge(response)
      setError('')
      successful = true
      publish()
    } catch (issue) {
      if (!sameOwner()) return
      const status = (issue as { statusCode?: number }).statusCode
      if (status === 409) {
        try {
          merge(await technicalApi.load(matchId))
          technicalState([...server.current!.operations, ...pending.current])
          publish()
        } catch {
          /* Keep the local command log intact for an explicit conflict decision. */
        }
      }
      if ((status === 401 || status === 403) && server.current)
        server.current = {
          ...server.current,
          canRecord: false,
          reason: '记录权限已变化，请重新进入比赛',
        }
      if (alive.current) {
        setError(issue instanceof Error ? issue.message : '连接失败，本机记录已保留')
        publish()
      }
    } finally {
      locked.current = false
      if (alive.current) setBusy(false)
      if (successful && pending.current.length && alive.current)
        timer.current = setTimeout(() => void sync(), 250)
    }
  }
  const refresh = async () => {
    if (!sameOwner()) return
    try {
      const next = await technicalApi.load(matchId)
      if (!sameOwner() || !alive.current) return
      merge(next)
      technicalState([...next.operations, ...pending.current])
      setError('')
      publish()
      void sync()
    } catch (issue) {
      if (alive.current) setError(issue instanceof Error ? issue.message : '统计读取失败')
    }
  }
  useEffect(() => {
    alive.current = true
    try {
      const saved = Taro.getStorageSync<Draft>(key)
      if (
        saved?.workspace?.matchId === matchId &&
        saved.workspace.recorderUserId === owner.current?.user.id &&
        Array.isArray(saved.pending)
      ) {
        technicalState([...saved.workspace.operations, ...saved.pending])
        server.current = saved.workspace
        pending.current = saved.pending
        publish()
      }
    } catch {
      setError('本机草稿无法读取，请先连接服务器恢复')
    }
    void refresh()
    return () => {
      alive.current = false
      if (timer.current) clearTimeout(timer.current)
      void sync()
    }
  }, [matchId])
  useDidHide(() => {
    if (timer.current) clearTimeout(timer.current)
    void sync()
  })
  const append = (operation: TechnicalOperation) => {
    if (!sameOwner()) {
      setError('账号已切换，请重新进入')
      return
    }
    if (!server.current?.canRecord) return
    const nextOperations = [...server.current.operations, ...pending.current, operation]
    try {
      technicalState(nextOperations)
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : '统计操作冲突')
      return
    }
    pending.current = [...pending.current, operation]
    publish(nextOperations)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => void sync(), 900)
    void Taro.vibrateShort({ type: 'medium' }).catch(() => {})
    return true
  }
  const discardPending = async () => {
    const decision = await Taro.showModal({
      title: '采用云端记录',
      content: '将放弃本机尚未同步的操作。已同步的记录不会删除，本机草稿会保留一份备份。',
      confirmText: '采用云端',
      confirmColor: '#315d42',
    })
    if (!decision.confirm || !sameOwner() || !server.current) return
    try {
      Taro.setStorageSync(key + ':backup:' + Date.now(), {
        workspace: server.current,
        pending: pending.current,
      })
      const fresh = await technicalApi.load(matchId)
      if (!sameOwner()) return
      pending.current = []
      server.current = fresh
      setError('')
      publish()
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : '恢复失败，本机记录仍保留')
    }
  }
  return { workspace, error, busy, unsynced, append, sync, refresh, discardPending }
}
