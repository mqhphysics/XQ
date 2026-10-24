import { Image, Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { type PropsWithChildren, useEffect, useMemo, useState } from 'react'
import brandMark from '../../assets/home-visual/brand-mark.png'
import unselectedTeamCrest from '../../assets/navigation/unselected-team.svg'
import { peekProduct, productRepository, sizedMediaUrl } from '../../services/api'
import { clearSession, readSession, subscribeToSessionWrites } from '../../store/session'
import { knownTournamentId } from '../../store/tournament'
import type { AuthSession, HomeResponse, TeamSummary } from '../../types'
import { TeamCrest, UserAvatar } from '../team-crest'
import './index.scss'

export type NavSection = 'home' | 'schedule' | 'team' | 'data' | 'me'

interface AppShellProps extends PropsWithChildren {
  active: NavSection
  onSectionChange?: (section: NavSection) => void
  tournamentId?: string
  showBack?: boolean
  onBack?: () => void
  onBrandClick?: () => void
}

interface HeaderMetrics {
  top: number
  rowHeight: number
  height: number
}

const NAV_SECTIONS: NavSection[] = ['home', 'schedule', 'team', 'data', 'me']

let cachedMetrics: HeaderMetrics | null = null
const cachedTeamsByTournament = new Map<string, TeamSummary[]>()
const cachedPrimaryTeamByTournament = new Map<string, string | null>()

export function getHeaderMetrics(): HeaderMetrics {
  if (cachedMetrics) return cachedMetrics
  try {
    const windowInfo = Taro.getWindowInfo()
    const menu = Taro.getMenuButtonBoundingClientRect?.()
    const status = windowInfo.statusBarHeight ?? 20
    const top = menu?.top || status + 6
    const rowHeight = Math.max(32, menu?.height || 32)
    cachedMetrics = {
      top,
      rowHeight,
      height: top + rowHeight + 12,
    }
    return cachedMetrics
  } catch {
    return {
      top: 26,
      rowHeight: 32,
      height: 70,
    }
  }
}

export function AppShell({
  active,
  onSectionChange,
  tournamentId,
  showBack = false,
  onBack,
  onBrandClick,
  children,
}: AppShellProps) {
  const [session, setSession] = useState<AuthSession | null>(() => readSession())
  const [menuOpen, setMenuOpen] = useState(false)
  const resolvedTournamentId = tournamentId || knownTournamentId() || '__default__'

  const [teams, setTeams] = useState<TeamSummary[]>(() => {
    const fromMap = cachedTeamsByTournament.get(resolvedTournamentId)
    if (fromMap) return fromMap
    const homeSnap = peekProduct<HomeResponse>('/public/home')
    return homeSnap?.teams ?? []
  })

  const [primaryTeamId, setPrimaryTeamId] = useState<string | null>(
    () => cachedPrimaryTeamByTournament.get(resolvedTournamentId) ?? null,
  )

  const metrics = useMemo(() => getHeaderMetrics(), [])
  const activeIndex = Math.max(0, NAV_SECTIONS.indexOf(active))

  useEffect(() => {
    return subscribeToSessionWrites(() => {
      setSession(readSession())
      cachedPrimaryTeamByTournament.clear()
    })
  }, [])

  useEffect(() => {
    let cancelled = false
    const existing = cachedTeamsByTournament.get(resolvedTournamentId)
    if (existing) {
      setTeams(existing)
    } else {
      void productRepository
        .getHome(tournamentId || knownTournamentId() || undefined)
        .then((res) => {
          if (cancelled) return
          cachedTeamsByTournament.set(resolvedTournamentId, res.teams)
          cachedTeamsByTournament.set(res.tournament.id, res.teams)
          setTeams(res.teams)
        })
        .catch(() => {})
    }

    if (session?.accessToken) {
      void productRepository
        .getTeamPreferences(tournamentId || knownTournamentId() || undefined)
        .then((pref) => {
          if (cancelled) return
          cachedPrimaryTeamByTournament.set(resolvedTournamentId, pref.primaryTeamId)
          setPrimaryTeamId(pref.primaryTeamId)
        })
        .catch(() => {})
    } else {
      setPrimaryTeamId(null)
    }

    return () => {
      cancelled = true
    }
  }, [resolvedTournamentId, tournamentId, session?.accessToken])

  const favoriteTeam = useMemo(() => {
    if (!primaryTeamId) return null
    return teams.find((item) => item.id === primaryTeamId) ?? null
  }, [primaryTeamId, teams])

  const favoriteCrestUrl = sizedMediaUrl(favoriteTeam?.crestUrl, { width: 128 })

  const handleSelectSection = (section: NavSection) => {
    setMenuOpen(false)
    if (section === active) return
    if (onSectionChange) {
      onSectionChange(section)
      return
    }
    void Taro.reLaunch({
      url: `/pages/home/index?section=${section}`,
    })
  }

  const handleBack = () => {
    setMenuOpen(false)
    if (onBack) {
      onBack()
      return
    }
    const pages = Taro.getCurrentPages()
    if (pages.length > 1) {
      void Taro.navigateBack()
    } else {
      handleSelectSection('home')
    }
  }

  const handleLogout = () => {
    clearSession()
    setSession(null)
    setMenuOpen(false)
    void Taro.showToast({ title: '已退出登录', icon: 'none' })
  }

  return (
    <View className="app-shell">
      <View
        className="app-shell__topbar"
        style={{
          paddingTop: `${metrics.top}px`,
          paddingBottom: '12px',
          height: `${metrics.height}px`,
        }}
      >
        <View
          className="app-shell__topbar-inner"
          style={{
            height: `${metrics.rowHeight}px`,
            minHeight: `${metrics.rowHeight}px`,
          }}
        >
          <View
            className="app-shell__left"
            style={{
              height: `${metrics.rowHeight}px`,
            }}
          >
            {showBack ? (
              <View className="app-shell__back-btn" onClick={handleBack}>
                <View className="app-shell__back-icon" />
              </View>
            ) : (
              <View className="app-shell__account-wrap">
                <View
                  className="app-shell__account-btn"
                  onClick={() => setMenuOpen((prev) => !prev)}
                >
                  <UserAvatar
                    name={session?.user.displayName || '访客'}
                    avatarUrl={session?.user.avatarUrl}
                    size="small"
                  />
                </View>
                {menuOpen ? (
                  <View className="app-shell__account-menu">
                    <View className="app-shell__account-summary">
                      <Text className="app-shell__account-title">
                        {session ? session.user.displayName : '游客浏览模式'}
                      </Text>
                      <Text className="app-shell__account-sub">
                        {session
                          ? session.user.email || session.user.username
                          : '登录后可发帖、评论与管理主队'}
                      </Text>
                    </View>
                    <View
                      className="app-shell__menu-item"
                      onClick={() => handleSelectSection('me')}
                    >
                      <Text>{session ? '进入个人中心' : '前往登录 / 注册'}</Text>
                    </View>
                    {session ? (
                      <View
                        className="app-shell__menu-item app-shell__menu-item--danger"
                        onClick={handleLogout}
                      >
                        <Text>退出当前账号</Text>
                      </View>
                    ) : null}
                  </View>
                ) : null}
              </View>
            )}
          </View>

          <View
            className="app-shell__brand-area"
            style={{
              height: `${metrics.rowHeight}px`,
            }}
          >
            <View
              className="app-shell__brand"
              onClick={() => {
                setMenuOpen(false)
                if (onBrandClick) onBrandClick()
                else handleSelectSection('home')
              }}
            >
              <Image className="app-shell__brand-logo" src={brandMark} mode="aspectFit" />
              <Text className="app-shell__brand-name">晓球</Text>
            </View>
          </View>
        </View>
      </View>

      <View className="app-shell__body" onClick={() => menuOpen && setMenuOpen(false)}>
        {children}
      </View>

      <View className="app-shell__tabbar">
        <View className="app-shell__tabbar-track">
          <View
            className="app-shell__tabbar-highlight"
            style={{
              transform: `translate3d(${activeIndex * 100}%, 0, 0)`,
              opacity: active === 'team' ? 0 : 1,
            }}
          />
        </View>

        <View
          className={`app-shell__tab ${active === 'home' ? 'app-shell__tab--active' : ''}`}
          onClick={() => handleSelectSection('home')}
        >
          <View className="app-shell__tab-icon app-shell__tab-icon--home" />
          <Text className="app-shell__tab-label">首页</Text>
        </View>

        <View
          className={`app-shell__tab ${active === 'schedule' ? 'app-shell__tab--active' : ''}`}
          onClick={() => handleSelectSection('schedule')}
        >
          <View className="app-shell__tab-icon app-shell__tab-icon--schedule" />
          <Text className="app-shell__tab-label">赛程</Text>
        </View>

        <View
          className={`app-shell__team-tab ${active === 'team' ? 'app-shell__team-tab--active' : ''}`}
          onClick={() => handleSelectSection('team')}
        >
          {favoriteTeam ? (
            favoriteCrestUrl ? (
              <Image
                className="app-shell__team-crest-img"
                src={favoriteCrestUrl}
                mode="aspectFit"
              />
            ) : (
              <TeamCrest
                teamCode={favoriteTeam.teamCode}
                name={favoriteTeam.shortName}
                color={favoriteTeam.primaryColor || undefined}
                crestUrl={favoriteTeam.crestUrl}
                size="medium"
              />
            )
          ) : (
            <Image
              className="app-shell__team-crest-img app-shell__team-crest-img--empty"
              src={unselectedTeamCrest}
              mode="aspectFit"
            />
          )}
        </View>

        <View
          className={`app-shell__tab ${active === 'data' ? 'app-shell__tab--active' : ''}`}
          onClick={() => handleSelectSection('data')}
        >
          <View className="app-shell__tab-icon app-shell__tab-icon--data" />
          <Text className="app-shell__tab-label">数据</Text>
        </View>

        <View
          className={`app-shell__tab ${active === 'me' ? 'app-shell__tab--active' : ''}`}
          onClick={() => handleSelectSection('me')}
        >
          <View className="app-shell__tab-icon app-shell__tab-icon--me" />
          <Text className="app-shell__tab-label">我的</Text>
        </View>
      </View>
    </View>
  )
}