import arrowUrl1 from '../../assets/login-art/cursors/default-32.png'
import arrowUrl2 from '../../assets/login-art/cursors/default-32@2x.png'
import ballUrl1 from '../../assets/login-art/cursors/football-28.png'
import ballUrl2 from '../../assets/login-art/cursors/football-28@2x.png'
import handUrl1 from '../../assets/login-art/cursors/hand-32.png'
import handUrl2 from '../../assets/login-art/cursors/hand-32@2x.png'
import textUrl1 from '../../assets/login-art/cursors/text-32.png'
import textUrl2 from '../../assets/login-art/cursors/text-32@2x.png'
import disabledUrl1 from '../../assets/login-art/cursors/disabled-32.png'
import disabledUrl2 from '../../assets/login-art/cursors/disabled-32@2x.png'
import busyUrl1 from '../../assets/login-art/cursors/busy-32.png'
import busyUrl2 from '../../assets/login-art/cursors/busy-32@2x.png'
import progressUrl1 from '../../assets/login-art/cursors/progress-32.png'
import progressUrl2 from '../../assets/login-art/cursors/progress-32@2x.png'
import moveUrl1 from '../../assets/login-art/cursors/move-32.png'
import moveUrl2 from '../../assets/login-art/cursors/move-32@2x.png'
import grabUrl1 from '../../assets/login-art/cursors/grab-32.png'
import grabUrl2 from '../../assets/login-art/cursors/grab-32@2x.png'
import grabbingUrl1 from '../../assets/login-art/cursors/grabbing-32.png'
import grabbingUrl2 from '../../assets/login-art/cursors/grabbing-32@2x.png'
import precisionUrl1 from '../../assets/login-art/cursors/precision-32.png'
import precisionUrl2 from '../../assets/login-art/cursors/precision-32@2x.png'
import resizeEwUrl1 from '../../assets/login-art/cursors/resize-ew-32.png'
import resizeEwUrl2 from '../../assets/login-art/cursors/resize-ew-32@2x.png'
import resizeNsUrl1 from '../../assets/login-art/cursors/resize-ns-32.png'
import resizeNsUrl2 from '../../assets/login-art/cursors/resize-ns-32@2x.png'
import resizeNwseUrl1 from '../../assets/login-art/cursors/resize-nwse-32.png'
import resizeNwseUrl2 from '../../assets/login-art/cursors/resize-nwse-32@2x.png'
import resizeNeswUrl1 from '../../assets/login-art/cursors/resize-nesw-32.png'
import resizeNeswUrl2 from '../../assets/login-art/cursors/resize-nesw-32@2x.png'
import helpUrl1 from '../../assets/login-art/cursors/help-32.png'
import helpUrl2 from '../../assets/login-art/cursors/help-32@2x.png'
import zoomInUrl1 from '../../assets/login-art/cursors/zoom-in-32.png'
import zoomInUrl2 from '../../assets/login-art/cursors/zoom-in-32@2x.png'
import zoomOutUrl1 from '../../assets/login-art/cursors/zoom-out-32.png'
import zoomOutUrl2 from '../../assets/login-art/cursors/zoom-out-32@2x.png'
import loadingRingUrl from '../../assets/login-art/cursors/loading-ring-animated.svg'
import { cursorMorphPath } from './morph.h5'

/**
 * Cursor images are pre-rasterised PNGs (4× supersampled, 1× and 2×) so Chrome never
 * nearest-neighbour scales an SVG cursor; that scaling caused the jagged edges on HiDPI screens.
 */
function art(one: string, two: string) {
  return { one, two }
}
const arrowUrl = art(arrowUrl1, arrowUrl2)
const ballUrl = art(ballUrl1, ballUrl2)
const handUrl = art(handUrl1, handUrl2)
const textUrl = art(textUrl1, textUrl2)
const disabledUrl = art(disabledUrl1, disabledUrl2)
const busyUrl = art(busyUrl1, busyUrl2)
const progressUrl = art(progressUrl1, progressUrl2)
const moveUrl = art(moveUrl1, moveUrl2)
const grabUrl = art(grabUrl1, grabUrl2)
const grabbingUrl = art(grabbingUrl1, grabbingUrl2)
const precisionUrl = art(precisionUrl1, precisionUrl2)
const resizeEwUrl = art(resizeEwUrl1, resizeEwUrl2)
const resizeNsUrl = art(resizeNsUrl1, resizeNsUrl2)
const resizeNwseUrl = art(resizeNwseUrl1, resizeNwseUrl2)
const resizeNeswUrl = art(resizeNeswUrl1, resizeNeswUrl2)
const helpUrl = art(helpUrl1, helpUrl2)
const zoomInUrl = art(zoomInUrl1, zoomInUrl2)
const zoomOutUrl = art(zoomOutUrl1, zoomOutUrl2)

