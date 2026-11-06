import { Button, RootPortal, Text, View } from '@tarojs/components'
import Taro, { useDidHide, useDidShow } from '@tarojs/taro'
import { useEffect, useRef, useState } from 'react'
import { guideAccountRect, type GuideStep } from './flow.logic.weapp'
import { nativeHeaderMetrics } from '../../components/public-shell/native-header-metrics.weapp'
import './spotlight.weapp.scss'
type Rect = { left: number; top: number; width: number; height: number }
type Insets = { top: number; bottom: number }
/** idle: boxes on their targets; leaving: rising/fading before a page switch; entering: parked above the new targets for one frame so they slide down into place. */
type Motion = 'idle' | 'leaving' | 'entering'

const padding = 6,
  gap = 30,
  sampleDelay = 50,
  maxSamples = 50,
  /* Steps with a known fallback position stop waiting sooner. */
  fallbackSamples = 16,
  pausePoll = 450,
  watchDelay = 800,
  /* Mask/ring transitions last 0.36s; a tap inside this window snaps instead of queueing. */
  settleWindow = 380,
  /* Page switches: the box rises this far while it fades out, and drops in from the same height. */
  travel = 48,
  /* The exit plays at least this long before the box drops onto the new page. */
  leaveMin = 260,
  /* After a page-changing tap, how long to wait before deciding the step did not change. */
  restoreDelay = 200

/** Shared page states that mean the target cannot appear until the page finishes loading. */
const failureSelector = '.native-failure',
  loadingSelector = '.native-loading-state',
  scopedRoots = ['.native-dialog', '.native-detail-host', '.native-main-root']

/** Status bar / capsule at the top and the home indicator at the bottom stay clear of the card. */
function safeInsets(window: ReturnType<typeof Taro.getWindowInfo>): Insets {
  let top = (window.statusBarHeight || 20) + 44
  try {
    const capsule = Taro.getMenuButtonBoundingClientRect()
    if (capsule?.bottom) top = capsule.bottom + 6
  } catch {
    /* The capsule is optional on desktop and in tests. */
  }
  const bottom = window.safeArea?.bottom
    ? Math.max(0, window.windowHeight - window.safeArea.bottom)
    : 0
  return { top, bottom }
}

/**
 * Where a target sits when the page cannot report it, so its card still gets a frame and arrow.
 * The account avatar sits left in the phone header, or just left of the capsule on wide windows.
 */
function fallbackRect(stepId: string): Rect | null {
  if (stepId !== 'home-account') return null
  try {
    return guideAccountRect(nativeHeaderMetrics())
  } catch {
    return null
  }
}

function sameRect(a: Rect | null | undefined, b: Rect | null | undefined) {
  return (
    !!a &&
    !!b &&
    Math.abs(a.left - b.left) < 1 &&
    Math.abs(a.top - b.top) < 1 &&
    Math.abs(a.width - b.width) < 1 &&
    Math.abs(a.height - b.height) < 1
  )
}

function sameRects(a: readonly Rect[] | null, b: readonly Rect[]) {
  return !!a && a.length === b.length && a.every((rect, index) => sameRect(rect, b[index]))
}

function overlaps(a: Rect, b: Rect) {
  return (
    a.left < b.left + b.width &&
    b.left < a.left + a.width &&
    a.top < b.top + b.height &&
    b.top < a.top + a.height
  )
}

function union(boxes: readonly Rect[]): Rect {
  const left = Math.min(...boxes.map((box) => box.left)),
    top = Math.min(...boxes.map((box) => box.top)),
    right = Math.max(...boxes.map((box) => box.left + box.width)),
    bottom = Math.max(...boxes.map((box) => box.top + box.height))
  return { left, top, width: right - left, height: bottom - top }
}

/** Highlight boxes sorted top-down; boxes that share rows merge so the mask bands never overlap. */
function stackBoxes(boxes: readonly Rect[]): Rect[] {
  const sorted = [...boxes].sort((a, b) => a.top - b.top),
    stacked: Rect[] = []
  for (const box of sorted) {
    const last = stacked[stacked.length - 1]
    if (last && box.top < last.top + last.height) stacked[stacked.length - 1] = union([last, box])
    else stacked.push(box)
  }
  return stacked
}

