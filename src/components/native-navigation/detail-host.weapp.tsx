import '../public-shell/index.scss'
import './navigation.weapp.scss'
import { RootPortal, View } from '@tarojs/components'
import Taro, { useDidHide, useDidShow } from '@tarojs/taro'
import {
  forwardRef,
  memo,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from 'react'
import {
  canDragNativeDetail,
  nativeTouchPoint,
  readNativeHistory,
  readNativeSwipeClaim,
  registerNativeDetailController,
  saveDetailScroll,
  stepNativeDetail,
  useNativeDetailHistory,
} from '../../features/native-navigation/index.weapp'
import {
  NativeDetailActiveContext,
  NativeDetailEntryContext,
} from '../../features/native-navigation/detail-context.weapp'
import {
  indicatorPosition,
  type DetailEntry,
} from '../../features/native-navigation/history.logic.weapp'
import NativeTeamDetail from '../../pages/readonly-team-detail/screen.weapp'
import NativePlayerDetail from '../../pages/player-detail/screen.weapp'
import NativeMatchDetail from '../../pages/readonly-match-detail/screen.weapp'
import NativePostDetail from '../../pages/post-detail/screen.weapp'
import NativeTeamManage from '../../pages/team-manage/screen.weapp'
import NativePersonDetail from '../../pages/person-detail/screen.weapp'
import NativeMessages from '../../pages/messages/screen.weapp'
import NativeCompose from '../../pages/compose/screen.weapp'
import NativeFavorites from '../../pages/favorites/screen.weapp'
import {
  NativeRefreshScope,
  NativeRefreshScroll,
} from '../../features/product/native-refresh.weapp'

type TrackHandle = { position: (value: number, duration: number) => void }
const DetailTrack = forwardRef<TrackHandle, PropsWithChildren>(function DetailTrack(
  { children },
  ref,
) {
  const [frame, setFrame] = useState({ position: -1, duration: 0 })
  useImperativeHandle(
    ref,
    () => ({ position: (position, duration) => setFrame({ position, duration }) }),
    [],
  )
  return (
    <View
      className="native-detail-track"
      style={`transform:translate3d(${-frame.position * 100}%,0,0);transition-duration:${frame.duration}ms;`}
    >
      {children}
    </View>
  )
})
const DetailScene = memo(NativeDetailScene)
export function NativeDetailHost() {
  const history = useNativeDetailHistory(),
    [visible, setVisible] = useState(true),
    [dragging, setDragging] = useState(false)
  const track = useRef<TrackHandle>(null),
    current = useRef(history),
    alive = useRef(true)
  current.current = history
  const motion = useRef({ from: -1, to: -1, at: 0, duration: 0 })
  const present = () => indicatorPosition(motion.current, Date.now())
  const animate = (to: number) => {
    const from = present(),
      duration = Math.max(110, Math.min(230, Math.abs(to - from) * 230))
    motion.current = { from, to, at: Date.now(), duration }
    track.current?.position(from, 0)
    setDragging(false)
    Taro.nextTick(() => {
      if (alive.current)
        track.current?.position(to, Math.max(0, motion.current.at + duration - Date.now()))
    })
  }
  const latest = useRef({ animate })
  latest.current = { animate }
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
  useDidShow(() => setVisible(true))
  useDidHide(() => setVisible(false))
  useEffect(() => {
    gesture.current = null
    if (!history.entries.length) {
      motion.current = { from: -1, to: -1, at: 0, duration: 0 }
      track.current?.position(-1, 0)
      setDragging(false)
    } else latest.current.animate(history.cursor)
  }, [history.cursor, history.entries])
  useEffect(() => {
    alive.current = true
    const cancel = () => {
      if (gesture.current?.horizontal) latest.current.animate(current.current.cursor)
      gesture.current = null
    }
    const unregister = registerNativeDetailController({
      start: (event) => {
        const point = nativeTouchPoint(event)
        gesture.current =
          point && canDragNativeDetail() && current.current.entries.length
            ? {
                point,
                position: present(),
                lastX: point.x,
                lastAt: point.at,
                velocity: 0,
                horizontal: false,
                vertical: false,
                claim: readNativeSwipeClaim(event),
              }
            : null
      },
      move: (event) => {
        const state = gesture.current,
          point = nativeTouchPoint(event)
        if (!state || !point || state.vertical) return false
        if (!canDragNativeDetail()) {
          cancel()
          return false
        }
        const dx = point.x - state.point.x,
          dy = point.y - state.point.y,
          width = Taro.getWindowInfo().windowWidth
        if (!state.horizontal) {
          if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) {
            state.vertical = true
            return false
          }
          if (Math.abs(dx) < 8 || Math.abs(dx) < Math.abs(dy) * 1.5) return false
          if (current.current.cursor < 0 && dx > 0 && present() <= -0.999) return false
          const nested = state.claim,
            direction = dx < 0 ? 1 : -1,
            edge = state.point.x < 28 || state.point.x > width - 28
          if (
            !edge &&
            nested &&
            nested.index + direction >= 0 &&
            nested.index + direction < nested.count
          )
            return false
          state.horizontal = true
          state.position = present()
          setDragging(true)
        }
        const last = current.current.entries.length - 1,
          raw = state.position - dx / width
        const value =
          raw < -1 ? -1 + (raw + 1) * 0.14 : raw > last ? last + (raw - last) * 0.14 : raw
        state.velocity = -(point.x - state.lastX) / Math.max(1, point.at - state.lastAt)
        state.lastX = point.x
        state.lastAt = point.at
        motion.current = { from: value, to: value, at: Date.now(), duration: 0 }
        track.current?.position(value, 0)
        return true
      },
      end: (event) => {
        const state = gesture.current,
          point = nativeTouchPoint(event)
        gesture.current = null
        if (!state?.horizontal || !point) return
        event.stopPropagation()
        const cursor = current.current.cursor,
          velocity = point.at - state.lastAt < 100 ? state.velocity : 0
        const projected = present() + (velocity * 140) / Taro.getWindowInfo().windowWidth
        const target = Math.max(
          -1,
          Math.min(
            current.current.entries.length - 1,
            Math.max(cursor - 1, Math.min(cursor + 1, Math.round(projected))),
          ),
        )
        if (target === cursor) latest.current.animate(cursor)
        else
          void stepNativeDetail(target > cursor ? 1 : -1).then((moved) => {
            if (!moved) latest.current.animate(readNativeHistory().cursor)
          })
      },
      cancel,
    })
    return () => {
      alive.current = false
      unregister()
    }
  }, [])
  const scenes = useMemo(
    () =>
      history.entries.map((entry, index) =>
        Math.abs(index - history.cursor) <= 1 ? (
          <DetailScene
            key={entry.id}
            entry={entry}
            index={index}
            active={index === history.cursor}
            dragging={dragging}
          />
        ) : null,
      ),
    [history.entries, history.cursor, dragging],
  )
  if (!history.entries.length) return null
  return (
    <RootPortal>
      <View
        className="native-detail-host"
        style={`display:${visible ? 'block' : 'none'};pointer-events:${history.cursor >= 0 || dragging ? 'auto' : 'none'};`}
      >
        <DetailTrack ref={track}>{scenes}</DetailTrack>
      </View>
    </RootPortal>
  )
}
function NativeDetailScene({
  entry,
  index,
  active,
  dragging,
}: {
  entry: DetailEntry
  index: number
  active: boolean
  dragging: boolean
}) {
  const [top, setTop] = useState(entry.scroll)
  useEffect(() => {
    const reset = () => {
      if (readNativeHistory().entries[readNativeHistory().cursor]?.id !== entry.id) return
      setTop(entry.scroll)
      Taro.nextTick(() => {
        entry.scroll = 0
        setTop(0)
      })
    }
    Taro.eventCenter.on('xiaoqiu:native-detail-top', reset)
    return () => {
      Taro.eventCenter.off('xiaoqiu:native-detail-top', reset)
    }
  }, [entry])
  const [path, query = ''] = entry.url.split('?'),
    params = Object.fromEntries(
      query
        .split('&')
        .filter(Boolean)
        .map((item) => {
          const [k, v = ''] = item.split('=')
          return [k!, decodeURIComponent(v)]
        }),
    )
  const fullScreen =
    path?.includes('/messages/') || path?.includes('/compose/') || path?.includes('/favorites/')
  const page = path?.includes('/favorites/') ? (
    <NativeFavorites />
  ) : path?.includes('/messages/') ? (
    <NativeMessages
      conversationId={params.conversationId}
      userId={params.userId}
      notificationId={params.notificationId}
      new={params.new}
    />
  ) : path?.includes('/compose/') ? (
    <NativeCompose
      tournamentId={params.tournamentId}
      teamId={params.teamId}
      quotePostId={params.quotePostId}
    />
  ) : path?.includes('/team-manage/') ? (
    <NativeTeamManage teamId={params.teamId} tournamentId={params.tournamentId} />
  ) : path?.includes('/readonly-team-detail/') ? (
    <NativeTeamDetail teamId={params.teamId} tournamentId={params.tournamentId} />
  ) : path?.includes('/player-detail/') ? (
    <NativePlayerDetail playerId={params.playerId} tournamentId={params.tournamentId} />
  ) : path?.includes('/person-detail/') ? (
    <NativePersonDetail userId={params.userId} tournamentId={params.tournamentId} />
  ) : path?.includes('/readonly-match-detail/') ? (
    <NativeMatchDetail matchId={params.matchId} />
  ) : (
    <NativePostDetail postId={params.postId} />
  )
  return (
    <View
      className="native-detail-layer"
      style={`left:${index * 100}%;pointer-events:${active ? 'auto' : 'none'};`}
      onTouchEnd={(event) => event.stopPropagation()}
    >
      {fullScreen ? (
        <NativeDetailEntryContext.Provider value={entry}>
          <NativeDetailActiveContext.Provider value={active}>
            {page}
          </NativeDetailActiveContext.Provider>
        </NativeDetailEntryContext.Provider>
      ) : (
        <NativeRefreshScope active={active && !dragging && !path?.includes('/team-manage/')}>
          <NativeRefreshScroll
            key={entry.id}
            className="native-detail-viewport"
            scrollY={!dragging}
            showScrollbar={false}
            enhanced
            scrollTop={top}
            onScroll={(event) => saveDetailScroll(event.detail.scrollTop, entry.id)}
          >
            <NativeDetailEntryContext.Provider value={entry}>
              <NativeDetailActiveContext.Provider value={active}>
                {page}
              </NativeDetailActiveContext.Provider>
            </NativeDetailEntryContext.Provider>
          </NativeRefreshScroll>
        </NativeRefreshScope>
      )}
    </View>
  )
}
