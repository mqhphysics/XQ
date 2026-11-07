import { View } from '@tarojs/components'
import './icons.weapp.scss'
export type MessageIconName =
  | 'reply'
  | 'like'
  | 'system'
  | 'brush'
  | 'search'
  | 'settings'
  | 'block'
  | 'more'
  | 'shield'
export function MessageIcon({
  name,
  className = '',
}: {
  name: MessageIconName
  className?: string
}) {
  return (
    <View className={`native-message-icon native-message-icon--${name} ${className}`} aria-hidden />
  )
}
