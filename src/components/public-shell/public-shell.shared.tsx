import { Button, Image, Text, View } from '@tarojs/components'
import Taro, { getCurrentInstance, useDidShow } from '@tarojs/taro'
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PropsWithChildren,
  type ReactNode,
} from 'react'

import { productRepository } from '../../features/product/product.repository'
import { readSession } from '../../features/product/session'
import { useSessionUser } from '../../features/product/session-user'
import { readAccountPresence } from '../../features/product-config/policy-state'
import {
  instantCapabilities,
  instantConfiguration,
} from '../../features/product-config/instant-entry'
import {
  runNavigationEntry,
  runPrivateEntry,
} from '../../features/product-config/navigation-entry.logic'
import { useProductConfiguration } from '../../features/product-config/use-product-config'
import type { TeamSummary } from '../../features/product/product.types'
import type { PublicDataSource } from '../../features/readonly-schedule/readonly-schedule.types'
import { TeamCrest, UserAvatar } from '../product-ui'
import unselectedTeamIcon from '../../assets/navigation/unselected-team.svg'
import { MessagingDrawer, openMessaging } from './messaging-slot'
import { ReportModal, SettingsDialog } from './dialogs'
import { IconButton } from '../icon-button'
import { PersistentHeaderSearch } from './persistent-header-search'
import {
  animateNavigationEntrance,
  captureNavigationOrigin,
  clearNavigationOrigin,
  playTeamFocus,
} from './navigation-transition'
import { TeamNavFocus } from './team-nav-focus'
import { NativeTeamTabFocus } from './team-tab-focus'
import brandMark from '../../assets/home-visual/brand-mark.png'
import { DesktopAccount, useDesktopAccount } from './desktop-account'
import { CampusContext, CampusWelcome } from '../campus-context'
import { prefetchAppData, prefetchSection, prefetchTabsWhenIdle } from './prefetch-tabs'
import { nativeHeaderMetrics } from './native-header-metrics'
import { useNativePreferences } from '../native-ui/preferences'
import { nativeBack, switchNativeSection, useNativeShell } from '../../features/native-navigation'
import { NativeDetailHost } from '../native-navigation/detail-host'

import './index.scss'

export type PublicSection = 'home' | 'schedule' | 'data' | 'team' | 'me' | 'tournaments' | 'teams'

export interface PublicShellProps extends PropsWithChildren {
  active: PublicSection
  headerSearch?: ReactNode
  onActiveReselect?: () => void
  tournamentId?: string | undefined
  source?: PublicDataSource | undefined
  showBack?: boolean
  nativeMain?: boolean
}

const navItems: Array<{ key: PublicSection; label: string; shortLabel: string }> = [
  { key: 'home', label: '首页', shortLabel: 'HOME' },
  { key: 'schedule', label: '赛程', shortLabel: 'MATCH' },
  { key: 'team', label: '', shortLabel: '' },
  { key: 'data', label: '数据', shortLabel: 'DATA' },
  { key: 'me', label: '我的', shortLabel: 'ME' },
]

const primaryTeamCache = new Map<string, TeamSummary | null>()
const primaryTeamListeners = new Set<(key: string, team: TeamSummary | null) => void>()

export function updatePrimaryTeamCache(team: TeamSummary | null): void {
  const session = readSession()
  if (!session) return
  const key = `${session.user.id}:${session.expiresAt}`
  primaryTeamCache.set(key, team)
  for (const listener of primaryTeamListeners) listener(key, team)
}

