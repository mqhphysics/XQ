import type { CommonEvent, ITouchEvent } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useEffect, useRef, useState } from 'react'
import {
  dragFrame,
  dragShift,
  estimateRowRects,
  moveIndex,
  pickRowRects,
  rowSelectorCandidates,
  settleOffset,
  type DragRowRect,
} from './drag-sort.logic'
import './drag-sort.weapp.scss'

/**
 * Handle-only vertical drag-to-reorder for mini-program lists.
 *
 * const sort = useNativeDragSort({ items, onReorder, rowSelector: '.my-list .my-row' })
 * rows: <View ref={sort.rowRef(i)} className={`my-row ${sort.rowClassName(i)}`} style={sort.rowStyle(i)}>
 * handle (inside the row): <View className="native-drag-handle" {...sort.handleProps(i)} />
 *
 * Rows are measured once per drag. Every touchmove writes only the lifted row's transform
 * (one tiny style update, no React render, no throttle timer); React re-renders only when the
 * drop slot changes, on drop and on settle.
 * Haptics: medium on lift, light each time the row crosses another row.
 */
export interface NativeDragSortOptions<T> {
  items: readonly T[]
  onReorder: (next: T[], move: { from: number; to: number }) => void
  /** Selector matching every sortable row in render order, scoped to this list. */
  rowSelector: string
  disabled?: boolean
  /** Row pitch in px used only if the rows cannot be measured at all. */
  fallbackRowHeight?: number
}

interface DragState {
  from: number
  over: number
  offset: number
  settling: boolean
}

/** The Taro DOM node of a row; writing its style updates only that node. */
interface DragRowNode {
  style: { cssText: string }
}

const settleMs = 200,
  measureTimeoutMs = 400

const vibrate = (type: 'light' | 'medium') => {
  try {
    void Taro.vibrateShort({ type }).catch(() => {})
  } catch {
    /* haptics are optional */
  }
}

const liftedStyle = (offset: number) =>
  `transform:translate3d(0,${Math.round(offset * 2) / 2}px,0) scale(1.03);`

