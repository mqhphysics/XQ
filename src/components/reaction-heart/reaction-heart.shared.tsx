import { Text } from '@tarojs/components'
export function ReactionHeart({ active }: { active: boolean }) {
  return <Text className="post-card__action-icon">{active ? '♥' : '♡'}</Text>
}
