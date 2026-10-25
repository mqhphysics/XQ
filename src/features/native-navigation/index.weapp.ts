import Taro, { getCurrentInstance, useDidShow } from '@tarojs/taro'
import type { BaseEventOrig, ITouchEvent } from '@tarojs/components'
import { useCallback, useContext, useEffect, useRef, useState } from 'react'
import { NativeDetailEntryContext } from './detail-context.weapp'
import { NativeInlineContentContext } from '../../components/native-navigation/panel-context.weapp'
import { readSession } from '../product/session'
import { allowNativeLeave, closeNativeBackLayer } from './leave-guard.weapp'
import {
  appendDetail,
  moveDetail,
  nativeSections,
  nativeTabPaths,
  swipeDirection,
  indicatorPosition,
  nextIndicatorMotion,
  type DetailHistory,
  type NativeSection,
} from './history.logic.weapp'

const historyEvent = 'xiaoqiu:native-history'
let history: DetailHistory = { entries: [], cursor: -1 }
let sequence = 0,
  competitionId = '',
  overlay = false,
  overlayDepth = 0,
  keyboardOpen = false,
  tabSwitching = false
const indicatorEvent = 'xiaoqiu:native-indicator'
export interface NativeMainController {
  section: () => NativeSection
  goTo: (section: NativeSection, direction?: -1 | 1) => void
  start: (event: BaseEventOrig) => void
  move: (event: BaseEventOrig) => void
  end: (event: BaseEventOrig) => void
  cancel: () => void
}
let mainController: NativeMainController | null = null
export interface NativeDetailController {
  start: (event: BaseEventOrig) => void
  move: (event: BaseEventOrig) => boolean
  end: (event: BaseEventOrig) => void
  cancel: () => void
}
let detailController: NativeDetailController | null = null
export function registerNativeDetailController(controller: NativeDetailController) {
  detailController = controller
  return () => {
    if (detailController === controller) detailController = null
  }
}
export function canDragNativeDetail() {
  return !overlay && !keyboardOpen
}
export async function stepNativeDetail(direction: -1 | 1) {
  if (!canDragNativeDetail() || moveDetail(history, direction) === history) return false
  if (!(await allowNativeLeave())) return false
  history = moveDetail(history, direction)
  notify()
  return true
}
let panelBack: (() => boolean) | null = null
let swipeClaim: { stamp: number; index: number; count: number } | null = null
export function registerNativeMainController(controller: NativeMainController) {
  mainController = controller
  return () => {
    if (mainController === controller) mainController = null
  }
}
export function registerNativePanelBack(handler: () => boolean) {
  panelBack = handler
  return () => {
    if (panelBack === handler) panelBack = null
  }
}
export function readNativeSwipeClaim(event: BaseEventOrig) {
  return swipeClaim?.stamp === event.timeStamp ? swipeClaim : null
}
export function claimNativeSwipe(event: BaseEventOrig, index: number, count: number) {
  swipeClaim = { stamp: event.timeStamp, index, count }
}
export function canDragNativeMain() {
  return !overlay && !keyboardOpen && history.cursor < 0
}
export function nativeTouchPoint(event: BaseEventOrig) {
  return point(event)
}
export function setNativePagerProgress(from: number, to = from, duration = 0) {
  indicator = { from, to, at: Date.now(), duration }
  Taro.eventCenter.trigger(indicatorEvent)
}
let indicator = { from: 0, to: 0, at: 0, duration: 0 }
function moveIndicator(to: number) {
  if (indicator.to === to) return
  indicator = nextIndicatorMotion(indicator, to, Date.now())
  Taro.eventCenter.trigger(indicatorEvent)
}
let queuedTab: {
  section: NativeSection
  id?: string | undefined
  direction?: -1 | 1 | undefined
} | null = null
let dataEntry: -1 | 1 | undefined
export function takeNativeDataEntry() {
  const direction = dataEntry
  dataEntry = undefined
  return direction
}
let historyOwner = ''
function ensureHistoryOwner() {
  const user = readSession()?.user
  const owner = `${user?.organizationId || 'public'}:${user?.id || 'visitor'}`
  if (historyOwner !== owner) {
    historyOwner = owner
    history = { entries: [], cursor: -1 }
  }
}
function isNativeRootPage() {
  const pages = Taro.getCurrentPages(),
    page = pages[pages.length - 1]
  return Object.values(nativeTabPaths).includes(`/${(page?.route || '').replace(/^\/+/, '')}`)
}
const notify = () => {
  Taro.eventCenter.trigger(historyEvent)
  Taro.eventCenter.trigger('xiaoqiu:native-detail-visible', history.cursor >= 0)
}
export const readNativeHistory = () => {
  ensureHistoryOwner()
  return history
}
export function setNativeTournamentId(id?: string) {
  if (id && id !== competitionId) {
    competitionId = id
    Taro.eventCenter.trigger('xiaoqiu:native-competition', id)
  }
}
export function getNativeTournamentId() {
  return competitionId
}
export function useNativeTournamentId() {
  const routeId = getCurrentInstance().router?.params.tournamentId
  const [value, setValue] = useState(routeId || competitionId)
  useEffect(() => {
    const changed = (id: string) => setValue(id)
    Taro.eventCenter.on('xiaoqiu:native-competition', changed)
    return () => {
      Taro.eventCenter.off('xiaoqiu:native-competition', changed)
    }
  }, [])
  return value
}
export async function switchNativeSection(section: NativeSection, id?: string, direction?: -1 | 1) {
  if (mainController) {
    if (!(await allowNativeLeave())) return
    if (section === 'data' && direction) dataEntry = direction
    setNativeTournamentId(id)
    history = { entries: [], cursor: -1 }
    notify()
    if (section === 'team') Taro.eventCenter.trigger('xiaoqiu:native-team-enter')
    mainController.goTo(section, direction)
    return
  }
  if (section === 'me' && !readSession()) {
    void Taro.showToast({ title: '登录后可以查看我的', icon: 'none' })
    return
  }
  if (tabSwitching) {
    queuedTab = { section, id, direction }
    return
  }
  tabSwitching = true
  moveIndicator(nativeSections.indexOf(section))
  if (section === 'data' && direction) dataEntry = direction
  setNativeTournamentId(id)
  history = { entries: [], cursor: -1 }
  notify()
  try {
    if (section === 'team') {
      Taro.eventCenter.trigger('xiaoqiu:native-team-enter')
      await new Promise<void>((resolve) => Taro.nextTick(resolve))
    }
    await Taro.reLaunch({
      url: `/pages/index/index?section=${section}${id ? `&tournamentId=${encodeURIComponent(id)}` : ''}`,
    })
  } catch {
    void Taro.showToast({ title: '页面切换失败，请重试', icon: 'none' })
  } finally {
    tabSwitching = false
    const next = queuedTab
    queuedTab = null
    if (next) void switchNativeSection(next.section, next.id, next.direction)
  }
}
export async function openNativeDetail(url: string, preload?: () => Promise<unknown>) {
  if (!(await allowNativeLeave(true))) return
  if (preload) void preload().catch(() => {})
  await Taro.hideKeyboard().catch(() => {})
  ensureHistoryOwner()
  if (isNativeRootPage()) {
    if (history.entries[history.cursor]?.url === url) return
    history = appendDetail(history, { id: ++sequence, url, scroll: 0, state: {} })
    notify()
  } else await Taro.navigateTo({ url })
}
export async function nativeBack() {
  if (keyboardOpen) {
    await Taro.hideKeyboard()
    return 'handled' as const
  }
  if (await closeNativeBackLayer()) return 'handled' as const
  if (!(await allowNativeLeave())) return 'handled' as const
  if (isNativeRootPage() && history.cursor >= 0) {
    history = moveDetail(history, -1)
    notify()
    return 'handled' as const
  }
  if (mainController) {
    if (mainController.section() === 'data' && panelBack?.()) return 'handled' as const
    const index = nativeSections.indexOf(mainController.section())
    if (index > 0) {
      await switchNativeSection(nativeSections[index - 1]!, competitionId, -1)
      return 'handled' as const
    }
    return 'exit' as const
  }
  if (Taro.getCurrentPages().length > 1) await Taro.navigateBack()
  else await switchNativeSection('home')
  return 'handled' as const
}
export function nativeForward() {
  if (moveDetail(history, 1) === history) return false
  void stepNativeDetail(1)
  return true
}
export function saveDetailScroll(top: number, entryId?: number) {
  const entry =
    entryId === undefined
      ? history.entries[history.cursor]
      : history.entries.find((item) => item.id === entryId)
  if (entry) entry.scroll = top
}
export function scrollNativeDetailTop() {
  Taro.eventCenter.trigger('xiaoqiu:native-detail-top')
}
export function useNativeRouteState<T>(
  key: string,
  initial: T | (() => T),
): [T, (next: T | ((value: T) => T)) => void] {
  const provided = useContext(NativeDetailEntryContext)
  const inline = useContext(NativeInlineContentContext)
  const entry = useRef(
    provided ?? (!inline && isNativeRootPage() ? history.entries[history.cursor] : undefined),
  )
  const [value, update] = useState<T>(() =>
    key in (entry.current?.state || {})
      ? (entry.current!.state[key] as T)
      : typeof initial === 'function'
        ? (initial as () => T)()
        : initial,
  )
  const setValue = useCallback(
    (next: T | ((value: T) => T)) => {
      update((previous) => {
        const result = typeof next === 'function' ? (next as (value: T) => T)(previous) : next
        if (entry.current) entry.current.state[key] = result
        return result
      })
    },
    [key],
  )
  return [value, setValue]
}
const point = (event: BaseEventOrig) => {
  const touch = event as Partial<ITouchEvent>
  const p = touch.changedTouches?.[0] || touch.touches?.[0]
  return p && Number.isFinite(p.clientX ?? p.pageX) && Number.isFinite(p.clientY ?? p.pageY)
    ? { x: p.clientX ?? p.pageX, y: p.clientY ?? p.pageY, at: Date.now() }
    : null
}
export function useNestedNativeSwipe(
  index: number,
  count: number,
  select: (index: number) => void,
  historyEdges = false,
) {
  const start = useRef<ReturnType<typeof point>>(null),
    initial = useRef(index)
  return {
    onTouchStart: (event: BaseEventOrig) => {
      start.current = overlay || keyboardOpen ? null : point(event)
      initial.current = index
      swipeClaim = { stamp: event.timeStamp, index, count }
    },
    onTouchEnd: (event: BaseEventOrig) => {
      const end = point(event),
        from = start.current
      if (!from || !end) return
      if (historyEdges && (from.x < 28 || from.x > Taro.getWindowInfo().windowWidth - 28)) return
      const direction = swipeDirection(from, end),
        next = initial.current + direction
      if (direction && next >= 0 && next < count) {
        event.stopPropagation()
        select(next)
        if (history.cursor >= 0) scrollNativeDetailTop()
      }
      start.current = null
    },
  }
}
export function useNativeShell(section: string, detail: boolean, tournamentId?: string) {
  const target = nativeSections.indexOf(section as NativeSection)
  const [frame, setFrame] = useState(() => ({
    index: indicatorPosition(indicator, Date.now()),
    duration: 0,
  }))
  const start = useRef<ReturnType<typeof point>>(null)
  const detailDrag = useRef(false)
  useDidShow(() => {
    if (!detail && target >= 0 && !tabSwitching && !mainController) moveIndicator(target)
  })
  useEffect(() => {
    if (detail) return
    let active = true
    const align = () => {
      const motion = indicator
      setFrame({ index: indicatorPosition(motion, Date.now()), duration: 0 })
      Taro.nextTick(() => {
        if (active && motion === indicator)
          setFrame({
            index: motion.to,
            duration: Math.max(0, motion.at + motion.duration - Date.now()),
          })
      })
    }
    Taro.eventCenter.on(indicatorEvent, align)
    align()
    return () => {
      active = false
      Taro.eventCenter.off(indicatorEvent, align)
    }
  }, [detail])
  useEffect(() => {
    const listener = (open: boolean) => {
      overlayDepth = Math.max(0, overlayDepth + (open ? 1 : -1))
      overlay = overlayDepth > 0
    }
    Taro.eventCenter.on('xiaoqiu:native-overlay', listener)
    const keyboard = (event: { height: number }) => {
      keyboardOpen = event.height > 0
    }
    Taro.onKeyboardHeightChange(keyboard)
    return () => {
      Taro.eventCenter.off('xiaoqiu:native-overlay', listener)
      Taro.offKeyboardHeightChange(keyboard)
    }
  }, [])
  return {
    ...frame,
    touchHandlers: {
      onTouchStart: (event: BaseEventOrig) => {
        detailDrag.current = false
        if (detailController && isNativeRootPage()) detailController.start(event)
        if (!detail && mainController) {
          mainController.start(event)
          return
        }
        start.current = overlay || keyboardOpen ? null : point(event)
      },
      onTouchMove: (event: BaseEventOrig) => {
        if (detailController && isNativeRootPage() && detailController.move(event)) {
          if (!detail && !detailDrag.current) mainController?.cancel()
          detailDrag.current = true
          return
        }
        if (!detail) mainController?.move(event)
      },
      onTouchCancel: () => {
        detailController?.cancel()
        if (!detail) mainController?.cancel()
      },
      onTouchEnd: (event: BaseEventOrig) => {
        if (detailController && isNativeRootPage() && (detail || detailDrag.current)) {
          detailController.end(event)
          return
        }
        if (!detail && mainController) {
          mainController.end(event)
          return
        }
        const end = point(event),
          from = start.current
        start.current = null
        if (!end || !from || overlay) return
        const direction = swipeDirection(from, end)
        if (!direction) return
        event.stopPropagation()
        if (detail) {
          if (direction < 0) void nativeBack()
          else nativeForward()
          return
        }
        if (direction > 0 && nativeForward()) return
        const next = target + direction
        if (next >= 0 && next < nativeSections.length)
          void switchNativeSection(nativeSections[next]!, tournamentId, direction)
      },
    },
  }
}
export function useNativeDetailHistory() {
  const [value, setValue] = useState(readNativeHistory)
  useEffect(() => {
    const changed = () => setValue(readNativeHistory())
    Taro.eventCenter.on(historyEvent, changed)
    return () => {
      Taro.eventCenter.off(historyEvent, changed)
    }
  }, [])
  return value
}
