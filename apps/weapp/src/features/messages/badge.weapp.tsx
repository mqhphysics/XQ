import { Text, View } from '@tarojs/components'
import { messageBadge } from './badge.logic'
import './badge.weapp.scss'
export function MessageBadge({ count = 0, dot = false }: { count?: number; dot?: boolean }) {
  const badge = messageBadge(count, dot)
  if (!badge) return null
  return (
    <View
      className={`native-message-badge native-message-badge--${badge.kind}`}
      aria-label={badge.kind === 'count' ? `${count}条未读私信` : '有未读通知'}
    >
      {badge.kind === 'count' && <Text>{badge.label}</Text>}
    </View>
  )
}
