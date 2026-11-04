import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import Taro from '@tarojs/taro'
import { OPEN_MATCH_EVENT } from '../../features/product/match-navigation.h5'
import { OPEN_TEAM_EVENT } from '../../features/product/team-navigation.h5'
import { OPEN_PLAYER_EVENT } from '../../features/product/player-navigation.h5'
import { OPEN_PERSON_EVENT } from '../../features/product/person-navigation.h5'
import { productRepository } from '../../features/product/product.repository'
import type { MatchExperienceResponse } from '../../features/product/product.types'
import type { MatchContent as MatchContentComponent } from '../../features/readonly-match/match-content.h5'
import {
  createMatchOverlayHistory,
  readMatchRequest,
  type MatchRequest,
} from '../../features/readonly-match/navigation.logic'
import { useOverlayFocus } from '../overlay-focus'
import {
  sameFocusOrigin,
  type FocusIdentity,
} from '../../features/readonly-match/focus-origin.logic'
import './index.h5.scss'
import { MatchReportEntry } from '../../features/match-report/MatchReportEntry.h5'
import { useInlineReport } from '../../features/match-report/use-inline-report.h5'

const loadContent = () => import('../../features/readonly-match/match-content.h5')
const MATCH_RESOURCE_EVENT = 'xiaoqiu:match-resource-navigation'
const focusable = 'button:not([disabled]),a[href],[tabindex]:not([tabindex="-1"])'
function focusIdentity(element: HTMLElement): FocusIdentity {
  return {
    tagName: element.tagName,
    id: element.id,
    label: element.getAttribute('aria-label'),
    href: element.getAttribute('href'),
    className: element.className,
    text: element.textContent?.trim() ?? '',
  }
}

export function MatchOverlayHost() {
  const [request, setRequest] = useState<MatchRequest | null>(null)
  const [close, setClose] = useState<() => void>(() => () => undefined)
  useEffect(() => {
    const owner = `match-${crypto.randomUUID()}`
    let sourceHash = ''
    let origin: FocusIdentity | null = null
    let restoreFrame = 0
    let active = false
    const cancelRestore = () => {
      window.cancelAnimationFrame(restoreFrame)
      restoreFrame = 0
    }
    const restoreFocus = () => {
      cancelRestore()
      let attempts = 0
      const restore = () => {
        if (!origin || window.location.hash !== sourceHash || active) return
        // Taro's Back handler can replace the old trigger after the dialog unmounts.
        if (attempts++ > 1 && !document.querySelector('[role="dialog"]')) {
          const target = Array.from(document.querySelectorAll<HTMLElement>(focusable)).find(
            (candidate) =>
              candidate.offsetParent !== null &&
              sameFocusOrigin(origin as FocusIdentity, focusIdentity(candidate)),
          )
          if (target) {
            target.focus({ preventScroll: true })
            return
          }
        }
        if (attempts < 30) restoreFrame = window.requestAnimationFrame(restore)
      }
      restoreFrame = window.requestAnimationFrame(restore)
    }
    const navigation = createMatchOverlayHistory(window.history, owner, (next) => {
      const wasActive = active
      active = next !== null
      setRequest(next)
      if (!next && wasActive) restoreFocus()
    })
    setClose(() => navigation.close)
    const open = (event: Event) => {
      const next = readMatchRequest((event as CustomEvent<unknown>).detail)
      if (next) {
        cancelRestore()
        if (!active) {
          sourceHash = window.location.hash
          const element = document.activeElement
          origin =
            element instanceof HTMLElement && element.matches(focusable)
              ? focusIdentity(element)
              : null
        }
        navigation.open(next)
      }
    }
    const routeChanged = () => {
      origin = null
      cancelRestore()
      navigation.routeChanged()
    }
    const prepareResourceNavigation = () => {
      origin = null
      cancelRestore()
      navigation.prepareResourceNavigation()
    }
    const taroRouteChanged = () => {
      // Taro push/replace changes the hash without a native hashchange event.
      if (sourceHash && window.location.hash !== sourceHash) routeChanged()
    }
    window.addEventListener(OPEN_MATCH_EVENT, open)
    window.addEventListener(OPEN_TEAM_EVENT, routeChanged)
    window.addEventListener(OPEN_PLAYER_EVENT, routeChanged)
    window.addEventListener(OPEN_PERSON_EVENT, routeChanged)
    window.addEventListener(MATCH_RESOURCE_EVENT, prepareResourceNavigation)
    window.addEventListener('popstate', navigation.pop)
    window.addEventListener('hashchange', routeChanged)
    Taro.eventCenter.on('__afterTaroRouterChange', taroRouteChanged)
    return () => {
      cancelRestore()
      window.removeEventListener(OPEN_MATCH_EVENT, open)
      window.removeEventListener(OPEN_TEAM_EVENT, routeChanged)
      window.removeEventListener(OPEN_PLAYER_EVENT, routeChanged)
      window.removeEventListener(OPEN_PERSON_EVENT, routeChanged)
      window.removeEventListener(MATCH_RESOURCE_EVENT, prepareResourceNavigation)
      window.removeEventListener('popstate', navigation.pop)
      window.removeEventListener('hashchange', routeChanged)
      Taro.eventCenter.off('__afterTaroRouterChange', taroRouteChanged)
    }
  }, [])
  return request ? <MatchDialog key={request.matchId} request={request} onClose={close} /> : null
}