/** Plain url() first for older engines, then a resolution-aware image-set that wins where supported. */
function cursorRule(
  selector: string,
  image: { one: string; two: string },
  hotspot: string,
  fallback: string,
  important = '',
) {
  return `${selector} { cursor: url("${image.one}") ${hotspot}, ${fallback}${important}; cursor: -webkit-image-set(url("${image.one}") 1x, url("${image.two}") 2x) ${hotspot}, ${fallback}${important}; cursor: image-set(url("${image.one}") 1x, url("${image.two}") 2x) ${hotspot}, ${fallback}${important}; }`
}

const skins = {
  default: { url: arrowUrl, hotspot: '2 2', fallback: 'default' },
  football: { url: ballUrl, hotspot: '14 14', fallback: 'default' },
  hand: { url: handUrl, hotspot: '12 4', fallback: 'pointer' },
  text: { url: textUrl, hotspot: '16 16', fallback: 'text' },
  disabled: { url: disabledUrl, hotspot: '16 16', fallback: 'not-allowed' },
  busy: { url: busyUrl, hotspot: '16 16', fallback: 'wait' },
  progress: { url: progressUrl, hotspot: '2 2', fallback: 'progress' },
  move: { url: moveUrl, hotspot: '16 16', fallback: 'move' },
  grab: { url: grabUrl, hotspot: '16 16', fallback: 'grab' },
  grabbing: { url: grabbingUrl, hotspot: '16 16', fallback: 'grabbing' },
  precision: { url: precisionUrl, hotspot: '16 16', fallback: 'crosshair' },
  'resize-ew': { url: resizeEwUrl, hotspot: '16 16', fallback: 'ew-resize' },
  'resize-ns': { url: resizeNsUrl, hotspot: '16 16', fallback: 'ns-resize' },
  'resize-nwse': { url: resizeNwseUrl, hotspot: '16 16', fallback: 'nwse-resize' },
  'resize-nesw': { url: resizeNeswUrl, hotspot: '16 16', fallback: 'nesw-resize' },
  help: { url: helpUrl, hotspot: '2 2', fallback: 'help' },
  'zoom-in': { url: zoomInUrl, hotspot: '13 13', fallback: 'zoom-in' },
  'zoom-out': { url: zoomOutUrl, hotspot: '13 13', fallback: 'zoom-out' },
} as const
type Skin = keyof typeof skins | null
const nativeSkins: Record<string, Exclude<Skin, null>> = {
  'not-allowed': 'disabled',
  'no-drop': 'disabled',
  wait: 'busy',
  progress: 'progress',
  move: 'move',
  'all-scroll': 'move',
  grab: 'grab',
  grabbing: 'grabbing',
  crosshair: 'precision',
  'ew-resize': 'resize-ew',
  'e-resize': 'resize-ew',
  'w-resize': 'resize-ew',
  'col-resize': 'resize-ew',
  'ns-resize': 'resize-ns',
  'n-resize': 'resize-ns',
  's-resize': 'resize-ns',
  'row-resize': 'resize-ns',
  'nwse-resize': 'resize-nwse',
  'nw-resize': 'resize-nwse',
  'se-resize': 'resize-nwse',
  'nesw-resize': 'resize-nesw',
  'ne-resize': 'resize-nesw',
  'sw-resize': 'resize-nesw',
  help: 'help',
  'zoom-in': 'zoom-in',
  'zoom-out': 'zoom-out',
}
type Zone = 'art' | 'form' | null
const ATTRIBUTE = 'data-xq-cursor'
const DURATION = 280

