import { View } from '@tarojs/components'
import type { PropsWithChildren } from 'react'
import type { TeamTriggerProps } from './index'
import { openTeam } from '../../features/product/team-navigation'

export function TeamTrigger({
  teamId,
  tournamentId,
  name,
  children,
}: PropsWithChildren<TeamTriggerProps>) {
  return (
    <View
      className="native-identity-trigger"
      role="button"
      aria-label={`查看球队 ${name}`}
      onClick={(event) => {
        event.stopPropagation()
        void openTeam(teamId, tournamentId)
      }}
    >
      {children}
    </View>
  )
}
