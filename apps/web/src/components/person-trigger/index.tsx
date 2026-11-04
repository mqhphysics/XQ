import type { PropsWithChildren } from 'react'

export interface PersonTriggerProps {
  userId?: string | undefined
  playerId?: string | undefined
  tournamentId?: string | undefined
  name: string
  className?: string | undefined
}
export function PersonTrigger({ children }: PropsWithChildren<PersonTriggerProps>) {
  return <>{children}</>
}
