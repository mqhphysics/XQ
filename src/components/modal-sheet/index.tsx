import { Image, RootPortal, ScrollView, Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { type PropsWithChildren, type ReactNode, useEffect, useState } from 'react'
import brandMark from '../../assets/home-visual/brand-mark.png'
import { readSession } from '../../store/session'
import './index.scss'

export interface ModalSheetProps extends PropsWithChildren {
  title?: string
  eyebrow?: string
  variant?: 'default' | 'warm-notice'
  dismissOnAnyTap?: boolean
  hideCloseButton?: boolean
  footer?: ReactNode
  onClose: () => void
}

export function ModalSheet({
  title,
  eyebrow,
  variant = 'default',
  dismissOnAnyTap = false,
  hideCloseButton = false,
  footer,
  onClose,
  children,
}: ModalSheetProps) {
  const isWarm = variant === 'warm-notice'
  const tapAnywhereToClose = dismissOnAnyTap || isWarm
  const showClose = !hideCloseButton && !isWarm

  return (
    <RootPortal>
      <View
        className={`modal-sheet-mask ${isWarm ? 'modal-sheet-mask--warm' : ''}`}
        catchMove
        onClick={onClose}
      >
        <View
          className={`modal-sheet ${isWarm ? 'modal-sheet--warm' : ''}`}
          onClick={(event) => {
            if (!tapAnywhereToClose) {
              event.stopPropagation()
            }
          }}
        >
          {title ? (
            <View className={`modal-sheet__head ${isWarm ? 'modal-sheet__head--warm' : ''}`}>
              <View className="modal-sheet__title-wrap">
                {eyebrow ? <Text className="modal-sheet__eyebrow">{eyebrow}</Text> : null}
                <Text className="modal-sheet__title">{title}</Text>
              </View>
              {showClose ? (
                <View
                  className="modal-sheet__close"
                  onClick={(event) => {
                    event.stopPropagation()
                    onClose()
                  }}
                >
                  <Text>×</Text>
                </View>
              ) : null}
            </View>
          ) : null}

          <ScrollView className="modal-sheet__scroll" scrollY showScrollbar={false}>
            <View className="modal-sheet__content">{children}</View>
          </ScrollView>

          {footer ? <View className="modal-sheet__footer">{footer}</View> : null}
          {isWarm ? <Text className="modal-sheet__warm-hint">点击任意位置关闭</Text> : null}
        </View>
      </View>
    </RootPortal>
  )
}

const WELCOME_ITEMS = [
  {
    badge: '赛程',
    text: '在「赛程」「数据」查看比赛时间、实时比分与积分榜，顶栏可切换不同赛事与组别。',
  },
  {
    badge: '主队',
    text: '选定你的学院或主队后，它的最新赛况与动态会在首页优先为你呈现。',
  },
  {
    badge: '动态',
    text: '在「绿茵动态」发布球场瞬间、阅读赛后快报，下拉即可刷新智能推荐内容。',
  },
  {
    badge: '同步',
    text: '小程序与网页端共享你的账号、球员档案、主队偏好与官方公告。',
  },
]

const welcomedMemory = new Set<string>()

export function CampusWelcomeCard() {
  const session = readSession()
  const identityKey = session?.user
    ? `${session.user.organizationId}:${session.user.id}`
    : 'guest-device'
  const storageKey = `xiaoqiu:weapp:welcome:v2:${identityKey}`
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (welcomedMemory.has(identityKey)) return
    try {
      const seen = Taro.getStorageSync(storageKey)
      if (!seen) {
        setOpen(true)
      }
    } catch {
      setOpen(true)
    }
  }, [identityKey, storageKey])

  const handleDismiss = () => {
    welcomedMemory.add(identityKey)
    setOpen(false)
    try {
      Taro.setStorageSync(storageKey, true)
    } catch {
      // ignore storage errors
    }
  }

  if (!open) return null

  return (
    <RootPortal>
      <View className="modal-sheet-mask modal-sheet-mask--warm" catchMove onClick={handleDismiss}>
        <View className="welcome-card" onClick={handleDismiss}>
          <View className="welcome-card__header">
            <View className="welcome-card__mark">
              <Image className="welcome-card__logo" src={brandMark} mode="aspectFit" />
            </View>
            <Text className="welcome-card__title">欢迎来到晓球</Text>
            <Text className="welcome-card__subtitle">这里认真记录我们学校的每一场校园足球。</Text>
          </View>

          <View className="welcome-card__list">
            {WELCOME_ITEMS.map((item) => (
              <View key={item.badge} className="welcome-card__item">
                <View className="welcome-card__item-icon">
                  <Text>{item.badge}</Text>
                </View>
                <Text className="welcome-card__item-text">{item.text}</Text>
              </View>
            ))}
          </View>

          <Text className="welcome-card__footer">当前为校内测试版本，遇到任何问题欢迎随时反馈</Text>
          <Text className="welcome-card__hint">点击任意处继续</Text>
        </View>
      </View>
    </RootPortal>
  )
}