/** Dimmed rectangles around one or more cutouts: full-width bands between them, sides beside them. */
function maskPieces(boxes: readonly Rect[], w: number, h: number): string[] {
  const pieces: string[] = []
  let edge = 0
  for (const box of boxes) {
    pieces.push(`left:0;top:${edge}px;width:${w}px;height:${Math.max(0, box.top - edge)}px;`)
    pieces.push(`left:0;top:${box.top}px;width:${box.left}px;height:${box.height}px;`)
    pieces.push(
      `left:${box.left + box.width}px;top:${box.top}px;width:${Math.max(0, w - box.left - box.width)}px;height:${box.height}px;`,
    )
    edge = box.top + box.height
  }
  pieces.push(`left:0;top:${edge}px;width:${w}px;height:${Math.max(0, h - edge)}px;`)
  return pieces
}

export function NativeGuideSpotlight({
  step,
  busy,
  onAction,
  onSkip,
}: {
  step: GuideStep
  busy: boolean
  onAction: () => Promise<void>
  onSkip: () => Promise<void>
}) {
  /* Same-page steps keep the previous boxes on screen while the next target is measured so the
     cutout glides; page switches rise and fade out first, then drop onto the new page. */
  const [rects, setRects] = useState<Rect[] | null>(null),
    [ready, setReady] = useState(false),
    [paused, setPaused] = useState<'failure' | 'loading' | null>(null),
    [instant, setInstant] = useState(false),
    [motion, setMotion] = useState<Motion>('idle'),
    [window, setWindow] = useState(() => Taro.getWindowInfo())
  const [visible, setVisible] = useState(true)
  useDidHide(() => setVisible(false))
  useDidShow(() => setVisible(true))
  const automatic = useRef<() => Promise<void>>(async () => {})
  useEffect(() => {
    if (!step.navigationTarget || !ready || busy || paused || motion !== 'idle' || !visible) return
    const timer = setTimeout(() => void automatic.current(), 8000)
    return () => clearTimeout(timer)
  }, [step.id, step.navigationTarget, ready, busy, paused, motion, visible])
  const readyAt = useRef(0),
    pending = useRef(false),
    skipping = useRef(false),
    /* When the current exit started (0: not leaving); instantRef mirrors `instant` for the loop. */
    leftAt = useRef(0),
    instantRef = useRef(false),
    stepId = useRef(step.id)
  instantRef.current = instant
  stepId.current = step.id
  const selectors = [step.selector, ...(step.also ?? [])].join('|')
  useEffect(() => {
    let alive = true,
      samples = 0,
      waiting = 0,
      settled = false,
      previous: Rect[] | null = null,
      timer: ReturnType<typeof setTimeout> | undefined,
      landing: ReturnType<typeof setTimeout> | undefined
    setReady(false)
    const { windowWidth: w, windowHeight: h } = Taro.getWindowInfo()
    /* Main tabs live in a swiper: a target counts only once its panel has slid fully in. */
    const inWindow = (bounds: Rect | null | undefined): bounds is Rect =>
      !!bounds &&
      bounds.width > 0 &&
      bounds.height > 0 &&
      bounds.left > -2 &&
      bounds.left + bounds.width < w + 2 &&
      bounds.top < h - 24 &&
      bounds.top + bounds.height > 24
    const settle = (values: Rect[] | null) => {
      if (!alive) return
      setPaused(null)
      const show = () => {
        if (!alive) return
        readyAt.current = Date.now()
        setMotion('idle')
        setReady(true)
      }
      const land = () => {
        if (!alive) return
        const dropping = !!leftAt.current && !!values && !instantRef.current
        leftAt.current = 0
        setRects(values)
        if (!dropping) return show()
        /* One frame parked above the new targets without transitions, then they slide down. */
        setMotion('entering')
        landing = setTimeout(show, 50)
      }
      const wait =
        leftAt.current && !instantRef.current
          ? Math.max(0, leaveMin - (Date.now() - leftAt.current))
          : 0
      if (wait) landing = setTimeout(land, wait)
      else land()
    }
    /* Targets in dialogs, the detail layer or the main pager sit behind Taro's custom-component
       boundary where a page-scoped query finds nothing; `>>>` from those roots reaches them.
       Each highlight group (`|`) is matched on its own and gets its own box. */
    const groups = selectors.split('|').map((selector) => {
      const parts = selector.split(',').map((part) => part.trim())
      return [
        selector,
        ...scopedRoots.flatMap((root) => parts.map((part) => `${root} >>> ${part}`)),
      ]
    })
    const candidates = groups.flat()
    const measure = () => {
      if (!alive) return
      const query = Taro.createSelectorQuery()
      for (const candidate of candidates) query.selectAll(candidate).boundingClientRect()
      query
        .selectAll(failureSelector)
        .boundingClientRect()
        .selectAll(loadingSelector)
        .boundingClientRect()
        .exec((result: unknown[]) => {
          if (!alive) return
          /* Several selectors (or a duplicated header) may match: use the first one on screen. */
          const count = candidates.length
          let offset = 0
          const found = groups.map((group) => {
            const matches = (result ?? [])
              .slice(offset, offset + group.length)
              .flatMap((value) => (Array.isArray(value) ? (value as Rect[]) : []))
              .filter(Boolean)
            offset += group.length
            return matches.find((item) => inWindow(item)) ?? matches[0] ?? null
          })
          const bounds = found[0] ?? null,
            visible = inWindow(bounds),
            /* Extra boxes are optional: only the ones on screen are framed with the main one. */
            all = visible ? [bounds, ...found.slice(1).filter(inWindow)] : [],
            /* A failure elsewhere on a working page (e.g. one card) does not stop the tour. */
            failed = ((result?.[count] ?? []) as Rect[]).some(
              (item) => inWindow(item) && (!visible || !bounds || overlaps(item, bounds)),
            ),
            loading = ((result?.[count + 1] ?? []) as Rect[]).some(inWindow)
          /* A failed page pauses the guide and hands taps back so 重新加载 stays usable. */
          if (failed) {
            previous = null
            samples = 0
            settled = false
            setPaused('failure')
            setReady(false)
            timer = setTimeout(measure, pausePoll)
            return
          }
          if (settled) {
            /* Already shown: keep a light watch in case the page drops into its failure state. */
            timer = setTimeout(measure, watchDelay)
            return
          }
          if (visible && sameRects(previous, all)) {
            settled = true
            settle(all)
            timer = setTimeout(measure, watchDelay)
            return
          }
          previous = visible ? all : null
          if (!visible && loading) {
            samples = 0
            if (++waiting >= 8) setPaused('loading')
            timer = setTimeout(measure, waiting >= 8 ? pausePoll : sampleDelay)
            return
          }
          waiting = 0
          const fallback = fallbackRect(step.id)
          if (++samples < (fallback ? fallbackSamples : maxSamples))
            timer = setTimeout(measure, sampleDelay)
          else {
            settled = true
            settle(fallback ? [fallback] : null)
            timer = setTimeout(measure, watchDelay)
          }
        })
    }
    timer = setTimeout(measure, 30)
    const resize = () => {
      setWindow(Taro.getWindowInfo())
      samples = 0
      settled = false
      previous = null
      if (timer) clearTimeout(timer)
      timer = setTimeout(measure, 30)
    }
    Taro.onWindowResize(resize)
    return () => {
      alive = false
      if (timer) clearTimeout(timer)
      if (landing) clearTimeout(landing)
      Taro.offWindowResize(resize)
    }
  }, [step.id, selectors])
  /* The snap lasts only for the jump to the next measured target, then normal pacing returns. */
  useEffect(() => {
    if (!instant || !ready) return
    const timer = setTimeout(() => setInstant(false), 60)
    return () => clearTimeout(timer)
  }, [instant, ready, rects])
  const advance = async () => {
    if (pending.current || skipping.current || busy) return
    /* Tapping during a transition finishes it at once instead of waiting for it to play out. */
    const snap = !ready || motion !== 'idle' || Date.now() - readyAt.current < settleWindow
    if (snap) setInstant(true)
    /* Leaving this page: the box rises and fades while the (possibly slow) switch runs, so it
       never sits framing nothing. A quick tap skips the exit and drops the cutout at once. */
    const leaving = step.action !== 'next' || step.button.startsWith('下一页')
    const from = step.id
    if (leaving && step.action !== 'finish') {
      leftAt.current = Date.now()
      if (snap) setRects(null)
      setMotion('leaving')
    }
    pending.current = true
    try {
      await onAction()
    } finally {
      pending.current = false
      /* The switch did not happen (e.g. it failed): bring the box back on the same target. The
         parent commits the next step a moment after onAction resolves, so check after a beat. */
      if (leaving && leftAt.current)
        setTimeout(() => {
          if (stepId.current !== from || !leftAt.current) return
          leftAt.current = 0
          setMotion('idle')
        }, restoreDelay)
    }
  }
  automatic.current = advance
  const skip = async (event?: { stopPropagation?: () => void }) => {
    event?.stopPropagation?.()
    if (skipping.current) return
    skipping.current = true
    try {
      await onSkip()
    } finally {
      skipping.current = false
    }
  }
  const w = window.windowWidth,
    h = window.windowHeight,
    insets = safeInsets(window)
  const boxes = rects?.length
    ? stackBoxes(
        rects.map((rect) => {
          const left = Math.max(4, rect.left - padding),
            top = Math.max(4, rect.top - padding),
            right = Math.min(w - 4, rect.left + rect.width + padding),
            bottom = Math.min(h - 4, rect.top + rect.height + padding)
          return { left, top, width: Math.max(0, right - left), height: Math.max(0, bottom - top) }
        }),
      )
    : null
  /* Leaving and entering draw each box collapsed a little above its target (see Motion). */
  const shown =
    boxes && motion !== 'idle'
      ? boxes.map((box) => ({ ...box, top: Math.max(0, box.top - travel), height: 0 }))
      : boxes
  const box = boxes ? union(boxes) : null
  const below = box ? h - insets.bottom - (box.top + box.height) : 0,
    above = box ? box.top - insets.top : 0,
    room = 250
  /* Card goes below the target, else above it, else floats over the bottom of a tall target. */
  const placement: 'below' | 'above' | 'inside' | 'center' = !box
    ? 'center'
    : below >= room + gap
      ? 'below'
      : above >= room + gap
        ? 'above'
        : 'inside'
  const cardStyle =
    placement === 'below' && box
      ? `top:${box.top + box.height + gap}px;`
      : placement === 'above' && box
        ? `bottom:${h - box.top + gap}px;`
        : placement === 'inside'
          ? `bottom:${insets.bottom + 18}px;`
          : 'top:50%;'
  /* On wide screens the card keeps a readable width and sits under its target. */
  const cardWidth = Math.min(w - 48, 460),
    cardLeft = box
      ? Math.round(
          Math.max(24, Math.min(w - 24 - cardWidth, box.left + box.width / 2 - cardWidth / 2)),
        )
      : Math.round((w - cardWidth) / 2)
  /* The arrow points at the box nearest the card. */
  const aim = boxes ? (placement === 'above' ? boxes[0]! : boxes[boxes.length - 1]!) : null
  const pointerX = aim ? Math.max(28, Math.min(w - 28, aim.left + aim.width / 2)) : 0
  const pointerStyle =
    placement === 'below' && box
      ? `left:${pointerX}px;top:${box.top + box.height + 4}px;`
      : placement === 'above' && box
        ? `left:${pointerX}px;top:${box.top - 16}px;`
        : ''
  const skipButton = (
    <Button
      className="native-guide__skip"
      hoverClass="is-pressed"
      onClick={(event) => void skip(event)}
    >
      跳过引导
    </Button>
  )
  /* Paused: no mask and no catchMove, so the page underneath scrolls and its buttons work. */
  if (paused)
    return (
      <RootPortal>
        <View className="native-guide is-paused" style={`height:${h}px;`}>
          <View
            className="native-guide__hint"
            style={`left:24px;width:${w - 48}px;top:${insets.top + 8}px;`}
            role="status"
          >
            <View className="native-guide__hint-dot" />
            <Text className="native-guide__hint-text">
              {paused === 'failure'
                ? '页面还没加载好，先点「重新加载」试试，加载后引导会自动继续'
                : '页面正在加载，稍等片刻引导会自动继续'}
            </Text>
            {skipButton}
          </View>
        </View>
      </RootPortal>
    )
  return (
    <RootPortal>
      <View
        className={`native-guide${ready ? ' is-ready' : ' is-pending'}${instant ? ' is-instant' : ''}${motion === 'idle' ? '' : ` is-${motion}`}`}
        style={`height:${h}px;`}
        catchMove
        onClick={() => void advance()}
      >
        {shown ? (
          <>
            {maskPieces(shown, w, h).map((style, index) => (
              <View key={`mask:${index}`} className="native-guide__mask" style={style} />
            ))}
            {shown.map((item, index) => (
              <View
                key={`ring:${index}`}
                className="native-guide__ring"
                style={`left:${item.left}px;top:${item.top}px;width:${item.width}px;height:${item.height}px;`}
              >
                {ready && <View key={step.id} className="native-guide__pulse" />}
              </View>
            ))}
            {/* Covers each cutout so a tap on a highlighted area also advances, not the page. */}
            {shown.map((item, index) => (
              <Button
                key={`target:${index}`}
                className="native-guide__target"
                aria-label={step.button}
                style={`left:${item.left}px;top:${item.top}px;width:${item.width}px;height:${item.height}px;`}
              />
            ))}
          </>
        ) : (
          <View className="native-guide__mask is-full" style="left:0;top:0;right:0;bottom:0;" />
        )}
        {/* Card and arrow fade together while the box leaves for another page. */}
        <View className="native-guide__layer">
          {ready && pointerStyle && (
            <View
              key={`pointer:${step.id}`}
              className={`native-guide__pointer${placement === 'above' ? ' is-down' : ''}`}
              style={pointerStyle}
            />
          )}
          {ready && (
            <View
              key={step.id}
              className={`native-guide__card native-guide__card--${placement}`}
              style={`left:${cardLeft}px;width:${cardWidth}px;${cardStyle}`}
              role="dialog"
              aria-label={step.title}
            >
              <View className="native-guide__meta">
                <Text className="native-guide__page">{step.page}</Text>
                {skipButton}
              </View>
              <Text className="native-guide__title">{step.title}</Text>
              <Text className="native-guide__body">{step.body}</Text>
              <View className="native-guide__tap">
                <View className="native-guide__tap-dot" />
                <Text>
                  {busy
                    ? '正在打开…'
                    : step.navigationTarget
                      ? '点击高亮导航进入 · 无操作8秒后继续'
                      : step.action === 'next'
                        ? '点击任意处继续'
                        : `点击任意处${step.button}`}
                </Text>
              </View>
            </View>
          )}
        </View>
      </View>
    </RootPortal>
  )
}

