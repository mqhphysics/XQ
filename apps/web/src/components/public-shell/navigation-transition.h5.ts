import type { NavigationSection } from './navigation-transition.types'

import './page-motion.h5.scss'

interface TeamFocusState extends Keyframe {
  transform: string
  opacity: string
  strokeDashoffset?: string
}

interface NavigationOrigin {
  target: NavigationSection
  direction: number
  capturedAt: number
  selection: DOMRect
  lineOpacity: string
  arcOpacity: string
  crest: DOMRect | null
  crestOpacity: string
  teamFocus: Record<string, TeamFocusState>
  animate: boolean
}

const sections: NavigationSection[] = ['home', 'schedule', 'team', 'data', 'me']
const easing = 'cubic-bezier(0.22, 1, 0.36, 1)'
const focusEasing = 'cubic-bezier(0.22, 0.61, 0.36, 1)'
let origin: NavigationOrigin | null = null
const focusAnimations = new WeakMap<HTMLElement, Animation[]>()
const focusSelector = '.public-team-focus__stroke'

function readTeamFocus(element: Element): TeamFocusState {
  const style = getComputedStyle(element)
  return {
    transform: style.transform,
    opacity: style.opacity,
    strokeDashoffset: style.strokeDashoffset,
  }
}

function captureTeamFocus(shell: Element): Record<string, TeamFocusState> {
  return Object.fromEntries(
    Array.from(shell.querySelectorAll<Element>(focusSelector), (element) => [
      element.getAttribute('data-focus-key') ?? 'jewel',
      readTeamFocus(element),
    ]),
  )
}

function stopTeamFocus(shell: HTMLElement): void {
  focusAnimations.get(shell)?.forEach((animation) => animation.cancel())
  focusAnimations.delete(shell)
}

/** Set when 主队 is chosen away from the 主队 tab: the next landing there grows from the seed. */
let pendingTeamGrowth = false
export const PRIMARY_TEAM_SET_EVENT = 'xiaoqiu:primary-team-set'
/** Every 设为主队 (same or different team) announces itself so the stripe grows again. */
export function announcePrimaryTeamSet(): void {
  pendingTeamGrowth = true
  window.dispatchEvent(new CustomEvent(PRIMARY_TEAM_SET_EVENT))
}
export function consumeTeamGrowth(): boolean {
  const pending = pendingTeamGrowth
  pendingTeamGrowth = false
  return pending
}

