import { Button, Text, View } from '@tarojs/components'
import type { HomeResponse } from '../../features/product/product.types'

export interface HomeHeroCopyProps {
  tournament: HomeResponse['tournament']
  onOpenSchedule: () => void
}

/** Keep the existing compact/mini-program copy unchanged. */
export function HomeHeroCopy({ tournament, onOpenSchedule }: HomeHeroCopyProps) {
  return (
    <View className="experience-hero__copy hero-season">
      <Text className="hero-season__season">{tournament.seasonName}</Text>
      <Text className="hero-season__title">
        {tournament.name}
        <Text className="hero-season__hot">火热进行中</Text>
      </Text>
      <View className="hero-season__line">
        <Text>{tournament.teamCount} 支球队 · {tournament.matchCount} 场比赛</Text>
        <Button className="hero-season__link" onClick={onOpenSchedule}>查看赛程 →</Button>
      </View>
    </View>
  )
}