/** Native cursors at rest; only the login morph and busy ring use a temporary overlay. */
export function mountCursorSkin(): () => void {
  const root = document.documentElement
  const precisePointer = window.matchMedia(
    '(min-width: 1024px) and (hover: hover) and (pointer: fine)',
  )
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
  const style = document.createElement('style')
  style.dataset.xqCursorStyles = ''
  // Raw H5 CSS keeps native element names out of Taro's stylesheet transform.
  style.textContent = `
    ${cursorRule('html.xq-cursor-skin', arrowUrl, '2 2', 'default')}
    ${cursorRule('html.xq-cursor-skin :disabled', disabledUrl, '16 16', 'not-allowed', ' !important')}
    ${Object.entries(skins)
      .map(([name, skin]) =>
        cursorRule(
          `html.xq-cursor-skin [${ATTRIBUTE}="${name}"]`,
          skin.url,
          skin.hotspot,
          skin.fallback,
          ' !important',
        ),
      )
      .join('\n')}
    html.xq-cursor-skin.xq-cursor-morphing,
    html.xq-cursor-skin.xq-cursor-morphing * { cursor: none !important; }
    #xq-cursor-morph { position: fixed; left: 0; top: 0; width: 72px; height: 72px;
      margin: 0; padding: 0; pointer-events: none; z-index: 2147483647; display: none; }
    #xq-cursor-morph svg { display: block; width: 72px; height: 72px; overflow: visible; }
    html.xq-cursor-skin.xq-cursor-loading,
    html.xq-cursor-skin.xq-cursor-loading * { cursor: none !important; }
    #xq-cursor-loading { position: fixed; left: 0; top: 0; width: 48px; height: 40px;
      pointer-events: none; z-index: 2147483647; display: none; }
    #xq-cursor-loading .xq-loading-arrow { display: none; width: 32px; height: 32px; }
    #xq-cursor-loading .xq-loading-ring { position: absolute; left: 0; top: 0;
      width: 32px; height: 32px; }
    #xq-cursor-loading .xq-loading-ring img { display: block; width: 100%; height: 100%; }
    #xq-cursor-loading[data-skin="progress"] .xq-loading-arrow { display: block; }
    #xq-cursor-loading[data-skin="progress"] .xq-loading-ring {
      left: 23px; top: 15px; width: 23px; height: 23px; }
  `
  document.head.append(style)
  const overlay = document.createElement('div')
  overlay.id = 'xq-cursor-morph'
  overlay.setAttribute('aria-hidden', 'true')
  // Static internal SVG; no user content is interpolated here.
  overlay.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-30 -30 72 72">
    <path data-outline fill="#e4ede5" stroke="#173f35" stroke-linecap="round" stroke-linejoin="round"/>
    <image data-arrow href="${arrowUrl2}" x="-2" y="-2" width="32" height="32"/>
    <g data-seams fill="none" stroke="#173f35" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round">
      <path d="M0-4.3 4.05-1.35 2.5 3.3h-5l-1.55-4.65Z"/>
      <path d="M0-4.3v-6.2m4.05 9.15 5.55-1.85m-7.1 6.5 3.7 5.2m-8.7-5.2-3.7 5.2m2.15-9.85L-9.6-3.2"/>
    </g></svg>`
  document.body.append(overlay)
  const loading = document.createElement('div')
  loading.id = 'xq-cursor-loading'
  loading.setAttribute('aria-hidden', 'true')
  const loadingArrow = new Image()
  loadingArrow.className = 'xq-loading-arrow'
  loadingArrow.src = arrowUrl1
  loadingArrow.alt = ''
  const ringBox = document.createElement('div')
  ringBox.className = 'xq-loading-ring'
  const ring = new Image()
  ring.alt = ''
  ringBox.append(ring)
  loading.append(loadingArrow, ringBox)
  document.body.append(loading)
  const outline = overlay.querySelector<SVGPathElement>('[data-outline]')!
  const originalArrow = overlay.querySelector<SVGImageElement>('[data-arrow]')!
  const seams = overlay.querySelector<SVGGElement>('[data-seams]')!
  let target: Element | null = null
  let zone: Zone = null
  let amount = 0
  let frame = 0
  let startTime = 0
  let from = 0
  let goal = 0
  let duration = DURATION
  let refreshFrame = 0
  let pointerX = 0
  let pointerY = 0
  let pressed = false

  function finishLoading() {
    loading.style.display = 'none'
    root.classList.remove('xq-cursor-loading')
  }

  function positionLoading() {
    const offset = loading.dataset.skin === 'busy' ? 16 : 2
    loading.style.transform = `translate3d(${pointerX - offset}px,${pointerY - offset}px,0)`
  }

  function showLoading(skin: Skin) {
    if (
      (skin !== 'busy' && skin !== 'progress') ||
      reducedMotion.matches ||
      !ring.complete ||
      !ring.naturalWidth ||
      (skin === 'progress' && (!loadingArrow.complete || !loadingArrow.naturalWidth))
    ) {
      finishLoading()
      return
    }
    loading.dataset.skin = skin
    positionLoading()
    loading.style.display = 'block'
    root.classList.add('xq-cursor-loading')
  }

  function finishMorph() {
    window.cancelAnimationFrame(frame)
    frame = 0
    overlay.style.display = 'none'
    root.classList.remove('xq-cursor-morphing')
  }

  function clearHover() {
    window.cancelAnimationFrame(refreshFrame)
    refreshFrame = 0
    target?.removeAttribute(ATTRIBUTE)
    target = null
    zone = null
    finishMorph()
    finishLoading()
  }

  function paint(value: number) {
    amount = value
    outline.setAttribute('d', cursorMorphPath(value))
    outline.setAttribute('stroke-width', String(2.4 - value * 1.3))
    outline.setAttribute('fill-opacity', String(1 - value))
    outline.setAttribute('opacity', String(Math.min(1, value * 3)))
    originalArrow.setAttribute('opacity', String(Math.max(0, 1 - value * 2.5)))
    seams.setAttribute('opacity', String(Math.max(0, (value - 0.2) / 0.8)))
    overlay.dataset.progress = value.toFixed(3)
  }

  function position(x: number, y: number) {
    // SVG origin is the true click point: arrow tip or football center.
    overlay.style.transform = `translate3d(${x - 30}px,${y - 30}px,0)`
  }

  function animate(now: number) {
    const t = Math.min(1, (now - startTime) / duration)
    const eased = t * t * (3 - 2 * t)
    paint(from + (goal - from) * eased)
    if (t < 1) frame = window.requestAnimationFrame(animate)
    else finishMorph()
  }

  function morph(next: number, x: number, y: number) {
    const continuing = frame !== 0
    window.cancelAnimationFrame(frame)
    from = continuing ? amount : 1 - next
    goal = next
    duration = Math.max(100, DURATION * Math.abs(goal - from))
    startTime = performance.now()
    position(x, y)
    paint(from)
    overlay.style.display = 'block'
    root.classList.add('xq-cursor-morphing')
    overlay.dataset.direction = next === 1 ? 'arrow-to-football' : 'football-to-arrow'
    frame = window.requestAnimationFrame(animate)
  }

  function classify(element: Element): Skin {
    if (element.closest('[aria-busy="true"]')) return 'progress'
    if (element.closest(':disabled, [disabled], [aria-disabled="true"], .weui-btn_disabled'))
      return 'disabled'
    if (element.closest('.art-login__left')) return 'football'
    const cursor = window.getComputedStyle(element).cursor
    if (nativeSkins[cursor]) return nativeSkins[cursor]
    if (
      ![
        'auto',
        'default',
        'inherit',
        'initial',
        'unset',
        'pointer',
        'text',
        'vertical-text',
      ].includes(cursor) &&
      !cursor.includes('url(')
    )
      return null
    // Sliders are dragged, not typed into: use the grab/grabbing skin instead of the I-beam.
    if (element.closest('input[type="range"]')) return pressed ? 'grabbing' : 'grab'
    if (
      element.closest(
        'input[type="file"], input[type="checkbox"], input[type="radio"], input[type="color"], input[type="button"], input[type="submit"], input[type="reset"]',
      )
    )
      return 'hand'
    if (element.closest('input, textarea, [contenteditable="true"], .weui-input, .weui-textarea'))
      return 'text'
    if (element.closest('button, a[href], select, [role="button"], taro-button-core')) return 'hand'
    if (cursor === 'pointer') return 'hand'
    if (cursor === 'text' || cursor === 'vertical-text') return 'text'
    if (cursor === 'not-allowed') return 'disabled'
    return 'default'
  }

  function hover(event: PointerEvent) {
    if (
      !precisePointer.matches ||
      event.pointerType !== 'mouse' ||
      !(event.target instanceof Element)
    )
      return
    pointerX = event.clientX
    pointerY = event.clientY
    applyHover(event.target)
  }

  function applyHover(element: Element, force = false) {
    if (target === element && !force) return
    target?.removeAttribute(ATTRIBUTE)
    // Inspect existing CSS before applying the skin; clickable Taro Views keep
    // their pointer semantics without changing every page or modal component.
    // The temporary cursor:none must not hide the underlying semantic cursor
    // when the pointer enters another element during the same morph.
    const morphing = root.classList.contains('xq-cursor-morphing')
    const spinning = root.classList.contains('xq-cursor-loading')
    if (morphing) root.classList.remove('xq-cursor-morphing')
    if (spinning) root.classList.remove('xq-cursor-loading')
    const skin = classify(element)
    if (morphing) root.classList.add('xq-cursor-morphing')
    if (spinning) root.classList.add('xq-cursor-loading')
    target = element
    if (skin) element.setAttribute(ATTRIBUTE, skin)
    showLoading(skin)
    const nextZone: Zone = element.closest('.art-login__left')
      ? 'art'
      : element.closest('.art-login__panel')
        ? 'form'
        : null
    const crossing = zone !== null && nextZone !== null && zone !== nextZone
    if (crossing && (skin === 'default' || skin === 'football') && !reducedMotion.matches) {
      morph(nextZone === 'art' ? 1 : 0, pointerX, pointerY)
    } else if (nextZone === null || (skin !== 'default' && skin !== 'football')) {
      finishMorph()
    }
    zone = nextZone
  }

  function move(event: PointerEvent) {
    hover(event)
    if (frame) position(event.clientX, event.clientY)
    if (root.classList.contains('xq-cursor-loading')) positionLoading()
  }

  function leave(event: PointerEvent) {
    if (event.relatedTarget === null) clearHover()
  }

  function visibility() {
    if (document.hidden) clearHover()
  }

  function syncPointer() {
    clearHover()
    root.classList.toggle('xq-cursor-skin', precisePointer.matches)
  }

  function refreshMotion() {
    finishMorph()
    if (target?.isConnected) applyHover(target, true)
  }

  ring.onload = () => {
    if (target?.isConnected) applyHover(target, true)
  }
  ring.onerror = finishLoading
  loadingArrow.onload = () => {
    if (target?.isConnected) applyHover(target, true)
  }
  loadingArrow.onerror = finishLoading
  ring.src = loadingRingUrl

  function refreshAfterInteraction(event: PointerEvent) {
    if (!precisePointer.matches || event.pointerType !== 'mouse') return
    pressed = event.type === 'pointerdown'
    window.cancelAnimationFrame(refreshFrame)
    refreshFrame = window.requestAnimationFrame(() => {
      refreshFrame = 0
      if (target?.isConnected) applyHover(target, true)
    })
  }
  // A hovered button can become disabled or busy without pointer movement.
  const semanticObserver = new MutationObserver((records) => {
    if (!target || !precisePointer.matches) return
    if (!target.isConnected) {
      clearHover()
      return
    }
    if (
      records.some(
        (record) =>
          record.target instanceof Element &&
          record.target !== root &&
          record.target.contains(target),
      )
    )
      applyHover(target, true)
  })
  semanticObserver.observe(document.body, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ['disabled', 'aria-disabled', 'aria-busy', 'class', 'style'],
  })

  precisePointer.addEventListener('change', syncPointer)
  reducedMotion.addEventListener('change', refreshMotion)
  document.addEventListener('pointerover', hover, true)
  document.addEventListener('pointermove', move, true)
  document.addEventListener('pointerout', leave, true)
  document.addEventListener('pointerdown', refreshAfterInteraction, true)
  document.addEventListener('pointerup', refreshAfterInteraction, true)
  document.addEventListener('visibilitychange', visibility)
  window.addEventListener('blur', clearHover)
  window.addEventListener('hashchange', clearHover)
  window.addEventListener('popstate', clearHover)
  window.addEventListener('scroll', clearHover, true)
  syncPointer()

  return () => {
    clearHover()
    root.classList.remove('xq-cursor-skin')
    precisePointer.removeEventListener('change', syncPointer)
    reducedMotion.removeEventListener('change', refreshMotion)
    document.removeEventListener('pointerover', hover, true)
    document.removeEventListener('pointermove', move, true)
    document.removeEventListener('pointerout', leave, true)
    document.removeEventListener('pointerdown', refreshAfterInteraction, true)
    document.removeEventListener('pointerup', refreshAfterInteraction, true)
    document.removeEventListener('visibilitychange', visibility)
    window.removeEventListener('blur', clearHover)
    window.removeEventListener('hashchange', clearHover)
    window.removeEventListener('popstate', clearHover)
    window.removeEventListener('scroll', clearHover, true)
    overlay.remove()
    ring.onload = ring.onerror = loadingArrow.onload = loadingArrow.onerror = null
    loading.remove()
    style.remove()
    semanticObserver.disconnect()
  }
}