export function playTeamFocus(
  shell: HTMLElement,
  initialFocus?: Record<string, TeamFocusState>,
): void {
  const button = shell.querySelector<HTMLElement>('.public-team-nav')
  const replayFocus = initialFocus ? {} : captureTeamFocus(button ?? shell)
  stopTeamFocus(shell)
  if (
    !button?.classList.contains('public-team-nav--active') ||
    !window.matchMedia('(min-width: 721px)').matches ||
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
    return

  const animations: Animation[] = []
  for (const line of button.querySelectorAll<SVGGElement>('.public-team-focus__line')) {
    const stroke = line.querySelector<SVGPathElement>('.public-team-focus__stroke')
    if (!stroke) continue
    const seed = line.querySelector<SVGPathElement>('.public-team-focus__trace')
    const seedFraction = seed ? Math.min(1, seed.getTotalLength() / stroke.getTotalLength()) : 0
    const start: Keyframe = { strokeDashoffset: String(1 - seedFraction), opacity: seed ? 0.28 : 0 }
    const finish: Keyframe = { strokeDashoffset: '0', opacity: 1 }
    const key = stroke.getAttribute('data-focus-key') ?? ''
    const previous = initialFocus?.[key]
    const frames: Keyframe[] = initialFocus
      ? [previous && parseFloat(previous.opacity) > 0.01 ? previous : start]
      : [replayFocus[key] ?? finish, { ...start, offset: 0.1 }]
    frames.push({ strokeDashoffset: '0.25', opacity: 1, offset: 0.65 }, finish)
    animations.push(
      stroke.animate(frames, {
        duration: Number(line.dataset.focusDuration) || 600,
        delay: Number(line.dataset.focusDelay) || 0,
        easing: focusEasing,
        fill: 'backwards',
      }),
    )
  }
  focusAnimations.set(shell, animations)
}
export function captureNavigationOrigin(shell: HTMLElement, target: NavigationSection): void {
  const selection = shell.querySelector<HTMLElement>('.public-nav__selection')
  const line = shell.querySelector<HTMLElement>('.public-nav__line')
  const arc = shell.querySelector<HTMLElement>('.public-nav__arc')
  if (!selection || !line || !arc || !window.matchMedia('(min-width: 721px)').matches) return
  const current = sections.find((section) =>
    shell.classList.contains(`public-app--section-${section}`),
  )
  const crest = shell.querySelector<HTMLElement>(
    '.public-team-nav > .team-crest, .public-team-nav__crest',
  )
  // Read the rendered position, including an interrupted animation, rather than a tab index.
  origin = {
    target,
    direction: Math.sign(sections.indexOf(target) - sections.indexOf(current ?? target)),
    capturedAt: Date.now(),
    selection: selection.getBoundingClientRect(),
    lineOpacity: getComputedStyle(line).opacity,
    arcOpacity: getComputedStyle(arc).opacity,
    crest: crest?.getBoundingClientRect() ?? null,
    crestOpacity: crest ? getComputedStyle(crest).opacity : '1',
    teamFocus: captureTeamFocus(shell),
    // Skip only for reduced-motion. Unrelated :focus-visible (dialogs/fields after
    // async nav) must not suppress the 主队 stroke entrance.
    animate: !window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  }
}

export function clearNavigationOrigin(): void {
  origin = null
}

export function animateNavigationEntrance(
  shell: HTMLElement,
  section: NavigationSection,
): () => void {
  // Taro H5 custom buttons need explicit keyboard focus and activation.
  const nav = shell.querySelector<HTMLElement>('.public-nav')
  nav?.querySelectorAll<HTMLElement>('.public-nav__item, .public-team-nav').forEach((button) => {
    button.setAttribute('role', 'button')
    button.tabIndex = 0
  })
  const onKeyDown = (event: KeyboardEvent) => {
    if (
      event.repeat ||
      event.altKey ||
      event.ctrlKey ||
      event.metaKey ||
      (event.key !== 'Enter' && event.key !== ' ')
    )
      return
    const button =
      event.target instanceof Element
        ? event.target.closest<HTMLElement>('.public-nav__item, .public-team-nav')
        : null
    if (!button) return
    event.preventDefault()
    button.click()
  }
  nav?.addEventListener('keydown', onKeyDown)
  const removeKeyboardListener = () => {
    nav?.removeEventListener('keydown', onKeyDown)
    stopTeamFocus(shell)
  }
  const previous = origin
  origin = null
  if (
    !previous ||
    previous.target !== section ||
    Date.now() - previous.capturedAt > 2000 ||
    !previous.animate ||
    window.matchMedia('(prefers-reduced-motion: reduce)').matches ||
    !window.matchMedia('(min-width: 721px)').matches
  ) {
    // Tab-cache revisits often drop/stale the nav origin; still replay the original
    // stroke draw when landing on 主队.
    if (section === 'team') playTeamFocus(shell, consumeTeamGrowth() ? {} : undefined)
    return removeKeyboardListener
  }

  const animations: Animation[] = []
  if (section === 'team') playTeamFocus(shell, consumeTeamGrowth() ? {} : previous.teamFocus)
  const animate = (element: Element | null, frames: Keyframe[], duration = 260) => {
    if (element?.animate) animations.push(element.animate(frames, { duration, easing }))
  }
  if (section !== 'team') {
    // Read every stroke first, then start the animations: interleaving reads with
    // element.animate() forced one style recalculation per stroke (hundreds of strokes,
    // ~170 ms of a tab switch). Strokes already at their resting state need no animation.
    const strokes = Array.from(
      shell.querySelectorAll<SVGPathElement | HTMLElement>(focusSelector),
      (element) => {
        const previousFocus = previous.teamFocus[element.getAttribute('data-focus-key') ?? 'jewel']
        return previousFocus ? { element, from: previousFocus, to: readTeamFocus(element) } : null
      },
    )
    for (const stroke of strokes) {
      if (!stroke) continue
      const { element, from, to } = stroke
      if (
        from.transform === to.transform &&
        from.opacity === to.opacity &&
        from.strokeDashoffset === to.strokeDashoffset
      )
        continue
      animate(element, [from, to], 420)
    }
  }
  const selection = shell.querySelector<HTMLElement>('.public-nav__selection')
  if (selection) {
    const target = selection.getBoundingClientRect()
    const transform = getComputedStyle(selection).transform
    animate(selection, [
      {
        transform: `translate(${previous.selection.left - target.left}px, ${previous.selection.top - target.top}px) ${transform}`,
      },
      { transform },
    ])
  }
  for (const [selector, opacity] of [
    ['.public-nav__line', previous.lineOpacity],
    ['.public-nav__arc', previous.arcOpacity],
  ] as const) {
    const element = shell.querySelector<HTMLElement>(selector)
    if (element) animate(element, [{ opacity }, { opacity: getComputedStyle(element).opacity }])
  }
  const crest = shell.querySelector<HTMLElement>(
    '.public-team-nav > .team-crest, .public-team-nav__crest',
  )
  if (crest && previous.crest) {
    const target = crest.getBoundingClientRect()
    if (target.width) {
      const style = getComputedStyle(crest)
      animate(crest, [
        {
          transform: `scale(${previous.crest.width / target.width}) ${style.transform === 'none' ? '' : style.transform}`,
          opacity: previous.crestOpacity,
        },
        { transform: style.transform, opacity: style.opacity },
      ])
    }
  }
  animate(
    shell.querySelector<HTMLElement>('.public-content'),
    [
      { transform: `translateX(${previous.direction * 16}px)`, opacity: 0.94 },
      { transform: 'none', opacity: 1 },
    ],
    210,
  )
  return () => {
    removeKeyboardListener()
    animations.forEach((animation) => animation.cancel())
  }
}
