import { View } from '@tarojs/components'
import type { PropsWithChildren } from 'react'
import { openPlayer } from '../../features/product/player-navigation'

export function PlayerTrigger({
  playerId,
  tournamentId,
  name,
  children,
}: PropsWithChildren<{
  playerId: string
  tournamentId?: string
  name: string
}>) {
  return (
    <View
      className="native-identity-trigger"
      role="button"
      aria-label={`查看球员 ${name}`}
      onClick={(event) => {
        event.stopPropagation()
        void openPlayer(playerId, tournamentId)
      }}
    >
      {children}
    </View>
  )
}