/** Asks before the tour starts: a tap anywhere starts it, 跳过引导 ends it for good. */
export function NativeGuidePrompt({
  onStart,
  onSkip,
}: {
  onStart: () => void
  onSkip: () => Promise<void>
}) {
  const [window] = useState(() => Taro.getWindowInfo())
  const done = useRef(false)
  const once = (run: () => unknown) => {
    if (done.current) return
    done.current = true
    void run()
  }
  const w = window.windowWidth,
    cardWidth = Math.min(w - 64, 400)
  return (
    <RootPortal>
      <View className="native-guide native-guide--prompt" catchMove onClick={() => once(onStart)}>
        {/* A light veil only: the loaded home page stays visible behind the question. */}
        <View className="native-guide__mask native-guide__mask--light is-full" style="inset:0;" />
        <View
          className="native-guide__card native-guide__card--center native-guide__prompt"
          style={`left:${Math.round((w - cardWidth) / 2)}px;width:${cardWidth}px;top:50%;`}
          role="dialog"
          aria-label="使用引导"
        >
          <Text className="native-guide__prompt-title">要不要花半分钟了解一下晓球？</Text>
          <View className="native-guide__tap">
            <View className="native-guide__tap-dot" />
            <Text>点击任意处开始</Text>
          </View>
          <Button
            className="native-guide__prompt-skip"
            hoverClass="is-pressed"
            onClick={(event) => {
              event.stopPropagation()
              once(onSkip)
            }}
          >
            跳过引导
          </Button>
        </View>
      </View>
    </RootPortal>
  )
}
