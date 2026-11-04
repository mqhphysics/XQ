import { View } from '@tarojs/components'
export function ReactionHeart({ active = false }: { active?: boolean }) {
  return (
    <View
      className={`native-reaction-heart${active ? ' native-reaction-heart--active' : ''}`}
      aria-hidden="true"
    />
  )
}
