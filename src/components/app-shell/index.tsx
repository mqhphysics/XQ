import { Image, ScrollView, Slot, Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useEffect, useState, type ReactNode } from 'react'
import loadingRingIcon from '../../assets/loading-ring.svg'
import brandBallMark from '../../assets/login-art/ball.webp'
import { peekProduct, productRepository } from '../../services/api'
import { readSession, subscribeToSessionWrites } from '../../store/session'
import {
  knownTournamentId,
  rememberTournamentId,
  subscribeToTournamentWrites,
} from '../../store/tournament'
import type {
  AuthSession,
  HomeResponse,
  TabSection,
  TournamentSummary,
} from '../../types'
import { UserAvatar } from '../team-crest'
import './index.scss'

interface AppShellProps {
  active: TabSection
  tournamentId?: string
  refreshing?: boolean
  onRefresh?: () => void
  onScrollToLower?: () => void
  onBrandClick?: () => void
  onSelectTournament?: (tournament: TournamentSummary) => void
  children: ReactNode
}

const NAV_ITEMS: Array<{
  key: TabSection
  label: string
}> = [
  { key: 'home', label: '首页' },
  { key: 'schedule', label: '赛程' },
  { key: 'stats', label: '数据' },
  { key: 'me', label: '我的' },
]

export function AppShell({
  active,
  tournamentId,
  refreshing = false,
  onRefresh,
  onScrollToLower,
  onBrandClick,
  onSelectTournament,
  children,
}: AppShellProps) {
  const [session, setSession] = useState<AuthSession | null>(() => readSession())
  const [activeId, setActiveId] = useState<string>(
    () => tournamentId || knownTournamentId() || '',
  )
  const [tournaments, setTournaments] = useState<TournamentSummary[]>(() => {
    const initialId = tournamentId || knownTournamentId()
    const cachedHome = peekProduct<HomeResponse>(
      `/public/home${initialId ? `?tournamentId=${encodeURIComponent(initialId)}` : ''}`,
    )
    return cachedHome?.tournaments ?? []
  })
  const [pickerOpen, setPickerOpen] = useState(false)

  useEffect(() => {
    return subscribeToSessionWrites(() => {
      setSession(readSession())
    })
  }, [])

  useEffect(() => {
    if (tournamentId) {
      setActiveId(tournamentId)
    }
  }, [tournamentId])

  useEffect(() => {
    return subscribeToTournamentWrites(() => {
      const latest = knownTournamentId()
      if (latest) {
        setActiveId(latest)
      }
    })
  }, [])

  useEffect(() => {
    let cancelled = false
    const targetId = tournamentId || activeId || undefined
    void productRepository
      .getHome(targetId)
      .then((res) => {
        if (cancelled) return
        setTournaments(res.tournaments)
        const resolvedId = targetId || res.tournament.id
        setActiveId(resolvedId)
        rememberTournamentId(resolvedId)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [activeId, tournamentId])

  const currentTournament =
    tournaments.find((item) => item.id === activeId) ?? tournaments[0] ?? null

  const handleChooseTournament = (item: TournamentSummary) => {
    setPickerOpen(false)
    setActiveId(item.id)
    rememberTournamentId(item.id)
    onSelectTournament?.(item)
  }

  const handleOpenBrand = () => {
    if (onBrandClick) {
      onBrandClick()
      return
    }
    if (active !== 'home') {
      void Taro.reLaunch({ url: '/pages/home/index' })
    }
  }

  const handleOpenProfile = () => {
    if (session?.user) {
      if (active !== 'me') {
        void Taro.showToast({
          title: '「我的」页面将在后续步骤开放',
          icon: 'none',
        })
      }
      return
    }
    void Taro.showToast({
      title: '登录页将在后续步骤开放',
      icon: 'none',
    })
  }

  const handleSwitchTab = (item: (typeof NAV_ITEMS)[number]) => {
    if (item.key === active) return
    if (item.key === 'home') {
      void Taro.reLaunch({ url: '/pages/home/index' })
      return
    }
    void Taro.showToast({
      title: `「${item.label}」页面将在后续步骤开放`,
      icon: 'none',
    })
  }

  return (
    <View className="app-shell">
      {/* 固定顶部品牌导航栏 */}
      <View className="app-shell__topbar">
        <View className="app-shell__brand" onClick={handleOpenBrand}>
          <Image
            className="app-shell__brand-logo"
            src={brandBallMark}
            mode="aspectFit"
          />
          <View className="app-shell__brand-copy">
            <Text className="app-shell__brand-title">晓球</Text>
            <Text className="app-shell__brand-sub">校园足球社区</Text>
          </View>
        </View>

        <View className="app-shell__actions">
          {currentTournament ? (
            <View
              className="app-shell__tour-pill"
              onClick={() => {
                if (tournaments.length > 1 && onSelectTournament) {
                  setPickerOpen((prev) => !prev)
                }
              }}
            >
              <Text className="app-shell__tour-text">
                {currentTournament.name}
              </Text>
              {tournaments.length > 1 && onSelectTournament ? (
                <Text className="app-shell__tour-caret">▾</Text>
              ) : null}
            </View>
          ) : null}

          <View className="app-shell__user-pill" onClick={handleOpenProfile}>
            {session?.user ? (
              <>
                <UserAvatar
                  name={session.user.displayName}
                  avatarUrl={session.user.avatarUrl}
                  size="small"
                />
                <Text className="app-shell__user-name">
                  {session.user.displayName}
                </Text>
              </>
            ) : (
              <Text className="app-shell__login-text">登录</Text>
            )}
          </View>
        </View>
      </View>

      {pickerOpen && tournaments.length > 1 ? (
        <View className="app-shell__tour-menu">
          {tournaments.map((item) => (
            <View
              key={item.id}
              className={`app-shell__tour-option ${item.id === currentTournament?.id ? 'app-shell__tour-option--active' : ''}`}
              onClick={() => handleChooseTournament(item)}
            >
              <Text className="app-shell__tour-option-name">{item.name}</Text>
              <Text className="app-shell__tour-option-meta">
                {item.seasonLabel}
              </Text>
            </View>
          ))}
        </View>
      ) : null}

      {/* 中间自定义下拉刷新 + 触底加载滚动容器（与原版 NativeRefreshScroll 一致） */}
      <ScrollView
        scrollY
        enableFlex
        showScrollbar={false}
        lowerThreshold={280}
        refresherEnabled={Boolean(onRefresh)}
        refresherThreshold={68}
        refresherDefaultStyle="none"
        refresherBackground="transparent"
        refresherTriggered={Boolean(onRefresh && refreshing)}
        onRefresherRefresh={() => onRefresh?.()}
        onScrollToLower={() => onScrollToLower?.()}
        className="app-shell__scroll"
      >
        <Slot name="refresher">
          <View
            className={`native-refresh-indicator ${refreshing ? 'native-refresh-indicator--active' : ''}`}
          >
            <View className="native-refresh-indicator__badge">
              <Image
                className="native-refresh-indicator__icon"
                src={loadingRingIcon}
                mode="aspectFit"
              />
            </View>
          </View>
        </Slot>

        <View className="app-shell__content">{children}</View>
      </ScrollView>

      {/* 固定底部 Tab 栏 */}
      <View className="app-shell__tabbar">
        {NAV_ITEMS.map((item) => {
          const isActive = item.key === active
          return (
            <View
              key={item.key}
              className={`app-shell__tab ${isActive ? 'app-shell__tab--active' : ''}`}
              onClick={() => handleSwitchTab(item)}
            >
              <View className={`app-shell__tab-icon app-shell__tab-icon--${item.key}`} />
              <Text className="app-shell__tab-label">{item.label}</Text>
            </View>
          )
        })}
      </View>
    </View>
  )
}