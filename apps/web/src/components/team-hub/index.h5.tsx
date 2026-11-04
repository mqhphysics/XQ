import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  OPEN_TEAM_EVENT,
  HOVER_TEAM_EVENT,
  LEAVE_TEAM_EVENT,
} from '../../features/product/team-navigation.h5'
import { OPEN_PLAYER_EVENT, HOVER_PLAYER_EVENT } from '../../features/product/player-navigation.h5'
import { OPEN_PERSON_EVENT, HOVER_PERSON_EVENT } from '../../features/product/person-navigation.h5'
import { OPEN_POST_EVENT } from '../../features/product/post-navigation.h5'
import { TeamHoverCard, type TeamHoverRequest } from './preview.h5'
import { TeamDetailView } from './detail.h5'
import { TeamIcon } from './icons.h5'
import { useOverlayFocus } from '../overlay-focus'
import './index.h5.scss'

interface TeamTarget {
  teamId: string
  tournamentId?: string
}
export function TeamOverlayHost() {
  const [target, setTarget] = useState<TeamTarget | null>(null)
  const [hover, setHover] = useState<TeamHoverRequest | null>(null)
  const timers = useRef<{ enter?: number; leave?: number }>({})
  const hoverScroll = useRef(new Map<EventTarget, { left: number; top: number }>())
  const closeHover = useCallback(() => {
    window.clearTimeout(timers.current.enter)
    window.clearTimeout(timers.current.leave)
    setHover(null)
  }, [])
  const leaveHover = useCallback(() => {
    window.clearTimeout(timers.current.enter)
    window.clearTimeout(timers.current.leave)
    timers.current.leave = window.setTimeout(() => setHover(null), 220)
  }, [])
  const keepHover = () => window.clearTimeout(timers.current.leave)
  useEffect(() => {
    const open = (event: Event) => {
      const value = (event as CustomEvent<unknown>).detail
      if (
        !value ||
        typeof value !== 'object' ||
        !('teamId' in value) ||
        typeof value.teamId !== 'string' ||
        !value.teamId ||
        value.teamId.length > 150
      )
        return
      const tournamentId =
        'tournamentId' in value && typeof value.tournamentId === 'string'
          ? value.tournamentId
          : undefined
      closeHover()
      setTarget({ teamId: value.teamId, ...(tournamentId ? { tournamentId } : {}) })
    }
    const enter = (event: Event) => {
      const value = (event as CustomEvent<TeamHoverRequest>).detail
      if (
        !value ||
        typeof value.teamId !== 'string' ||
        !value.teamId ||
        value.teamId.length > 150 ||
        typeof value.tournamentId !== 'string' ||
        !(value.anchor instanceof HTMLElement) ||
        value.anchor.closest('[data-team-selector]')
      )
        return
      closeHover()
      hoverScroll.current.clear()
      for (let node: HTMLElement | null = value.anchor; node; node = node.parentElement)
        hoverScroll.current.set(node, { left: node.scrollLeft, top: node.scrollTop })
      for (const target of [window, document])
        hoverScroll.current.set(target, { left: window.scrollX, top: window.scrollY })
      timers.current.enter = window.setTimeout(() => {
        if (value.anchor.isConnected) setHover(value)
      }, 320)
    }
    const close = () => {
      closeHover()
      setTarget(null)
    }
    const resize = () => {
      if (!window.matchMedia('(min-width: 721px)').matches) close()
    }
    const scroll = (event: Event) => {
      const target = event.target
      if (!target || (target instanceof Element && target.closest('.team-hover-card'))) return
      const next =
        target instanceof Element
          ? { left: target.scrollLeft, top: target.scrollTop }
          : { left: window.scrollX, top: window.scrollY }
      const previous = hoverScroll.current.get(target)
      hoverScroll.current.set(target, next)
      // scrollIntoView and layout can emit scroll at an unchanged position just after pointer entry.
      if (!previous || previous.left !== next.left || previous.top !== next.top) closeHover()
    }
    window.addEventListener(OPEN_TEAM_EVENT, open)
    window.addEventListener(HOVER_TEAM_EVENT, enter)
    window.addEventListener(LEAVE_TEAM_EVENT, leaveHover)
    for (const type of [OPEN_PLAYER_EVENT, OPEN_PERSON_EVENT]) window.addEventListener(type, close)
    for (const type of [OPEN_POST_EVENT, HOVER_PLAYER_EVENT, HOVER_PERSON_EVENT])
      window.addEventListener(type, closeHover)
    window.addEventListener('scroll', scroll, true)
    window.addEventListener('hashchange', close)
    window.addEventListener('popstate', close)
    window.addEventListener('resize', resize)
    return () => {
      window.removeEventListener(OPEN_TEAM_EVENT, open)
      window.removeEventListener(HOVER_TEAM_EVENT, enter)
      window.removeEventListener(LEAVE_TEAM_EVENT, leaveHover)
      for (const type of [OPEN_PLAYER_EVENT, OPEN_PERSON_EVENT])
        window.removeEventListener(type, close)
      for (const type of [OPEN_POST_EVENT, HOVER_PLAYER_EVENT, HOVER_PERSON_EVENT])
        window.removeEventListener(type, closeHover)
      window.removeEventListener('scroll', scroll, true)
      closeHover()
      window.removeEventListener('hashchange', close)
      window.removeEventListener('popstate', close)
      window.removeEventListener('resize', resize)
    }
  }, [closeHover, leaveHover])
  return (
    <>
      {target ? (
        <TeamOverlay
          key={`${target.teamId}:${target.tournamentId ?? ''}`}
          target={target}
          onClose={() => setTarget(null)}
        />
      ) : null}
      {hover && !target ? (
        <TeamHoverCard
          key={`${hover.teamId}:${hover.tournamentId}`}
          request={hover}
          onClose={closeHover}
          onEnter={keepHover}
          onLeave={leaveHover}
        />
      ) : null}
    </>
  )
}

function TeamOverlay({ target, onClose }: { target: TeamTarget; onClose: () => void }) {
  useOverlayFocus(true, '.th-detail-modal', onClose)
  return createPortal(
    <div
      className="th-scrim th-scrim--detail"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <section
        className="th-root th-detail-modal xq-dialog xq-dialog--wide"
        role="dialog"
        aria-modal="true"
        aria-label="球队详情"
        tabIndex={-1}
      >
        <div className="th-modal-top xq-dialog__header">
          <div>
            <h2>球队详情</h2>
          </div>
          <button
            data-team-control
            type="button"
            className="th-icon-button"
            aria-label="关闭球队详情"
            onClick={onClose}
          >
            <TeamIcon name="close" />
          </button>
        </div>
        <div className="th-detail-modal__content xq-dialog__body">
          <TeamDetailView teamId={target.teamId} tournamentId={target.tournamentId} />
        </div>
      </section>
    </div>,
    document.body,
  )
}
