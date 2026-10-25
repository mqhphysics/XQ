import { Button, Image, PageMeta, Text, View } from '@tarojs/components'
import Taro, { getCurrentInstance } from '@tarojs/taro'
import {
  Component,
  forwardRef,
  memo,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from 'react'
import { PublicShell } from '../public-shell'
import { DataState } from '../public-ui'
import { nativeHeaderMetrics } from '../public-shell/native-header-metrics.weapp'
import HomeScreen from '../../pages/index/screen.weapp'
import ScheduleScreen from '../../pages/readonly-schedule/desktop-schedule.weapp'
import TeamScreen from '../../pages/my-team/hub.weapp'
import DataScreen from '../../pages/data-center/screen.weapp'
import MeScreen from '../../pages/me/me.shared'
import '../../pages/my-team/index.weapp.scss'
import campusLineart from '../../assets/home-visual/stadium-front-lineart.png'
import { NativePanelContext } from './panel-context.weapp'
import { NativeBackGuard } from './native-back-guard.weapp'
import { readSession } from '../../features/product/session'
import {
  nativeSections,
  indicatorPosition,
  type NativeSection,
} from '../../features/native-navigation/history.logic.weapp'
import {
  canDragNativeMain,
  nativeTouchPoint,
  readNativeSwipeClaim,
  registerNativeMainController,
  setNativePagerProgress,
  switchNativeSection,
  useNativeTournamentId,
  type NativeMainController,
} from '../../features/native-navigation/index.weapp'
import './main-pager.weapp.scss'
import {
  NativeRefreshScope,
  NativeRefreshScroll,
} from '../../features/product/native-refresh.weapp'

class PanelBoundary extends Component<PropsWithChildren, { failed: boolean; retry: number }> {
  state = { failed: false, retry: 0 }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  componentDidCatch(issue: Error) {
    console.warn('Native page render failed:', issue.message)
  }
  render() {
    return this.state.failed ? (
      <DataState
        kind="error"
        title="页面暂时无法显示"
        description="可以切换其他页面，或重试读取。"
        onRetry={() => this.setState((state) => ({ failed: false, retry: state.retry + 1 }))}
      />
    ) : (
      <View key={this.state.retry} style="height:100%;min-height:0;">
        {this.props.children}
      </View>
    )
  }
}
type TrackHandle = { position: (value: number, duration: number) => void }
const PagerTrack = memo(
  forwardRef<TrackHandle, PropsWithChildren>(function PagerTrack({ children }, ref) {
    const [frame, setFrame] = useState({ position: 0, duration: 0 })
    useImperativeHandle(
      ref,
      () => ({ position: (position, duration) => setFrame({ position, duration }) }),
      [],
    )
    return (
      <View
        className="native-main-track"
        style={`transform:translate3d(${-frame.position * 20}%,0,0);transition-duration:${frame.duration}ms;`}
        data-progress={frame.position.toFixed(3)}
      >
        {children}
      </View>
    )
  }),
)
function GuestAccount() {
  return (
    <View className="native-main-guest">
      <Text>欢迎来到晓球</Text>
      <Text>登录后管理你的资料、球队与消息。</Text>
      <Button
        className="native-button native-button--primary"
        onClick={() => void Taro.reLaunch({ url: '/pages/login/index' })}
      >
        登录 / 注册
      </Button>
    </View>
  )
}
const screens = [HomeScreen, ScheduleScreen, TeamScreen, DataScreen, MeScreen].map((Screen) =>
  memo(Screen),
)
const visiblePanel = { embedded: true, active: true },
  hiddenPanel = { embedded: true, active: false }
function neighbours(index: number) {
  return [index - 1, index, index + 1].filter(
    (value) => value >= 0 && value < nativeSections.length,
  )
}
export function NativeMainPager() {
  const params = getCurrentInstance().router?.params || {}
  const initial = Math.max(0, nativeSections.indexOf(params.section as NativeSection))
  const [current, setCurrent] = useState(initial),
    [loaded, setLoaded] = useState(() => new Set(neighbours(initial)))
  const [dragging, setDragging] = useState(false)
  const [homeScrollTarget, setHomeScrollTarget] = useState('')
  useEffect(() => {
    const published = () => {
      setHomeScrollTarget('')
      Taro.nextTick(() => setHomeScrollTarget('native-home-feed-start'))
    }
    Taro.eventCenter.on('xiaoqiu:native-post-published', published)
    return () => {
      Taro.eventCenter.off('xiaoqiu:native-post-published', published)
    }
  }, [])
  const info = Taro.getWindowInfo(),
    header = nativeHeaderMetrics()
  const bottom = Math.max(0, info.screenHeight - (info.safeArea?.bottom ?? info.screenHeight))
  const [height, setHeight] = useState(() =>
    Math.max(180, info.windowHeight - header.height - ((136 * info.windowWidth) / 750 + bottom)),
  )
  const tournamentId = useNativeTournamentId()
  const track = useRef<TrackHandle>(null),
    viewportWidth = useRef(info.windowWidth),
    index = useRef(initial),
    alive = useRef(true)
  const motion = useRef({ from: initial, to: initial, at: 0, duration: 0 })
  const gesture = useRef<{
    point: NonNullable<ReturnType<typeof nativeTouchPoint>>
    position: number
    lastX: number
    lastAt: number
    velocity: number
    horizontal: boolean
    vertical: boolean
    claim: ReturnType<typeof readNativeSwipeClaim>
  } | null>(null)
  const present = () => indicatorPosition(motion.current, Date.now())
  const position = (value: number, duration = 0) => {
    track.current?.position(value, duration)
    setNativePagerProgress(duration ? present() : value, value, duration)
  }
  const goTo = (section: NativeSection) => {
    const target = nativeSections.indexOf(section),
      from = present()
    index.current = target
    setCurrent(target)
    setDragging(false)
    setLoaded((previous) =>
      neighbours(target).every((page) => previous.has(page))
        ? previous
        : new Set([...previous, ...neighbours(target)]),
    )
    motion.current = { from, to: target, at: Date.now(), duration: 230 }
    track.current?.position(from, 0)
    setNativePagerProgress(from, target, 230)
    Taro.nextTick(() => {
      if (alive.current)
        track.current?.position(target, Math.max(0, motion.current.at + 230 - Date.now()))
    })
    Taro.eventCenter.trigger('xiaoqiu:native-main-section', section)
  }
  const latest = useRef({ goTo, tournamentId })
  latest.current = { goTo, tournamentId }
  useEffect(() => {
    alive.current = true
    track.current?.position(initial, 0)
    setNativePagerProgress(initial)
    const cancel = () => {
      gesture.current = null
      setDragging(false)
      latest.current.goTo(nativeSections[index.current]!)
    }
    const controller: NativeMainController = {
      section: () => nativeSections[index.current]!,
      goTo: (section) => latest.current.goTo(section),
      start: (event) => {
        const p = nativeTouchPoint(event)
        if (!p || !canDragNativeMain()) {
          gesture.current = null
          return
        }
        const value = present()
        motion.current = { from: value, to: value, at: Date.now(), duration: 0 }
        position(value)
        gesture.current = {
          point: p,
          position: value,
          lastX: p.x,
          lastAt: p.at,
          velocity: 0,
          horizontal: false,
          vertical: false,
          claim: readNativeSwipeClaim(event),
        }
      },
      move: (event) => {
        if (!canDragNativeMain()) {
          if (gesture.current?.horizontal) cancel()
          gesture.current = null
          return
        }
        const state = gesture.current,
          p = nativeTouchPoint(event)
        if (!state || !p || state.vertical) return
        const dx = p.x - state.point.x,
          dy = p.y - state.point.y
        if (!state.horizontal) {
          if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) {
            state.vertical = true
            return
          }
          if (Math.abs(dx) < 8 || Math.abs(dx) < Math.abs(dy) * 1.5) return
          const direction = dx < 0 ? 1 : -1,
            nested = state.claim
          if (nested && nested.index + direction >= 0 && nested.index + direction < nested.count) {
            state.vertical = true
            return
          }
          state.horizontal = true
          setDragging(true)
        }
        const width = viewportWidth.current
        const raw = state.position - dx / width
        const value = raw < 0 ? raw * 0.16 : raw > 4 ? 4 + (raw - 4) * 0.16 : raw
        state.velocity = -(p.x - state.lastX) / Math.max(1, p.at - state.lastAt)
        state.lastX = p.x
        state.lastAt = p.at
        motion.current = { from: value, to: value, at: Date.now(), duration: 0 }
        position(value)
      },
      end: (event) => {
        const state = gesture.current,
          p = nativeTouchPoint(event)
        gesture.current = null
        if (!state?.horizontal || !p) return
        event.stopPropagation()
        setDragging(false)
        if (index.current === 0 && p.x - state.point.x > 56) {
          latest.current.goTo('home')
          Taro.eventCenter.trigger('xiaoqiu:native-request-back')
          return
        }
        const velocity = p.at - state.lastAt < 100 ? state.velocity : 0
        const anchor = Math.round(state.position),
          projected = present() + (velocity * 140) / viewportWidth.current
        const target = Math.max(
          0,
          Math.min(4, Math.max(anchor - 1, Math.min(anchor + 1, Math.round(projected)))),
        )
        if (target === index.current) latest.current.goTo(nativeSections[target]!)
        else
          void switchNativeSection(
            nativeSections[target]!,
            latest.current.tournamentId,
            target > index.current ? 1 : -1,
          )
      },
      cancel,
    }
    const unregister = registerNativeMainController(controller)
    const measure = () =>
      Taro.nextTick(() => {
        const query = Taro.createSelectorQuery()
        let top = 0,
          end = Taro.getWindowInfo().windowHeight
        query.select('.native-main-viewport').boundingClientRect((rect) => {
          top = (rect as { top?: number })?.top || 0
          viewportWidth.current =
            (rect as { width?: number })?.width || Taro.getWindowInfo().windowWidth
        })
        query.select('.mobile-tabbar').boundingClientRect((rect) => {
          end = (rect as { top?: number })?.top || end
        })
        query.exec(() => {
          if (alive.current) setHeight(Math.max(180, end - top))
        })
      })
    measure()
    Taro.onWindowResize(measure)
    return () => {
      alive.current = false
      unregister()
      Taro.offWindowResize(measure)
    }
  }, [])
  const panels = useMemo(
    () =>
      nativeSections.map((section, panel) => {
        const Screen = screens[panel]!
        const content = (
          <NativePanelContext.Provider value={panel === current ? visiblePanel : hiddenPanel}>
            <PanelBoundary>
              {loaded.has(panel) ? (
                panel === 4 && !readSession() ? (
                  <GuestAccount />
                ) : (
                  <Screen />
                )
              ) : (
                <DataState kind="loading" title="正在准备页面" />
              )}
            </PanelBoundary>
          </NativePanelContext.Provider>
        )
        return (
          <View className={`native-main-panel native-main-panel--${section}`} key={section}>
            <NativeRefreshScope active={panel === current && !dragging}>
              {section === 'schedule' || section === 'data' ? (
                <View className="native-main-scroll">{content}</View>
              ) : (
                <NativeRefreshScroll
                  className="native-main-scroll"
                  scrollIntoView={section === 'home' ? homeScrollTarget : ''}
                  scrollWithAnimation
                  scrollY={!dragging}
                  showScrollbar={false}
                  enhanced
                >
                  {content}
                </NativeRefreshScroll>
              )}
            </NativeRefreshScope>
          </View>
        )
      }),
    [loaded, current, dragging, homeScrollTarget],
  )
  return (
    <>
      <PageMeta pageStyle="height:100%;overflow:hidden;" />
      <View className="native-main-root">
        <PublicShell active={nativeSections[current]!} tournamentId={tournamentId} nativeMain>
          <View className="native-main-viewport" style={`height:${height}px;`}>
            <Image
              className="native-main-campus-art"
              src={`/${campusLineart.replace(/^\/+/, '')}`}
              mode="aspectFit"
            />
            <PagerTrack ref={track}>{panels}</PagerTrack>
          </View>
        </PublicShell>
        <NativeBackGuard />
      </View>
    </>
  )
}
