import { View } from '@tarojs/components'
import type { PropsWithChildren } from 'react'
import type { PersonTriggerProps } from './index'
import { openPerson, openPlayer } from '../../features/product/person-navigation.weapp'

export function PersonTrigger({
  userId,
  playerId,
  tournamentId,
  name,
  className = '',
  children,
}: PropsWithChildren<PersonTriggerProps>) {
  if (!userId && !playerId) return <>{children}</>
  return (
    <View
      className={`native-identity-trigger ${className}`}
      role="button"
      aria-label={`查看${name}的资料`}
      onClick={(event) => {
        event.stopPropagation()
        if (userId) void openPerson(userId, tournamentId)
        else void openPlayer(playerId!, tournamentId)
      }}
    >
      {children}
    </View>
  )
}