export function useNativeDragSort<T>({
  items,
  onReorder,
  rowSelector,
  disabled = false,
  fallbackRowHeight = 56,
}: NativeDragSortOptions<T>) {
  const [drag, setDrag] = useState<DragState | null>(null),
    [instant, setInstant] = useState(false)
  const live = useRef<{
    from: number
    over: number
    startY: number
    lastY: number
    offset: number
    rects: DragRowRect[]
  } | null>(null)
  const measured = useRef<DragRowRect[]>([])
  const nodes = useRef(new Map<number, DragRowNode>())
  const latest = useRef({ items, onReorder })
  latest.current = { items, onReorder }
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])
  const later = (work: () => void, ms: number) => {
    const timer = setTimeout(() => {
      timers.current = timers.current.filter((item) => item !== timer)
      work()
    }, ms)
    timers.current.push(timer)
    return timer
  }
  useEffect(
    () => () => {
      timers.current.forEach(clearTimeout)
      live.current = null
    },
    [],
  )
  /** Follows the finger with a direct style write; renders only when the drop slot changes. */
  const track = (force = false) => {
    const session = live.current
    if (!session || !session.rects.length) return
    const frame = dragFrame(session.rects, session.from, session.lastY - session.startY)
    if (frame.offset !== session.offset) {
      session.offset = frame.offset
      const node = nodes.current.get(session.from)
      if (node) node.style.cssText = liftedStyle(frame.offset)
    }
    const crossed = frame.over !== session.over
    if (crossed) {
      session.over = frame.over
      vibrate('light')
    }
    if (crossed || force)
      setDrag({
        from: session.from,
        over: frame.over,
        offset: frame.offset,
        settling: false,
      })
  }
  const measure = (index: number, y: number) => {
    let done = false
    const apply = (rects: DragRowRect[]) => {
      const session = live.current
      if (done || !session || session.from !== index) return
      done = true
      session.rects = rects
      measured.current = rects
      track(true)
    }
    const candidates = rowSelectorCandidates(rowSelector),
      count = latest.current.items.length
    /* Never let a stuck query leave the drag unable to drop: fall back to uniform slots. */
    const guard = later(() => {
      if (!done) apply(estimateRowRects(count, index, y, fallbackRowHeight))
    }, measureTimeoutMs)
    try {
      const query = Taro.createSelectorQuery()
      candidates.forEach((selector) => query.selectAll(selector).boundingClientRect())
      query.exec((result: unknown[]) => {
        clearTimeout(guard)
        const rects = pickRowRects(result, latest.current.items.length)
        if (rects) return apply(rects)
        const partial = (result ?? [])
          .flatMap((item) => (Array.isArray(item) ? (item as (DragRowRect | null)[]) : []))
          .find((rect) => !!rect?.height)
        apply(
          estimateRowRects(
            latest.current.items.length,
            index,
            y,
            partial?.height || fallbackRowHeight,
          ),
        )
      })
    } catch {
      clearTimeout(guard)
      apply(estimateRowRects(count, index, y, fallbackRowHeight))
    }
  }
  const start = (index: number, event: CommonEvent) => {
    event.stopPropagation()
    const y = touchY(event)
    if (disabled || live.current || drag || y === undefined || items.length < 2) return
    live.current = { from: index, over: index, startY: y, lastY: y, offset: 0, rects: [] }
    measured.current = []
    setInstant(false)
    setDrag({ from: index, over: index, offset: 0, settling: false })
    vibrate('medium')
    measure(index, y)
  }
  const move = (event: CommonEvent) => {
    event.stopPropagation()
    const session = live.current,
      y = touchY(event)
    if (!session || y === undefined) return
    session.lastY = y
    /* Until the rows are measured the offset cannot be clamped; the measure callback tracks. */
    track()
  }
  const end = (event: CommonEvent) => {
    event.stopPropagation()
    const session = live.current
    if (!session) return
    if (!session.rects.length)
      session.rects = estimateRowRects(
        latest.current.items.length,
        session.from,
        session.startY,
        fallbackRowHeight,
      )
    track()
    live.current = null
    const { from, over, rects } = session
    measured.current = rects
    setDrag({ from, over, offset: settleOffset(rects, from, over), settling: true })
    later(() => {
      setInstant(true)
      setDrag(null)
      if (from !== over)
        latest.current.onReorder(moveIndex(latest.current.items, from, over), { from, to: over })
      later(() => setInstant(false), 60)
    }, settleMs)
  }
  const rowClassName = (index: number) =>
    [
      drag ? 'native-drag-row is-drag-active' : 'native-drag-row',
      drag?.from === index ? 'is-drag-lifted' : '',
      drag?.settling ? 'is-drag-settling' : '',
      instant ? 'is-drag-instant' : '',
    ]
      .filter(Boolean)
      .join(' ')
  const rowStyle = (index: number) => {
    if (!drag) return ''
    if (drag.from === index)
      return drag.settling
        ? `transform:translate3d(0,${drag.offset}px,0) scale(1);`
        : liftedStyle(drag.offset)
    const shift = dragShift(measured.current, index, drag.from, drag.over)
    return shift ? `transform:translate3d(0,${shift}px,0);` : ''
  }
  return {
    /** Current drag (null when idle); `over` is the slot the row would drop into. */
    drag,
    rowRef: (index: number) => (node: DragRowNode | null) => {
      if (node) nodes.current.set(index, node)
      else nodes.current.delete(index)
    },
    rowClassName,
    rowStyle,
    handleProps: (index: number) => ({
      /* Keeps the list (and the main pager) from scrolling under a dragged row. */
      catchMove: true,
      onTouchStart: (event: CommonEvent) => start(index, event),
      onTouchMove: move,
      onTouchEnd: end,
      onTouchCancel: end,
    }),
  }
}

/** View's touch handlers are typed as CommonEvent; the payload is a touch event. */
function touchY(event: CommonEvent): number | undefined {
  return (event as unknown as ITouchEvent).touches?.[0]?.clientY
}
