import type { PropsWithChildren } from 'react'

export function PlayerTrigger({
  children,
}: PropsWithChildren<{
  playerId: string
  tournamentId?: string
  name: string
}>) {
  return <>{children}</>
}
