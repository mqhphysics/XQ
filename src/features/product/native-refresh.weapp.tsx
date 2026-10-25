import { Image, ScrollView, Slot, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ComponentProps,
  type PropsWithChildren,
} from 'react'
import { refreshNativeCurrentUser } from './current-user.weapp'
import ring from '../../assets/login-art/cursors/loading-ring.svg'
import './native-refresh.weapp.scss'
import { invalidateNativeProductReads } from './product.repository'

type Task = () => Promise<unknown>
const RefreshContext = createContext<{
  tasks: Set<Task>
  active: boolean
  refreshing: boolean
  refresh: () => Promise<void>
} | null>(null)

/** Each mounted panel owns its refresh tasks; adjacent preloaded panels stay untouched. */
export function NativeRefreshScope({ active, children }: PropsWithChildren<{ active: boolean }>) {
  const tasks = useRef(new Set<Task>())
  const lock = useRef(false)
  const alive = useRef(true)
  const [refreshing, setRefreshing] = useState(false)
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])
  const refresh = async () => {
    if (lock.current || !active) return
    lock.current = true
    setRefreshing(true)
    invalidateNativeProductReads()
    try {
      const results = await Promise.allSettled([
        refreshNativeCurrentUser(),
        ...[...tasks.current].map((load) => Promise.resolve().then(load)),
      ])
      const failed = results.find((result) => result.status === 'rejected')
      if (failed?.status === 'rejected') throw failed.reason
    } catch (issue) {
      void Taro.showToast({
        title: issue instanceof Error ? issue.message : '刷新失败，请稍后重试',
        icon: 'none',
      })
    } finally {
      lock.current = false
      if (alive.current) setRefreshing(false)
    }
  }
  return (
    <RefreshContext.Provider value={{ tasks: tasks.current, active, refreshing, refresh }}>
      {children}
    </RefreshContext.Provider>
  )
}

export function useNativeRefreshTask(load: Task) {
  const tasks = useContext(RefreshContext)?.tasks
  const latest = useRef(load)
  latest.current = load
  useEffect(() => {
    if (!tasks) return
    const run = () => latest.current()
    tasks.add(run)
    return () => {
      tasks.delete(run)
    }
  }, [tasks])
}

export function NativeRefreshScroll(props: ComponentProps<typeof ScrollView>) {
  const scope = useContext(RefreshContext)
  const { children, ...rest } = props
  return (
    <ScrollView
      {...rest}
      refresherEnabled={Boolean(scope?.active)}
      refresherTriggered={scope?.refreshing ?? false}
      refresherDefaultStyle="none"
      refresherThreshold={64}
      refresherBackground="#f6f8f3"
      onRefresherRefresh={() => {
        void scope?.refresh()
      }}
    >
      <NativeRefreshIndicator spinning={scope?.refreshing ?? false} />
      {children}
    </ScrollView>
  )
}
export function NativeRefreshIndicator({ spinning }: { spinning: boolean }) {
  return (
    <Slot name="refresher">
      <View
        className={`native-refresh-indicator${spinning ? ' is-refreshing' : ''}`}
        aria-label={spinning ? '正在刷新' : '下拉刷新'}
      >
        <Image src={ring} mode="aspectFit" />
      </View>
    </Slot>
  )
}
