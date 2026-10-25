import { Button, Image, Text, View } from '@tarojs/components'
import { useEffect, useState } from 'react'
import type { PropsWithChildren } from 'react'
import {
  teamBackgroundUrl,
  personalBackgroundUrl,
  playerBackgroundUrl,
} from '../../features/managed-media/backgrounds.weapp'
import { scrollNativeDetailTop } from '../../features/native-navigation/index.weapp'
import './profile.weapp.scss'
export function NativeProfileCover({
  src,
  personal = false,
  player = false,
  compact = false,
  children,
}: PropsWithChildren<{
  src?: string | null | undefined
  personal?: boolean
  player?: boolean
  compact?: boolean
}>) {
  const [candidate, setCandidate] = useState(0)
  useEffect(() => setCandidate(0), [src, personal, player])
  const resolve = personal
    ? personalBackgroundUrl
    : player
      ? playerBackgroundUrl
      : teamBackgroundUrl
  const sources = [...new Set([resolve(src), resolve(null)])]
  const height = compact ? 224 : 260
  return (
    <View className="native-profile-cover" style={`height:${height}rpx;min-height:${height}rpx;`}>
      <Image
        className="native-profile-cover__image"
        src={sources[candidate] || sources[sources.length - 1]!}
        style={`position:relative;display:block;width:100%;height:${height}rpx;`}
        mode="aspectFill"
        onError={() => setCandidate((value) => Math.min(sources.length - 1, value + 1))}
      />
      <View className="native-profile-cover__shade" />
      <View
        className="native-profile-cover__identity"
        style={`position:absolute;left:0;top:0;width:100%;height:${height}rpx;`}
      >
        {children}
      </View>
    </View>
  )
}
export function NativeDetailTabs({
  tabs,
  selected,
  onSelect,
}: {
  tabs: readonly string[]
  selected: number
  onSelect: (index: number) => void
}) {
  return (
    <View className="native-detail-tabs" role="tablist">
      {tabs.map((label, index) => (
        <Button
          key={label}
          className={index === selected ? 'is-active' : ''}
          aria-selected={index === selected}
          onClick={() => {
            onSelect(index)
            scrollNativeDetailTop()
          }}
        >
          {label}
        </Button>
      ))}
    </View>
  )
}
export function NativeFacts({ values }: { values: Array<[string, string | number]> }) {
  return (
    <View className="native-profile-facts">
      {values.map(([label, value]) => (
        <View key={label}>
          <Text>{label}</Text>
          <Text>{value}</Text>
        </View>
      ))}
    </View>
  )
}
export function NativeStats({ values }: { values: Array<[string, string | number]> }) {
  return (
    <View className="native-profile-stats">
      {values.map(([label, value]) => (
        <View key={label}>
          <Text>{value}</Text>
          <Text>{label}</Text>
        </View>
      ))}
    </View>
  )
}
