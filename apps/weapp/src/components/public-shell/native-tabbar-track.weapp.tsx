import { View } from '@tarojs/components'
import { useNativeIndicator } from '../../features/native-navigation/index.weapp'
export function NativeTabbarTrack() {
  const frame = useNativeIndicator()
  return (
    <View className="native-tabbar-track">
      <View
        className="native-tabbar-highlight"
        style={`transform:translateX(${frame.index * 100}%);transition-duration:${frame.duration}ms;`}
      />
    </View>
  )
}
