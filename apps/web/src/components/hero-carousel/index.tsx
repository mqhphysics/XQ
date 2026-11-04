import { View } from '@tarojs/components'

export interface HeroPhoto {
  src: string
  alt: string
  position?: string
}

// The existing static cover remains the fallback outside desktop H5.
export function HeroCarousel(
  _props: {
    photos?: readonly HeroPhoto[]
    onActiveChange?: (index: number) => void
    onSelect?: (index: number) => void
  } = {},
) {
  return (
    <View aria-hidden="true" className="experience-hero__media">
      <View className="experience-hero__illustration" />
    </View>
  )
}