export function PublicShell({
  active,
  headerSearch,
  onActiveReselect,
  tournamentId,
  showBack = false,
  nativeMain = false,
  children,
}: PublicShellProps) {
  const session = readSession()
  const accountUser = useSessionUser() ?? session?.user
  const desktopAccount = useDesktopAccount()
  useProductConfiguration()
  const teamCacheKey = session ? `${session.user.id}:${session.expiresAt}` : null
  const [menuOpen, setMenuOpen] = useState(false)
  const [feedbackOpen, setFeedbackOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [primaryTeam, setPrimaryTeam] = useState<TeamSummary | null>(() =>
    teamCacheKey && primaryTeamCache.has(teamCacheKey)
      ? (primaryTeamCache.get(teamCacheKey) ?? null)
      : null,
  )
  const [navigatingTo, setNavigatingTo] = useState<PublicSection | null>(null)
  const [nativeTeamReplay, setNativeTeamReplay] = useState(0)
  const shellRef = useRef<HTMLElement | null>(null)
  const normalizedActive = active === 'teams' ? 'team' : active === 'tournaments' ? 'data' : active
  const selectedNavItem = navigatingTo ?? normalizedActive
  const currentPath = normalizePath(getCurrentInstance().router?.path ?? '')
  const nativeHeader = nativeHeaderMetrics()
  const nativePreferences = useNativePreferences()
  const nativeNavigation = useNativeShell(normalizedActive, showBack, tournamentId)

  // The entrance (selection slide + 主队 花纹 growth) runs whenever this page is shown, not only
  // when its shell mounts: Taro keeps visited tab pages alive, so a revisit never remounts.
  const entrance = useRef<{ stop: () => void; at: number } | null>(null)
  const runEntrance = useCallback(() => {
    if (!shellRef.current || Taro.getEnv() !== Taro.ENV_TYPE.WEB) return
    entrance.current?.stop()
    entrance.current = {
      stop: animateNavigationEntrance(shellRef.current, normalizedActive),
      at: Date.now(),
    }
  }, [normalizedActive])
  useLayoutEffect(() => {
    runEntrance()
    return () => {
      entrance.current?.stop()
      entrance.current = null
    }
  }, [runEntrance])
  useDidShow(() => {
    if (Taro.getEnv() === Taro.ENV_TYPE.WEAPP) {
      return
    }
    // The first show of a freshly mounted page is the mount entrance above; never play twice.
    if (entrance.current && Date.now() - entrance.current.at < 400) return
    runEntrance()
  })
  useEffect(() => {
    if (Taro.getEnv() !== Taro.ENV_TYPE.WEAPP || normalizedActive !== 'team' || showBack) return
    const prepare = () => setNativeTeamReplay((value) => value + 1)
    Taro.eventCenter.on('xiaoqiu:native-team-enter', prepare)
    return () => {
      Taro.eventCenter.off('xiaoqiu:native-team-enter', prepare)
    }
  }, [normalizedActive, showBack])

  // Shared viewport-fit primitive: publish the sticky header height so pages can use
  // --xq-vh-avail (effective viewport height after scale C minus the header).
  useEffect(() => {
    if (Taro.getEnv() !== Taro.ENV_TYPE.WEB) return
    const topbar = shellRef.current?.querySelector('.public-topbar')
    if (!topbar || typeof ResizeObserver === 'undefined') return
    const publish = () =>
      document.documentElement.style.setProperty(
        '--xq-header-h',
        `${topbar.getBoundingClientRect().height}px`,
      )
    publish()
    const observer = new ResizeObserver(publish)
    observer.observe(topbar)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (Taro.getEnv() !== Taro.ENV_TYPE.WEB) return
    prefetchAppData()
    prefetchTabsWhenIdle()
  }, [])

  useEffect(() => {
    let mounted = true
    if (!session) {
      setPrimaryTeam(null)
      return () => {
        mounted = false
      }
    }
    if (teamCacheKey && primaryTeamCache.has(teamCacheKey)) {
      setPrimaryTeam(primaryTeamCache.get(teamCacheKey) ?? null)
    }
    void productRepository
      .getTeamPreferences()
      .then((preferences) => {
        if (!mounted) return
        if (teamCacheKey) primaryTeamCache.set(teamCacheKey, preferences.primaryTeam)
        setPrimaryTeam(preferences.primaryTeam)
      })
      .catch(() => {
        if (mounted && (!teamCacheKey || !primaryTeamCache.has(teamCacheKey))) {
          setPrimaryTeam(null)
        }
      })
    return () => {
      mounted = false
    }
  }, [session?.accessToken, teamCacheKey])

  useEffect(() => {
    const listener = (key: string, team: TeamSummary | null) => {
      if (key === teamCacheKey) setPrimaryTeam(team)
    }
    primaryTeamListeners.add(listener)
    return () => {
      primaryTeamListeners.delete(listener)
    }
  }, [teamCacheKey])

  const closeMenu = () => setMenuOpen(false)
  const entryAccount = () => {
    const account = readAccountPresence()
    return {
      hasSession: account.hasSession,
      needsAccount: account.needsAccount,
      organizationId: account.session?.user.organizationId ?? null,
    }
  }
  const notifyUnavailable = (title: string) =>
    Taro.showToast({ title, icon: 'none', duration: 2200 })
  const navigateToSection = async (section: PublicSection) => {
    if (Taro.getEnv() === Taro.ENV_TYPE.WEB) {
      await runNavigationEntry(section, {
        getConfiguration: instantConfiguration,
        account: entryAccount,
        getCapabilities: instantCapabilities,
        navigate: () => performNavigation(section),
        notify: notifyUnavailable,
      })
    } else {
      if (section === normalizedActive && !showBack) {
        if (section === 'team') setNativeTeamReplay((value) => value + 1)
        onActiveReselect?.()
      } else
        await switchNativeSection(
          section === 'teams' ? 'team' : section === 'tournaments' ? 'data' : section,
          tournamentId,
        )
    }
  }
  const performNavigation = async (section: PublicSection) => {
    const guest = Taro.getEnv() === Taro.ENV_TYPE.WEB && !readAccountPresence().hasSession
    const destination = guest && section === 'team' ? 'teams' : section
    const targetPath = getSectionPath(destination, tournamentId)
    // A click during a pending navigation is never dropped: the latest target runs as soon as
    // the current one settles (or its safety timeout passes).
    if (navigationInFlight) {
      queuedNavigation = () => performNavigation(section)
      return
    }
    if (liveRoute(currentPath) === normalizePath(targetPath)) {
      if (normalizePath(targetPath) !== currentPath) return
      if (section === 'team' && Taro.getEnv() === Taro.ENV_TYPE.WEAPP)
        setNativeTeamReplay((value) => value + 1)
      if (section === 'team' && isDesktopH5() && shellRef.current) playTeamFocus(shellRef.current)
      onActiveReselect?.()
      return
    }
    closeMenu()
    navigationInFlight = true
    lastTarget = { path: normalizePath(targetPath), at: Date.now() }
    const desktopH5 = isDesktopH5()
    if (desktopH5 && shellRef.current && liveRoute(currentPath) === currentPath) {
      const target = section === 'teams' ? 'team' : section === 'tournaments' ? 'data' : section
      captureNavigationOrigin(shellRef.current, target)
    } else {
      setNavigatingTo(section)
    }
    try {
      if (!desktopH5 && !prefersReducedMotion()) await wait(160)
      await settleWithin(goToSection(destination, tournamentId), NAVIGATION_SETTLE_MS)
    } catch {
      clearNavigationOrigin()
      lastTarget = null
      void Taro.showToast({ title: '页面切换失败，请重试', icon: 'none' })
    } finally {
      navigationInFlight = false
      setNavigatingTo(null)
      const next = queuedNavigation
      queuedNavigation = null
      if (next) void next()
    }
  }
  const logout = async () => {
    closeMenu()
    primaryTeamCache.clear()
    try {
      await productRepository.logout()
    } finally {
      await Taro.reLaunch({ url: '/pages/login/index' })
    }
  }
  const openFeedback = async () => {
    closeMenu()
    if (!session) {
      await Taro.reLaunch({ url: '/pages/login/index' })
      return
    }
    if (Taro.getEnv() === Taro.ENV_TYPE.WEB)
      await runPrivateEntry(null, {
        getConfiguration: instantConfiguration,
        account: entryAccount,
        getCapabilities: instantCapabilities,
        navigate: () => {
          setFeedbackOpen(true)
        },
        notify: notifyUnavailable,
      })
    else setFeedbackOpen(true)
  }
  const openPrivateMenu = async (kind: 'messages' | 'settings') => {
    closeMenu()
    const open = () => {
      if (kind === 'messages') openMessaging()
      else setSettingsOpen(true)
    }
    if (Taro.getEnv() === Taro.ENV_TYPE.WEB)
      await runPrivateEntry(kind === 'messages' ? 'messages.read' : null, {
        getConfiguration: instantConfiguration,
        account: entryAccount,
        getCapabilities: instantCapabilities,
        navigate: open,
        notify: notifyUnavailable,
      })
    else open()
  }

  return (
    <View
      ref={shellRef}
      style={nativeHeader ? `--native-header-height:${nativeHeader.height}px;` : ''}
      className={`public-app ${Taro.getEnv() === Taro.ENV_TYPE.WEB ? 'public-app--h5' : ''} public-app--section-${normalizedActive} ${active === 'home' && !showBack ? 'public-app--home' : ''}${nativeHeader && nativePreferences.largeText ? ' native-large-text' : ''}${nativeHeader && showBack ? ' native-page--detail' : ''}`}
      {...nativeNavigation.touchHandlers}
    >
      <View
        className="public-topbar"
        style={
          nativeHeader
            ? `position:sticky;top:0;z-index:50;box-sizing:border-box;width:100%;height:${nativeHeader.height}px;padding-top:${nativeHeader.top}px;padding-bottom:12px;background:#faf9f5;border-bottom:1px solid #dfe5dc;`
            : ''
        }
      >
        <View
          className="public-topbar__inner"
          style={
            nativeHeader
              ? `position:relative;display:flex;align-items:center;justify-content:center;width:100%;height:${nativeHeader.rowHeight}px;min-height:${nativeHeader.rowHeight}px;margin:0;padding:0;`
              : ''
          }
        >
          <View
            className="public-brand-area"
            style={
              nativeHeader
                ? `position:absolute;left:50%;top:0;transform:translateX(-50%);height:${nativeHeader.rowHeight}px;display:flex;align-items:center;justify-content:center;`
                : ''
            }
          >
            {showBack && !nativeHeader && (
              <IconButton
                icon="back"
                aria-label="返回"
                className="public-back"
                onClick={() => void goBack(active, tournamentId)}
              >
                <Text className="public-back__glyph">←</Text>
              </IconButton>
            )}
            <View
              className="public-brand"
              style={
                nativeHeader
                  ? 'display:flex;align-items:center;justify-content:center;gap:6px;width:auto;height:100%;margin:0;padding:0;position:static;transform:none;'
                  : ''
              }
              onClick={() => void navigateToSection('home')}
            >
              {Taro.getEnv() === Taro.ENV_TYPE.WEAPP ? (
                <Image
                  className="public-brand__image"
                  mode="aspectFit"
                  src={brandMark}
                  style="width:60rpx;height:54rpx;display:block;flex:none;"
                />
              ) : (
                <View aria-hidden="true" className="public-brand__mark" />
              )}
              <View className="public-brand__copy" style={nativeHeader ? 'display:block;' : ''}>
                <Text
                  className="public-brand__name"
                  style={
                    nativeHeader
                      ? 'display:block;font-size:18px;line-height:1;font-weight:800;color:#193f2a;white-space:nowrap;'
                      : ''
                  }
                >
                  晓球
                </Text>
                <Text className="public-brand__caption" style={nativeHeader ? 'display:none;' : ''}>
                  把校园比赛认真记录下来
                </Text>
              </View>
            </View>
          </View>

          <View
            className={`public-nav public-nav--selected-${selectedNavItem}`}
            style={nativeHeader ? 'display:none;' : ''}
          >
            <View aria-hidden="true" className="public-nav__selection">
              <View className="public-nav__line" />
              <View className="public-nav__arc" />
            </View>
            {navItems.map((item) =>
              item.key === 'team' ? (
                <Button
                  aria-label={primaryTeam ? `打开${primaryTeam.name}` : '打开主队'}
                  className={`public-team-nav ${selectedNavItem === item.key ? 'public-team-nav--active' : ''}`}
                  hoverClass="none"
                  key={item.key}
                  aria-current={normalizedActive === item.key ? 'page' : ''}
                  onClick={() => void navigateToSection(item.key)}
                  {...(Taro.getEnv() === Taro.ENV_TYPE.WEB
                    ? { onMouseEnter: () => prefetchSection(item.key) }
                    : {})}
                >
                  <TeamNavFocus team={primaryTeam} />
                  {primaryTeam ? (
                    <TeamCrest team={primaryTeam} size="large" eager />
                  ) : (
                    <Text className="public-team-nav__crest public-team-nav__crest--empty">主</Text>
                  )}
                </Button>
              ) : (
                <Button
                  className={`public-nav__item ${selectedNavItem === item.key ? 'public-nav__item--active' : ''}`}
                  hoverClass="none"
                  key={item.key}
                  aria-current={normalizedActive === item.key ? 'page' : ''}
                  onClick={() => void navigateToSection(item.key)}
                  {...(Taro.getEnv() === Taro.ENV_TYPE.WEB
                    ? { onMouseEnter: () => prefetchSection(item.key) }
                    : {})}
                >
                  <View
                    aria-hidden="true"
                    className={`public-nav__icon public-nav__icon--${item.key}`}
                  />
                  <Text className="public-nav__label">{item.label}</Text>
                </Button>
              ),
            )}
          </View>

          <View
            className="public-account-wrap"
            style={
              nativeHeader
                ? `position:absolute;left:14px;right:auto;top:0;transform:none;height:${nativeHeader.rowHeight}px;display:flex;align-items:center;margin:0;`
                : ''
            }
          >
            <View className="public-header-search" style={nativeHeader ? 'display:none;' : ''}>
              {headerSearch === undefined ? <PersistentHeaderSearch /> : headerSearch}
            </View>
            {desktopAccount ? (
              <DesktopAccount
                user={session?.user ?? null}
                onProfile={() => void navigateToSection('me')}
                onMessages={() => void openPrivateMenu('messages')}
                onSettings={() => void openPrivateMenu('settings')}
                onFeedback={() => void openFeedback()}
                onLogout={() => void logout()}
              />
            ) : (
              <>
                <Button
                  aria-label="打开账户菜单"
                  aria-expanded={menuOpen}
                  className="public-account"
                  onClick={() => setMenuOpen((value) => !value)}
                >
                  <View className="public-account__avatar">
                    <UserAvatar
                      avatarUrl={accountUser?.avatarUrl ?? null}
                      name={accountUser?.displayName ?? '访客'}
                      size="small"
                    />
                  </View>
                  <View className="public-account__copy">
                    <Text className="public-account__name">
                      {session?.user.displayName ?? '游客模式'}
                    </Text>
                  </View>
                </Button>

                {menuOpen && (
                  <View className="public-account-menu">
                    <View className="public-account-menu__identity">
                      <Text>{session?.user.displayName ?? '游客'}</Text>
                      <Text>{session ? `@${session.user.username}` : '公开浏览模式'}</Text>
                    </View>
                    {!session && (
                      <Button
                        className="public-account-menu__item"
                        onClick={() => void Taro.reLaunch({ url: '/pages/login/index' })}
                      >
                        登录或注册
                      </Button>
                    )}
                    {session && (
                      <Button
                        className="public-account-menu__item"
                        onClick={() => void openPrivateMenu('messages')}
                      >
                        消息与私信
                      </Button>
                    )}
                    <Button
                      className="public-account-menu__item"
                      onClick={() => void openFeedback()}
                    >
                      问题反馈
                    </Button>
                    <Button
                      className="public-account-menu__item"
                      onClick={() => void openPrivateMenu('settings')}
                    >
                      设置
                    </Button>
                    <View className="public-account-menu__version">
                      <Text>晓球 V1.0.0</Text>
                    </View>
                    {session && (
                      <Button
                        className="public-account-menu__item public-account-menu__item--danger"
                        onClick={() => void logout()}
                      >
                        退出登录
                      </Button>
                    )}
                  </View>
                )}
              </>
            )}
          </View>
        </View>
      </View>

      {menuOpen && !desktopAccount && <View className="public-menu-scrim" onClick={closeMenu} />}

      <View
        className="public-content"
        style={nativeHeader && nativeMain ? 'width:100%;min-height:0;padding:0;margin:0;' : ''}
      >
        {nativeHeader && showBack && (
          <Button
            className="native-page-back"
            style="display:flex;align-items:center;justify-content:center;flex:none;box-sizing:border-box;width:44px;height:44px;min-height:44px;margin:0;padding:0;border:0;border-radius:50%;box-shadow:none;background:transparent;line-height:1;"
            onClick={() => void nativeBack()}
            aria-label="返回上一页"
          >
            <View className="native-page-back__icon" style="width:24px;height:24px;flex:none;" />
          </Button>
        )}
        <CampusContext active={active}>{children}</CampusContext>
      </View>

      <View className="public-footer">
        <Text className="public-footer__brand">晓球</Text>
        <Text className="public-footer__copy">校园足球的赛程、球队与公开名单</Text>
      </View>

      {!(nativeHeader && showBack) && (
        <View className={`mobile-tabbar${nativeHeader ? ' mobile-tabbar--fluid' : ''}`}>
          {nativeHeader && (
            <View className="native-tabbar-track">
              <View
                className="native-tabbar-highlight"
                style={`transform:translateX(${nativeNavigation.index * 100}%);transition-duration:${nativeNavigation.duration}ms;`}
              />
            </View>
          )}
          {Taro.getEnv() === Taro.ENV_TYPE.WEAPP && normalizedActive === 'team' && (
            <NativeTeamTabFocus key={nativeTeamReplay} team={primaryTeam} />
          )}
          {navItems.map((item) =>
            item.key === 'team' ? (
              <Button
                aria-label={primaryTeam ? `打开${primaryTeam.name}` : '打开主队'}
                className={`mobile-team-tab ${normalizedActive === item.key ? 'mobile-team-tab--active' : ''} ${navigatingTo === item.key ? 'mobile-team-tab--switching' : ''}`}
                key={item.key}
                onClick={() => void navigateToSection(item.key)}
                {...(Taro.getEnv() === Taro.ENV_TYPE.WEB
                  ? { onTouchStart: () => prefetchSection(item.key) }
                  : {})}
              >
                {primaryTeam ? (
                  <TeamCrest team={primaryTeam} size="large" eager interactive={false} />
                ) : Taro.getEnv() === Taro.ENV_TYPE.WEAPP ? (
                  <Image
                    className="mobile-team-tab__crest mobile-team-tab__crest--native-empty"
                    src={unselectedTeamIcon}
                    mode="aspectFit"
                  />
                ) : (
                  <Text className="mobile-team-tab__crest mobile-team-tab__crest--empty">主</Text>
                )}
              </Button>
            ) : (
              <Button
                className={`mobile-tabbar__item ${normalizedActive === item.key ? 'mobile-tabbar__item--active' : ''} ${navigatingTo === item.key ? 'mobile-tabbar__item--switching' : ''}`}
                key={item.key}
                onClick={() => void navigateToSection(item.key)}
                {...(Taro.getEnv() === Taro.ENV_TYPE.WEB
                  ? { onTouchStart: () => prefetchSection(item.key) }
                  : {})}
              >
                {Taro.getEnv() === Taro.ENV_TYPE.WEAPP && (
                  <View
                    aria-hidden="true"
                    className={`mobile-tabbar__icon mobile-tabbar__icon--${item.key}`}
                  />
                )}
                <Text className="mobile-tabbar__mark">{item.shortLabel}</Text>
                <Text className="mobile-tabbar__label">{item.label}</Text>
              </Button>
            ),
          )}
        </View>
      )}
      {nativeHeader && !showBack && <NativeDetailHost />}
      {session && <MessagingDrawer />}
      {session && <CampusWelcome />}
      {feedbackOpen && (
        <ReportModal
          targetType="FEEDBACK"
          title="问题反馈"
          onClose={() => setFeedbackOpen(false)}
        />
      )}
      {settingsOpen && <SettingsDialog onClose={() => setSettingsOpen(false)} />}
    </View>
  )
}

async function goBack(active: PublicSection, tournamentId?: string) {
  try {
    await Taro.navigateBack({ delta: 1 })
  } catch {
    await goToSection(active, tournamentId)
  }
}

async function goToSection(section: PublicSection, tournamentId?: string) {
  if (section === 'me' && !readSession()) {
    await Taro.reLaunch({ url: '/pages/login/index' })
    return
  }
  const url = getSectionPath(section, tournamentId)
  if (Taro.getEnv() === Taro.ENV_TYPE.WEB) {
    await Taro.redirectTo({ url })
    return
  }
  await Taro.reLaunch({ url })
}

function getSectionPath(section: PublicSection, tournamentId?: string): string {
  const encodedTournamentId = tournamentId ? encodeURIComponent(tournamentId) : ''
  const fallback = '/pages/readonly-tournaments/index'
  const paths: Record<PublicSection, string> = {
    home:
      Taro.getEnv() === Taro.ENV_TYPE.WEAPP && encodedTournamentId
        ? `/pages/index/index?tournamentId=${encodedTournamentId}`
        : '/pages/index/index',
    tournaments: fallback,
    schedule: encodedTournamentId
      ? `/pages/readonly-schedule/index?tournamentId=${encodedTournamentId}`
      : fallback,
    teams: encodedTournamentId
      ? `/pages/readonly-teams/index?tournamentId=${encodedTournamentId}`
      : fallback,
    data: encodedTournamentId
      ? `/pages/data-center/index?tournamentId=${encodedTournamentId}`
      : '/pages/data-center/index',
    team: encodedTournamentId
      ? `/pages/my-team/index?tournamentId=${encodedTournamentId}`
      : '/pages/my-team/index',
    me: '/pages/me/index',
  }
  return paths[section]
}

/** One navigation at a time across every (kept-alive) page shell; the latest extra click waits. */
let navigationInFlight = false
let queuedNavigation: (() => Promise<void>) | null = null
const NAVIGATION_SETTLE_MS = 1500

/** Resolves when `task` settles or after `ms`, so a router promise that never settles cannot lock the nav. */
function settleWithin(task: Promise<unknown>, ms: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms)
    task.then(
      () => {
        clearTimeout(timer)
        resolve()
      },
      (error: unknown) => {
        clearTimeout(timer)
        reject(error)
      },
    )
  })
}

/** The route actually on screen (a queued click may come from a page that is now hidden). */
let lastTarget: { path: string; at: number } | null = null
function liveRoute(fallback: string): string {
  // Right after a navigation starts the router/location can still report the old page.
  if (lastTarget && Date.now() - lastTarget.at < 2000) return lastTarget.path
  if (Taro.getEnv() === Taro.ENV_TYPE.WEB && typeof location !== 'undefined') {
    const route = location.hash.startsWith('#/') ? location.hash.slice(1) : location.pathname
    if (route.startsWith('/pages/')) return normalizePath(route)
  }
  const pages = Taro.getCurrentPages?.() ?? []
  const route = pages[pages.length - 1]?.route
  return route ? normalizePath(route) : fallback
}

function normalizePath(path: string): string {
  const pathname = path.split('?')[0] ?? ''
  return pathname.startsWith('/') ? pathname : `/${pathname}`
}

function prefersReducedMotion(): boolean {
  return (
    Taro.getEnv() === Taro.ENV_TYPE.WEB &&
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

function isDesktopH5(): boolean {
  return (
    Taro.getEnv() === Taro.ENV_TYPE.WEB &&
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(min-width: 721px)').matches
  )
}

function wait(duration: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, duration))
}
