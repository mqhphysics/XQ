import { getCurrentInstance } from '@tarojs/taro'
import { useRef, type PropsWithChildren } from 'react'
import {
  HOVER_TEAM_EVENT,
  LEAVE_TEAM_EVENT,
  openDesktopTeam,
} from '../../features/product/team-navigation.h5'
import { eventOnTeam, pointerOnTeam } from '../../features/product/team-hit'
import type { TeamTriggerProps } from './index'

export function TeamTrigger({
  children,
  teamId,
  name,
  tournamentId,
}: PropsWithChildren<TeamTriggerProps>) {
  const hovering = useRef(false)
  const permitted = (anchor: HTMLElement) =>
    window.matchMedia('(min-width: 721px)').matches &&
    !anchor.closest('[data-team-selector], [data-team-action], .public-team-nav, .mobile-team-tab')
  const context = (anchor: HTMLElement) =>
    tournamentId ||
    anchor.closest<HTMLElement>('[data-team-tournament]')?.dataset.teamTournament ||
    new URLSearchParams(anchor.closest('a')?.getAttribute('href')?.split('?')[1]).get(
      'tournamentId',
    ) ||
    getCurrentInstance().router?.params?.tournamentId ||
    ''
  return (
    <span
      className="team-trigger"
      role="button"
      tabIndex={0}
      aria-haspopup="dialog"
      aria-label={`查看${name}球队资料`}
      onClickCapture={(event) => {
        if (!permitted(event.currentTarget)) return
        // Whitespace beside the crest/name falls through to the surrounding card (match detail).
        if (!eventOnTeam(event.currentTarget, event)) return
        event.preventDefault()
        event.stopPropagation()
        event.nativeEvent.stopImmediatePropagation()
        openDesktopTeam(teamId, context(event.currentTarget))
      }}
      onKeyDown={(event) => {
        if (!permitted(event.currentTarget) || !['Enter', ' '].includes(event.key)) return
        event.preventDefault()
        event.stopPropagation()
        openDesktopTeam(teamId, context(event.currentTarget))
      }}
      onMouseMove={(event) => {
        const anchor = event.currentTarget
        const over = pointerOnTeam(anchor, event.clientX, event.clientY)
        if (over === hovering.current) return
        hovering.current = over
        if (!over) {
          window.dispatchEvent(new Event(LEAVE_TEAM_EVENT))
          return
        }
        if (permitted(anchor) && window.matchMedia('(hover: hover)').matches)
          window.dispatchEvent(
            new CustomEvent(HOVER_TEAM_EVENT, {
              detail: { teamId, tournamentId: context(anchor), anchor },
            }),
          )
      }}
      onMouseLeave={() => {
        if (!hovering.current) return
        hovering.current = false
        window.dispatchEvent(new Event(LEAVE_TEAM_EVENT))
      }}
    >
      {children}
    </span>
  )
}
