import { Image, RootPortal, Text, View } from '@tarojs/components'
import { useEffect, useRef, useState } from 'react'
import brandMark from '../../assets/home-visual/brand-mark.png'
import './welcome-card.weapp.scss'

/** Same welcome as the website card, minus the line about the mini program still being built. */
const copy = {
  title: '欢迎来到晓球',
  subtitle: '这里记录我们学校的每一场校园足球。',
  bullets: [
    {
      icon: 'schedule',
      text: '赛程、比分和积分榜都在「赛程」「数据」里，右上角可以切换杯赛和男子组、女子组。',
    },
    { icon: 'team', text: '选一支主队，它的下一场比赛会出现在首页。' },
    { icon: 'camera', text: '在「绿茵动态」查看战报与公告，点赞、收藏精彩瞬间。' },
  ],
  footer: '有建议或遇到问题，可在个人中心反馈。',
  hint: '点击任意处继续',
} as const

function quoted(text: string) {
  return text
    .split(/(「[^」]+」)/)
    .filter(Boolean)
    .map((part, index) => (
      <Text key={index} className={/^「[^」]+」$/.test(part) ? 'is-quoted' : ''}>
        {part}
      </Text>
    ))
}

/** First-visit welcome: no buttons, a tap anywhere closes it with a short fade. */
export function NativeWelcomeCard({ onClose }: { onClose: () => void }) {
  const [leaving, setLeaving] = useState(false)
  const closing = useRef(false),
    timer = useRef<ReturnType<typeof setTimeout>>()
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
    },
    [],
  )
  const close = () => {
    if (closing.current) return
    closing.current = true
    setLeaving(true)
    timer.current = setTimeout(onClose, 260)
  }
  return (
    <RootPortal>
      <View
        className={`native-welcome${leaving ? ' is-leaving' : ''}`}
        catchMove
        onClick={close}
        role="dialog"
        aria-label={copy.title}
      >
        <View className="native-welcome__card">
          <View className="native-welcome__mark">
            <Image src={brandMark} mode="widthFix" className="native-welcome__mark-image" />
          </View>
          <Text className="native-welcome__title">{copy.title}</Text>
          <Text className="native-welcome__subtitle">{copy.subtitle}</Text>
          <View className="native-welcome__list">
            {copy.bullets.map((bullet, index) => (
              <View
                key={bullet.icon}
                className="native-welcome__item"
                style={`animation-delay:${180 + index * 60}ms;`}
              >
                <View className={`native-welcome__icon native-welcome__icon--${bullet.icon}`} />
                <Text className="native-welcome__text">{quoted(bullet.text)}</Text>
              </View>
            ))}
          </View>
          <View className="native-welcome__footer">
            <View className="native-welcome__dot" />
            <Text>{copy.footer}</Text>
          </View>
          <Text className="native-welcome__hint">{copy.hint}</Text>
        </View>
      </View>
    </RootPortal>
  )
}
