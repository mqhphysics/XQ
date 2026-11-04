import {
  useNativeViewport,
  readNativeViewport,
} from '../../features/native-navigation/viewport.weapp'
import { nativeWideWindow } from '../../features/native-navigation/viewport.logic.weapp'
import { Button, Image, PageMeta, Swiper, SwiperItem, Text, View } from '@tarojs/components'
import Taro, { getCurrentInstance } from '@tarojs/taro'
import { nativeHomeScrollEvent } from '../../features/getting-started/home-ready.weapp'
import {
  Component,
  memo,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from 'react'
import { PublicShell } from '../public-shell'
import { DataState } from '../../components/public-ui'
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
import { NativeCampusWelcome } from '../campus-context/welcome.weapp'
import { NativeFpsMeter } from '../native-ui/fps-meter.weapp'
import { readSession } from '../../features/product/session'
import {
  nativeSections,
  type NativeSection,
} from '../../features/native-navigation/history.logic.weapp'
import {
  nativeTouchPoint,
  registerNativeMainController,
  setNativePagerProgress,
  switchNativeSection,
  useNativeTournamentId,
  useNativeMainBlocked,
  canDragNativeMain,
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
/* Page swipe: slow-fast-slow (easeInOutCubic) so the settle visibly decelerates; the tab
   indicator and settle timers use the same duration. */
const pagerMs = 400

function neighbours(index: number) {
  return [index - 1, index, index + 1].filter(
    (value) => value >= 0 && value < nativeSections.length,
  )
}
export function NativeMainPager() {
  const params = getCurrentInstance().router?.params || {},
    initial = Math.max(0, nativeSections.indexOf(params.section as NativeSection))
  const [current, setCurrent] = useState(initial),
    [displayed, setDisplayed] = useState(initial),
    [settled, setSettled] = useState(initial),
    [loaded, setLoaded] = useState(() => new Set([initial])),
    [homeScrollTarget, setHomeScrollTarget] = useState('')
  const info = useNativeViewport(),
    header = nativeHeaderMetrics(),
    blocked = useNativeMainBlocked(),
    tournamentId = useNativeTournamentId()
  const [height, setHeight] = useState(() =>
    Math.max(
      180,
      info.windowHeight -
        header.height -
        (nativeWideWindow(info) ? 0 : (136 * info.windowWidth) / 750),
    ),
  )
  const index = useRef(initial),
    alive = useRef(true),
    intent = useRef(0),
    touchedSection = useRef(initial),
    ownsTouch = useRef(false),
    touch = useRef<ReturnType<typeof nativeTouchPoint>>(null),
    finishTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const goTo = (section: NativeSection) => {
    const target = nativeSections.indexOf(section),
      from = index.current
    intent.current++
    index.current = target
    setCurrent(target)
    setDisplayed(target)
    setLoaded((previous) => (previous.has(target) ? previous : new Set([...previous, target])))
    setNativePagerProgress(from, target, pagerMs)
    if (finishTimer.current) clearTimeout(finishTimer.current)
    if (from === target) setSettled(target)
    else
      finishTimer.current = setTimeout(() => {
        if (alive.current && index.current === target) setSettled(target)
      }, pagerMs + 60)
    Taro.eventCenter.trigger('xiaoqiu:native-main-section', section)
  }
  const latest = useRef(goTo)
  latest.current = goTo
  useEffect(() => {
    const nested = () => {
      ownsTouch.current = false
      touch.current = null
      intent.current++
      setDisplayed(index.current)
    }
    Taro.eventCenter.on('xiaoqiu:native-nested-touch', nested)
    return () => {
      Taro.eventCenter.off('xiaoqiu:native-nested-touch', nested)
    }
  }, [])
  useEffect(() => {
    alive.current = true
    setNativePagerProgress(initial)
    const unregister = registerNativeMainController({
      section: () => nativeSections[index.current]!,
      goTo: (section) => latest.current(section),
      start() {},
      move() {},
      end() {},
      cancel() {
        touch.current = null
      },
    })
    return () => {
      alive.current = false
      intent.current++
      unregister()
      if (finishTimer.current) clearTimeout(finishTimer.current)
    }
  }, [])
  useEffect(() => {
    let active = true
    Taro.nextTick(() => {
      let top = 0,
        end = readNativeViewport().windowHeight
      const query = Taro.createSelectorQuery()
      query.select('.native-main-viewport').boundingClientRect((rect) => {
        top = (rect as { top?: number })?.top || 0
      })
      query.select('.mobile-tabbar').boundingClientRect((rect) => {
        end = (rect as { top?: number })?.top || end
      })
      query.exec(() => {
        if (active) setHeight(Math.max(180, end - top))
      })
    })
    return () => {
      active = false
    }
  }, [info.windowWidth, info.windowHeight])
  useEffect(() => {
    /* Preload neighbours only after the swipe has settled, so their first (heavy) render never
       lands in the middle of the page animation. */
    if (settled !== current) return
    const timer = setTimeout(() => {
      if (touch.current) return
      setLoaded((previous) =>
        neighbours(current).every((page) => previous.has(page))
          ? previous
          : new Set([...previous, ...neighbours(current)]),
      )
    }, 150)
    return () => clearTimeout(timer)
  }, [current, settled])
  useEffect(() => {
    const published = () => {
      setHomeScrollTarget('')
      Taro.nextTick(() => setHomeScrollTarget('native-home-feed-start'))
    }
    /* The first-use guide scrolls the home feed so its next target is on screen. */
    const scroll = (id: string) => {
      setHomeScrollTarget('')
      Taro.nextTick(() => setHomeScrollTarget(id))
    }
    Taro.eventCenter.on('xiaoqiu:native-post-published', published)
    Taro.eventCenter.on(nativeHomeScrollEvent, scroll)
    return () => {
      Taro.eventCenter.off('xiaoqiu:native-post-published', published)
      Taro.eventCenter.off(nativeHomeScrollEvent, scroll)
    }
  }, [])
  const select = async (target: number) => {
    const token = ++intent.current
    setDisplayed(target)
    if (!blocked && target !== index.current)
      await switchNativeSection(
        nativeSections[target]!,
        tournamentId,
        target > index.current ? 1 : -1,
        () => alive.current && token === intent.current,
      )
    if (alive.current && token === intent.current && target !== index.current)
      Taro.nextTick(() => {
        if (alive.current && token === intent.current) setDisplayed(index.current)
      })
  }
  const panels = useMemo(
    () =>
      nativeSections.map((section, panel) => {
        const Screen = screens[panel]!
        const content = (
          <NativePanelContext.Provider value={panel === settled ? visiblePanel : hiddenPanel}>
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
          <SwiperItem className={'native-main-panel native-main-panel--' + section} key={section}>
            <NativeRefreshScope active={panel === settled}>
              {section === 'schedule' || section === 'data' ? (
                <View className="native-main-scroll">{content}</View>
              ) : (
                <NativeRefreshScroll
                  className="native-main-scroll"
                  scrollIntoView={section === 'home' ? homeScrollTarget : ''}
                  scrollWithAnimation
                  scrollY
                  showScrollbar={false}
                  enhanced
                >
                  {content}
                </NativeRefreshScroll>
              )}
            </NativeRefreshScope>
          </SwiperItem>
        )
      }),
    [loaded, settled, homeScrollTarget],
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
            <Swiper
              className="native-main-swiper"
              current={displayed}
              duration={pagerMs}
              easingFunction="easeInOutCubic"
              circular={false}
              disableTouch={blocked}
              skipHiddenItemLayout
              onTouchStart={(event) => {
                ownsTouch.current = true
                touch.current = nativeTouchPoint(event)
                touchedSection.current = index.current
                intent.current++
              }}
              onTouchEnd={(event) => {
                const from = touch.current,
                  end = nativeTouchPoint(event)
                touch.current = null
                if (
                  from &&
                  end &&
                  touchedSection.current === 0 &&
                  canDragNativeMain() &&
                  end.x - from.x > 56 &&
                  Math.abs(end.y - from.y) < Math.abs(end.x - from.x) / 1.5
                )
                  Taro.eventCenter.trigger('xiaoqiu:native-request-back')
              }}
              onTouchCancel={() => {
                ownsTouch.current = false
                touch.current = null
              }}
              onChange={(event) => {
                if (event.detail.source === 'touch' && ownsTouch.current)
                  void select(event.detail.current)
              }}
              onAnimationFinish={(event) => {
                if (event.detail.current === index.current) {
                  if (finishTimer.current) clearTimeout(finishTimer.current)
                  setSettled(index.current)
                  setNativePagerProgress(index.current)
                }
              }}
            >
              {panels}
            </Swiper>
          </View>
        </PublicShell>
        <NativeBackGuard />
        {/* Stable slot: when the welcome unmounts Taro re-sends the parent's whole child list,
            and the parent here is the entire app (~130-180 KB per tab switch without the slot). */}
        <View className="native-main-welcome-slot">
          <NativeCampusWelcome section={nativeSections[current]!} />
        </View>
        <View className="native-main-fps-slot">
          <NativeFpsMeter />
        </View>
      </View>
    </>
  )
}
