import type { PropsWithChildren } from 'react'
import { HOVER_PERSON_EVENT, openPerson } from '../../features/product/person-navigation.h5'
import {
  HOVER_PLAYER_EVENT,
  LEAVE_PLAYER_EVENT,
  openPlayer,
} from '../../features/product/player-navigation.h5'
import type { PersonTriggerProps } from './index'
import './index.h5.scss'

export function PersonTrigger({
  children,
  userId,
  playerId,
  tournamentId = '',
  name,
  className = '',
}: PropsWithChildren<PersonTriggerProps>) {
  if (!userId && !playerId) return <>{children}</>
  const desktop = () => window.matchMedia('(min-width: 721px)').matches
  const open = () =>
    userId ? openPerson(userId, tournamentId) : openPlayer(playerId!, tournamentId)
  return (
    <span
      className={`person-trigger ${className}`}
      role="button"
      tabIndex={0}
      aria-haspopup="dialog"
      aria-label={`查看${name}的资料`}
      onClickCapture={(event) => {
        if (!desktop()) return
        event.preventDefault()
        event.stopPropagation()
        event.nativeEvent.stopImmediatePropagation()
        void open()
      }}
      onKeyDown={(event) => {
        if (!desktop() || !['Enter', ' '].includes(event.key)) return
        event.preventDefault()
        event.stopPropagation()
        void open()
      }}
      onMouseEnter={(event) => {
        if (!desktop() || !window.matchMedia('(hover: hover)').matches) return
        const detail = userId
          ? { userId, tournamentId, anchor: event.currentTarget }
          : { playerId, tournamentId, anchor: event.currentTarget }
        window.dispatchEvent(
          new CustomEvent(userId ? HOVER_PERSON_EVENT : HOVER_PLAYER_EVENT, { detail }),
        )
      }}
      onMouseLeave={() => window.dispatchEvent(new Event(LEAVE_PLAYER_EVENT))}
    >
      {children}
    </span>
  )
}
