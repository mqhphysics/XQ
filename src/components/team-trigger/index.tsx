import type { PropsWithChildren } from 'react'
export interface TeamTriggerProps {
  teamId: string
  name: string
  tournamentId?: string | undefined
}
export function TeamTrigger({ children }: PropsWithChildren<TeamTriggerProps>) {
  return <>{children}</>
}
