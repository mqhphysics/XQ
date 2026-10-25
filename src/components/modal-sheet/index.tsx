import { Image, ScrollView, Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useEffect, useState, type ReactNode } from 'react'
import { productRepository } from '../../services/api'
import { readSession, subscribeToSessionWrites } from '../../store/session'
import type { AuthSession } from '../../types'
import './index.scss'

interface ModalSheetProps {
  title?: string
  subtitle?: string
  variant?: 'default' | 'warm-notice'
  hideCloseButton?: boolean
  closeOnCardTap?: boolean
  onClose: () => void
  children: ReactNode
}

export function ModalSheet({
  title,
  subtitle,
  variant = 'default',
  hideCloseButton = false,
  closeOnCardTap = false,
  onClose,
  children,
}: ModalSheetProps) {
  const showHeader = Boolean(title || subtitle || !hideCloseButton)

  return (
    <View className="modal-sheet" onClick={onClose}>
      <View
        className={`modal-sheet__card ${variant === 'warm-notice' ? 'modal-sheet__card--warm' : ''}`}
        onClick={(e) => {
          if (closeOnCardTap) {
            onClose()
            return
          }
          e.stopPropagation()
        }}
      >
        {showHeader ? (
          <View className="modal-sheet__header">
            <View className="modal-sheet__header-copy">
              {title ? <Text className="modal-sheet__title">{title}</Text> : null}
              {subtitle ? (
                <Text className="modal-sheet__subtitle">{subtitle}</Text>
              ) : null}
            </View>
            {!hideCloseButton ? (
              <View className="modal-sheet__close" onClick={onClose}>
                <Text className="modal-sheet__close-text">×</Text>
              </View>
            ) : null}
          </View>
        ) : null}
        <ScrollView scrollY className="modal-sheet__body">
          {children}
        </ScrollView>
      </View>
    </View>
  )
}

const WELCOME_GUIDE_STORAGE_KEY = 'xq_welcome_guide_seen_v1'

type WelcomeIconKind = 'schedule' | 'team' | 'camera' | 'wechat'

function buildWelcomeIconSvg(kind: WelcomeIconKind): string {
  const stroke = '#244b35'
  const common = `fill="none" stroke="${stroke}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"`
  let body = ''

  if (kind === 'schedule') {
    body = `
      <rect x="3.5" y="5" width="17" height="15.5" rx="3" ${common} />
      <path d="M8 3.5V6.5M16 3.5V6.5M3.5 9.5H20.5" ${common} />
      <circle cx="8.5" cy="13.5" r="1" fill="${stroke}" />
      <circle cx="12" cy="13.5" r="1" fill="${stroke}" />
      <circle cx="15.5" cy="13.5" r="1" fill="${stroke}" />
    `
  } else if (kind === 'team') {
    body = `
      <path d="M12 3.2L19 6.2V11.6C19 16.1 16 19.4 12 20.8C8 19.4 5 16.1 5 11.6V6.2L12 3.2Z" ${common} />
      <path d="M9.4 12.1L11.2 13.9L14.8 10.3" ${common} />
    `
  } else if (kind === 'camera') {
    body = `
      <path d="M4 8.2C4 6.98 4.98 6 6.2 6H8.1L9.4 4.3H14.6L15.9 6H17.8C19.02 6 20 6.98 20 8.2V17.3C20 18.52 19.02 19.5 17.8 19.5H6.2C4.98 19.5 4 18.52 4 17.3V8.2Z" ${common} />
      <circle cx="12" cy="12.8" r="3.4" ${common} />
    `
  } else {
    body = `
      <rect x="6.5" y="3.2" width="11" height="17.6" rx="2.6" ${common} />
      <path d="M10 6.2H14" ${common} />
      <circle cx="12" cy="17.4" r="1" fill="${stroke}" />
    `
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">${body}</svg>`
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
}

const WELCOME_ITEMS: Array<{
  icon: WelcomeIconKind
  title: string
  text: string
}> = [
  {
    icon: 'schedule',
    title: '查赛程与实时比分',
    text: '在「赛程」与「数据」随时查看小组积分、淘汰赛对阵和球员榜单。',
  },
  {
    icon: 'team',
    title: '设置主队与加入球队',
    text: '在「我的」设置支持的主队，或者申请加入学院球队参与赛事。',
  },
  {
    icon: 'camera',
    title: '发绿茵动态与战报',
    text: '在首页分享比赛现场照片、进球瞬间与赛后感言，为球队助威。',
  },
  {
    icon: 'wechat',
    title: '绑定微信快捷登录',
    text: '支持学号密码与微信一键登录，网页端与小程序数据实时互通。',
  },
]

function welcomeKeyFor(session: AuthSession | null): string {
  const userId = session?.user?.id
  return userId ? `${WELCOME_GUIDE_STORAGE_KEY}:${userId}` : `${WELCOME_GUIDE_STORAGE_KEY}:guest`
}

export function CampusWelcomeCard() {
  const [session, setSession] = useState<AuthSession | null>(() => readSession())
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    return subscribeToSessionWrites(() => {
      setSession(readSession())
    })
  }, [])

  useEffect(() => {
    let cancelled = false
    const key = welcomeKeyFor(session)
    try {
      const seen = Taro.getStorageSync(key)
      if (seen) {
        setVisible(false)
        return
      }
    } catch {
      // ignore storage errors
    }

    if (session?.accessToken) {
      void productRepository
        .getCampusMe()
        .then((me) => {
          if (cancelled) return
          if (me?.onboardingCompletedAt) {
            try {
              Taro.setStorageSync(key, '1')
            } catch {
              // ignore
            }
            setVisible(false)
          } else {
            setVisible(true)
          }
        })
        .catch(() => {
          if (!cancelled) {
            setVisible(true)
          }
        })
    } else {
      setVisible(true)
    }

    return () => {
      cancelled = true
    }
  }, [session])

  const dismiss = () => {
    const key = welcomeKeyFor(session)
    try {
      Taro.setStorageSync(key, '1')
    } catch {
      // ignore
    }
    setVisible(false)
    if (session?.accessToken) {
      void productRepository.completeOnboarding().catch(() => {})
    }
  }

  if (!visible) return null

  return (
    <View className="welcome-overlay" onClick={dismiss}>
      <View className="welcome-card" onClick={dismiss}>
        <Text className="welcome-card__kicker">WELCOME TO XIAOQIU</Text>
        <Text className="welcome-card__title">欢迎来到晓球</Text>
        <Text className="welcome-card__lead">
          华中师范大学校园足球赛事与社区平台。在这里，每一场校园比赛都被认真记录：
        </Text>

        <View className="welcome-card__list">
          {WELCOME_ITEMS.map((item) => (
            <View key={item.title} className="welcome-card__item">
              <View className="welcome-card__icon-box">
                <Image
                  className="welcome-card__icon-svg"
                  src={buildWelcomeIconSvg(item.icon)}
                  mode="aspectFit"
                />
              </View>
              <View className="welcome-card__copy">
                <Text className="welcome-card__item-title">{item.title}</Text>
                <Text className="welcome-card__item-text">{item.text}</Text>
              </View>
            </View>
          ))}
        </View>

        <Text className="welcome-card__hint">点击任意位置开始探索</Text>
      </View>
    </View>
  )
}