type State =
  | { phase: 'loading' }
  | { phase: 'failed'; message: string }
  | {
      phase: 'ready'
      match: MatchExperienceResponse
      Content: typeof MatchContentComponent
    }

export function MatchDialog({ request, onClose }: { request: MatchRequest; onClose: () => void }) {
  const [state, setState] = useState<State>({ phase: 'loading' })
  const [retry, setRetry] = useState(0)
  const updateMatch = (match: MatchExperienceResponse) =>
    setState((previous) => (previous.phase === 'ready' ? { ...previous, match } : previous))
  const editor = useInlineReport(state.phase === 'ready' ? state.match : null, updateMatch)
  const autoEdit = useRef(false)
  useEffect(() => {
    if (
      !autoEdit.current &&
      editor.workspace?.inline?.canStart &&
      Taro.getCurrentInstance().router?.params.edit === '1'
    ) {
      autoEdit.current = true
      void editor.start()
    }
  }, [editor.workspace?.inline?.canStart])
  const close = () => {
    void (async () => {
      if (!editor.editing || (await editor.saveDraft())) onClose()
    })()
  }
  const titleId = useId()
  const panelId = useId().replace(/:/g, '')
  useOverlayFocus(true, `#match-dialog-${panelId}`, close)
  useEffect(() => {
    let current = true
    setState({ phase: 'loading' })
    if (!request.matchId) {
      setState({ phase: 'failed', message: '缺少比赛参数。' })
      return
    }
    void Promise.all([productRepository.getMatch(request.matchId), loadContent()]).then(
      ([match, content]) => {
        if (current) setState({ phase: 'ready', match, Content: content.MatchContent })
      },
      (error: unknown) => {
        if (current)
          setState({
            phase: 'failed',
            message: error instanceof Error ? error.message : '比赛详情加载失败。',
          })
      },
    )
    return () => {
      current = false
    }
  }, [request.matchId, retry])
  return createPortal(
    <div
      className="match-scrim"
      onClick={(event) => {
        if (event.target === event.currentTarget) close()
      }}
    >
      <section
        id={`match-dialog-${panelId}`}
        className="match-dialog xq-dialog xq-dialog--wide"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onClickCapture={(event) => {
          if (
            !editor.editing &&
            event.target instanceof Element &&
            event.target.closest(
              '[data-match-resource], .person-trigger, .player-trigger, .team-trigger',
            )
          )
            window.dispatchEvent(new Event(MATCH_RESOURCE_EVENT))
        }}
      >
        <header className="match-dialog__bar">
          <h1 id={titleId}>比赛详情</h1>
          <MatchReportEntry editor={editor} />
          <button
            type="button"
            className="match-dialog__close"
            aria-label="关闭比赛详情"
            onClick={close}
          >
            <span aria-hidden="true">×</span>
          </button>
        </header>
        <div className="match-dialog__body xq-dialog__body">
          {state.phase === 'ready' ? (
            <state.Content match={state.match} editor={editor} onMatchUpdated={updateMatch} />
          ) : (
            <div
              className="match-dialog__state"
              role={state.phase === 'failed' ? 'alert' : 'status'}
            >
              <h2>{state.phase === 'loading' ? '正在读取比赛详情' : '比赛详情不可用'}</h2>
              <p>{state.phase === 'failed' ? state.message : '正在获取比分、阵容和比赛事件。'}</p>
              {state.phase === 'failed' && (
                <button type="button" onClick={() => setRetry((value) => value + 1)}>
                  重试
                </button>
              )}
            </div>
          )}
        </div>
      </section>
    </div>,
    document.body,
  )
}
