import { Button, Image, Swiper, SwiperItem, Text, View } from '@tarojs/components'
import { useState } from 'react'
import { useDidHide, useDidShow } from '@tarojs/taro'
import matchPhoto from '../../assets/home-visual/home-campus-action.webp'
import huddlePhoto from '../../assets/home-visual/home-team-huddle.webp'
import celebrationPhoto from '../../assets/home-visual/home-team-celebration.webp'
import { useNativePreferences } from '../native-ui/preferences.weapp'
import { useNativePanelVisible } from '../native-navigation/panel-context.weapp'

export interface HeroPhoto {
  src: string
  alt: string
  title?: string
  position?: string
}
const fallback: readonly HeroPhoto[] = [
  { src: matchPhoto, alt: '校园足球比赛' },
  { src: huddlePhoto, alt: '队员们赛前加油' },
  { src: celebrationPhoto, alt: '队员们庆祝比赛' },
]

export function HeroCarousel({
  photos,
  onActiveChange,
  onSelect,
}: {
  photos?: readonly HeroPhoto[]
  onActiveChange?: (index: number) => void
  onSelect?: (index: number) => void
}) {
  const slides = photos?.length ? photos : fallback
  const [index, setIndex] = useState(0)
  const [paused, setPaused] = useState(false)
  const [visible, setVisible] = useState(true)
  const { reduceMotion } = useNativePreferences()
  const panelVisible = useNativePanelVisible()
  useDidHide(() => setVisible(false))
  useDidShow(() => setVisible(true))
  return (
    <View className="experience-hero__media native-home-hero">
      <View className="native-home-hero__copy">
        <Text className="native-home-hero__eyebrow">2026 校园足球赛季</Text>
        <Text className="native-home-hero__title">绿茵正燃</Text>
        <Text className="native-home-hero__title native-home-hero__title--warm">青春正好</Text>
      </View>
      <View className="native-home-hero__photos">
        <Swiper
          className="native-home-hero__swiper"
          autoplay={visible && panelVisible && !paused && !reduceMotion && slides.length > 1}
          interval={5000}
          duration={380}
          circular={slides.length > 1}
          onTouchStart={(event) => event.stopPropagation()}
          onTouchMove={(event) => event.stopPropagation()}
          onTouchEnd={(event) => event.stopPropagation()}
          onChange={(event) => {
            setIndex(event.detail.current)
            onActiveChange?.(event.detail.current)
          }}
        >
          {slides.map((slide, item) => (
            <SwiperItem key={`${slide.src}:${item}`}>
              <View className="native-home-hero__slide" onClick={() => onSelect?.(item)}>
                <Image
                  className="native-home-hero__photo"
                  src={slide.src}
                  mode="aspectFill"
                  aria-label={slide.alt}
                />
                {slide.title && (
                  <View
                    className={`native-home-hero__caption${slides.length > 1 ? ' native-home-hero__caption--controls' : ''}`}
                  >
                    <Text className="native-home-hero__caption-title">{slide.title}</Text>
                  </View>
                )}
              </View>
            </SwiperItem>
          ))}
        </Swiper>
        {slides.length > 1 && (
          <View className="native-home-hero__controls">
            <View className="native-home-hero__dots" aria-hidden="true">
              {slides.map((slide, item) => (
                <View
                  key={`${slide.src}:${item}`}
                  className={`native-home-hero__dot${index === item ? ' native-home-hero__dot--active' : ''}`}
                />
              ))}
            </View>
            <Button
              className="native-home-hero__pause"
              aria-label={paused ? '播放照片轮播' : '暂停照片轮播'}
              onClick={() => setPaused((value) => !value)}
            >
              {paused ? '播放' : '暂停'}
            </Button>
          </View>
        )}
      </View>
    </View>
  )
}
