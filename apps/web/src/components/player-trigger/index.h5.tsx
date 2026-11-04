import type { PropsWithChildren } from 'react'
import {
  HOVER_PLAYER_EVENT,
  LEAVE_PLAYER_EVENT,
  openPlayer,
} from '../../features/product/player-navigation.h5'

export function PlayerTrigger({
  children,
  playerId,
  tournamentId = '',
  name,
}: PropsWithChildren<{
  playerId: string
  tournamentId?: string
  name: string
}>) {
  const desktop = () => window.matchMedia('(min-width: 721px)').matches
  return (
    <span
      className="player-trigger"
      role="button"
      tabIndex={0}
      aria-label={`查看${name}的球员资料`}
      aria-haspopup="dialog"
      onClick={(event) => {
        if (!desktop()) return
        event.stopPropagation()
        void openPlayer(playerId, tournamentId)
      }}
      onKeyDown={(event) => {
        if (!desktop() || (event.key !== 'Enter' && event.key !== ' ')) return
        event.preventDefault()
        event.stopPropagation()
        void openPlayer(playerId, tournamentId)
      }}
      onMouseEnter={(event) => {
        if (desktop() && window.matchMedia('(hover: hover)').matches)
          window.dispatchEvent(
            new CustomEvent(HOVER_PLAYER_EVENT, {
              detail: { playerId, tournamentId, anchor: event.currentTarget },
            }),
          )
      }}
      onMouseLeave={() => window.dispatchEvent(new Event(LEAVE_PLAYER_EVENT))}
    >
      {children}
    </span>
  )
}
