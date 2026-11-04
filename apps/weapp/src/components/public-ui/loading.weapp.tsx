import { Text, View } from '@tarojs/components'
import { NativeLoadingRing } from '../native-loading/index.weapp'
import './loading.weapp.scss'

export function NativeLoadingState({
  title,
  description,
}: {
  title: string
  description?: string
}) {
  return (
    <View
      className="data-state data-state--loading native-loading-state"
      role="status"
      aria-live="polite"
    >
      <NativeLoadingRing />
      <Text className="native-loading-state__title">{title}</Text>
      {description && <Text className="native-loading-state__description">{description}</Text>}
    </View>
  )
}
