import Taro from '@tarojs/taro'
import { openTeamFromUrl } from '../../features/product/team-navigation'
import { openMatchFromUrl } from '../../features/product/match-navigation'
import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
  type PropsWithChildren,
  type RefObject,
} from 'react'

import {
  captureNavigationOrigin,
  clearNavigationOrigin,
} from '../../components/public-shell/navigation-transition'
import type { NavigationSection } from '../../components/public-shell/navigation-transition.types'

interface ScheduleInteraction {
  navigate: (url: string, replace?: boolean) => Promise<void>
  pending: boolean
  input: RefObject<'pointer' | 'keyboard'>
}

const InteractionContext = createContext<ScheduleInteraction | null>(null)

export function ScheduleInteractionProvider({
  children,
  appearance,
}: PropsWithChildren<{ appearance: number }>) {
  const root = useRef<HTMLDivElement>(null)
  const returnFocus = useRef<HTMLElement | null>(null)
  const returnScroll = useRef<{ page: HTMLElement; top: number; left: number } | null>(null)
  const locked = useRef(false)
  const input = useRef<'pointer' | 'keyboard'>('pointer')
  const [pending, setPending] = useState(false)
  const [navigationError, setNavigationError] = useState('')
  const navigate = useCallback(async (url: string, replace = false) => {
    if (locked.current) return
    if (openMatchFromUrl(url)) return
    if (openTeamFromUrl(url)) return
    const sourcePage = root.current?.closest<HTMLElement>('.taro_page')
    if (sourcePage)
      returnScroll.current = {
        page: sourcePage,
        top: sourcePage.scrollTop,
        left: sourcePage.scrollLeft,
      }
    if (
      document.activeElement instanceof HTMLElement &&
      root.current?.contains(document.activeElement)
    )
      returnFocus.current = document.activeElement
    locked.current = true
    setPending(true)
    setNavigationError('')
    const shell = root.current?.closest<HTMLElement>('.public-app')
    const path = url.split('?')[0]
    const section: NavigationSection | null =
      path?.includes('readonly-match-detail') || path?.includes('readonly-schedule')
        ? 'schedule'
        : path?.includes('readonly-team-detail') || path?.includes('my-team')
          ? 'team'
          : null
    if (shell && section) captureNavigationOrigin(shell, section)
    try {
      if (replace) await Taro.redirectTo({ url })
      else await Taro.navigateTo({ url })
    } catch {
      clearNavigationOrigin()
      setNavigationError('页面暂时无法打开，请重新点击入口。')
    } finally {
      locked.current = false
      setPending(false)
    }
  }, [])
  useLayoutEffect(() => {
    if (!returnFocus.current) return
    const frame = requestAnimationFrame(() => {
      const position = returnScroll.current
      if (position?.page.isConnected) {
        position.page.scrollTop = position.top
        position.page.scrollLeft = position.left
      }
      returnFocus.current?.focus({ preventScroll: true })
    })
    return () => cancelAnimationFrame(frame)
  }, [appearance])
  const value = useMemo(() => ({ navigate, pending, input }), [navigate, pending])
  const recordInput = (kind: 'pointer' | 'keyboard') => {
    input.current = kind
    if (root.current) root.current.dataset.scheduleInput = kind
  }
  return (
    <InteractionContext.Provider value={value}>
      <div
        className="schedule-desktop xq-viewport-page"
        ref={root}
        aria-busy={pending}
        onPointerDownCapture={() => recordInput('pointer')}
        onKeyDownCapture={() => recordInput('keyboard')}
      >
        {navigationError && (
          <div className="schedule-navigation-error" role="alert">
            {navigationError}
          </div>
        )}
        {children}
      </div>
    </InteractionContext.Provider>
  )
}

export function useScheduleInteraction() {
  const interaction = useContext(InteractionContext)
  if (!interaction) throw new Error('Schedule interaction requires its page provider')
  return interaction
}

export function ScheduleLink({
  url,
  replace = false,
  children,
  ...props
}: Omit<ComponentProps<'button'>, 'onClick' | 'type' | 'disabled'> & {
  url: string
  replace?: boolean
}) {
  const { navigate, pending } = useScheduleInteraction()
  const teamParams = url.startsWith('/pages/readonly-team-detail/index?')
    ? new URLSearchParams(url.split('?')[1])
    : null
  return (
    <button
      {...props}
      data-schedule-button=""
      data-schedule-navigation=""
      data-team-tournament={teamParams?.get('tournamentId') ?? undefined}
      type="button"
      disabled={pending}
      onClick={(event) => {
        event.stopPropagation()
        void navigate(url, replace)
      }}
    >
      {children}
    </button>
  )
}

// State changes remain immediate. Only the freshly rendered results animate.
export function useScheduleMotion(
  ref: RefObject<HTMLElement>,
  trigger: string,
  axis: 'x' | 'y' = 'y',
) {
  const { input } = useScheduleInteraction()
  const previous = useRef(trigger)
  useLayoutEffect(() => {
    const last = previous.current
    previous.current = trigger
    if (
      last === trigger ||
      input.current === 'keyboard' ||
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    )
      return
    const element = ref.current
    if (!element?.animate) return
    const distance = axis === 'x' ? (trigger > last ? 6 : -6) : 3
    const animation = element.animate(
      [
        { opacity: 0.8, transform: `translate${axis.toUpperCase()}(${distance}px)` },
        { opacity: 1, transform: 'none' },
      ],
      { duration: 160, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' },
    )
    return () => animation.cancel()
  }, [ref, trigger, axis, input])
}
