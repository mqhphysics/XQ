import Taro from '@tarojs/taro'
import { useEffect, useRef, useState } from 'react'
import { UserAvatar } from '../product-ui'
import { VerificationBadge } from '../verification-badge'
import { ProfileIcon } from '../../pages/me/profile-icons.h5'
import { useBrowserPreferences, usePreferenceValues } from '../settings-dialog/preferences.h5'
import { InformationEntryDialog } from '../../features/match-report/information-entry-dialog.h5'
import { readSession, subscribeToSessionChanges } from '../../features/product/session.h5'
import { productRepository } from '../../features/product/product.repository'
import { useBadgeDisplay } from '../../features/product/badge-display.h5'
import { displayedBadgeKind, identityLabels } from '../../features/product/identity-badges'
import { libraryKey, parseLibrary } from '../../pages/me/profile.logic'
import { openMessaging } from '../messaging-drawer/index.h5'
import {
  visibleMessageCategories,
  type MessageCategory,
} from '../messaging-drawer/message-categories.h5'
import { runPrivateEntry } from '../../features/product-config/navigation-entry.logic'
import { getConfiguration, readAccountPresence } from '../../features/product-config/policy-state'
import { productConfigRepository } from '../../features/product-config/product-config.repository'
import type { DesktopAccountProps } from './desktop-account'
import { canShowTestRoles, endTestRoleControl } from '../../features/product/test-role.h5'
import { TestRoleDialog } from './test-role-dialog.h5'
import './desktop-account.h5.scss'

export function useDesktopAccount() {
  const [desktop, setDesktop] = useState(() => window.matchMedia('(min-width: 721px)').matches)
  useEffect(() => {
    const media = window.matchMedia('(min-width: 721px)')
    const sync = () => setDesktop(media.matches)
    media.addEventListener('change', sync)
    return () => media.removeEventListener('change', sync)
  }, [])
  return desktop
}
export function DesktopAccount({
  user: initialUser,
  onProfile,
  onMessages,
  onSettings,
  onFeedback,
  onLogout,
}: DesktopAccountProps) {
  useBrowserPreferences()
  const preferences = usePreferenceValues()
  const [user, setUser] = useState(() => readSession()?.user ?? initialUser)
  useEffect(() => {
    setUser(readSession()?.user ?? initialUser)
    return subscribeToSessionChanges(() => setUser(readSession()?.user ?? null))
  }, [initialUser?.id, initialUser?.organizationId])
  const preferred = useBadgeDisplay(user?.id ?? '')
  const badge = user
    ? displayedBadgeKind(user.verificationLevel, user.roles, false, preferred)
    : null
  const [open, setOpen] = useState(false),
    [mailOpen, setMailOpen] = useState(false),
    [report, setReport] = useState(false)
  const [testRoles, setTestRoles] = useState(false)
  const [placement, setPlacement] = useState({ left: -116, shift: 0 })
  // Mail menu: centred under the icon when it fits, nudged left only as far as the edge requires.
  const [mailPlacement, setMailPlacement] = useState({ left: -58, caret: 75 })
  const openMail = () => {
    clearTimeout(mailTimer.current)
    const rect = mail.current?.getBoundingClientRect()
    if (rect) {
      const width = 150
      const center = rect.left + rect.width / 2
      const left = Math.max(12, Math.min(center - width / 2, window.innerWidth - width - 12))
      setMailPlacement({ left: left - rect.left, caret: center - left })
    }
    setMailOpen(true)
  }
  const [stats, setStats] = useState<Array<number | string>>(['—', '—', '—'])
  const account = useRef<HTMLDivElement>(null),
    mail = useRef<HTMLDivElement>(null)
  const timer = useRef<ReturnType<typeof setTimeout>>(),
    mailTimer = useRef<ReturnType<typeof setTimeout>>()
  const loaded = useRef('')
  const close = () => {
    clearTimeout(timer.current)
    setOpen(false)
  }
  const show = () => {
    clearTimeout(timer.current)
    const rect = account.current?.getBoundingClientRect()
    if (rect) {
      const left = Math.max(16, Math.min(rect.left + rect.width / 2 - 140, window.innerWidth - 296))
      setPlacement({ left: left - rect.left, shift: left + 140 - (rect.left + rect.width / 2) })
    }
    setOpen(true)
    const session = readSession()
    if (!user || loaded.current === session?.accessToken) return
    loaded.current = session?.accessToken ?? ''
    void Promise.allSettled([
      productRepository.getHome(),
      productRepository.getTeamPreferences(),
    ]).then(([home, teams]) => {
      if (readSession()?.accessToken !== session?.accessToken) return
      let bookmarks: number | string = '—'
      try {
        bookmarks = parseLibrary(localStorage.getItem(libraryKey(user))).bookmarkedPostIds.length
      } catch {
        /* Show unknown rather than fabricate a count. */
      }
      setStats([
        home.status === 'fulfilled'
          ? home.value.posts.filter((post) => post.author.id === user.id).length
          : '—',
        teams.status === 'fulfilled'
          ? new Set(
              [
                teams.value.primaryTeam?.id,
                ...teams.value.followedTeams.map((team) => team.id),
              ].filter(Boolean),
            ).size
          : '—',
        bookmarks,
      ])
    })
  }
  useEffect(() => {
    loaded.current = ''
    setStats(['—', '—', '—'])
  }, [user?.id, user?.organizationId])
  useEffect(() => {
    const dismiss = (event: PointerEvent) => {
      if (!account.current?.contains(event.target as Node)) setOpen(false)
      if (!mail.current?.contains(event.target as Node)) setMailOpen(false)
    }
    const route = () => {
      setOpen(false)
      setMailOpen(false)
      setReport(false)
    }
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false)
        setMailOpen(false)
      }
    }
    window.addEventListener('pointerdown', dismiss)
    window.addEventListener('keydown', escape)
    window.addEventListener('hashchange', route)
    return () => {
      clearTimeout(timer.current)
      clearTimeout(mailTimer.current)
      window.removeEventListener('pointerdown', dismiss)
      window.removeEventListener('keydown', escape)
      window.removeEventListener('hashchange', route)
    }
  }, [])
  const canReport = user?.roles.some(
    (role) =>
      (role.role === 'MATCH_REPORTER' && ['MATCH', 'TOURNAMENT'].includes(role.scopeType)) ||
      (role.role === 'TOURNAMENT_ADMIN' && role.scopeType === 'TOURNAMENT') ||
      (role.role === 'PLATFORM_ADMIN' && role.scopeType === 'PLATFORM') ||
      (role.role === 'ORGANIZATION_ADMIN' &&
        role.scopeType === 'ORGANIZATION' &&
        role.scopeId === user.organizationId),
  )
  const select = (action: () => void) => {
    close()
    setMailOpen(false)
    action()
  }
  const messages = async (category: MessageCategory) => {
    close()
    setMailOpen(false)
    await runPrivateEntry(category === 'messages' ? 'messages.read' : null, {
      getConfiguration,
      getCapabilities: productConfigRepository.getCapabilities,
      account: () => {
        const value = readAccountPresence()
        return {
          hasSession: value.hasSession,
          needsAccount: value.needsAccount,
          organizationId: value.session?.user.organizationId ?? null,
        }
      },
      navigate: () => openMessaging({ category }),
      notify: (title) => Taro.showToast({ title, icon: 'none' }),
    })
  }
  return (
    <div className="desktop-account-tools">
      <div
        ref={account}
        className={`desktop-account-hover ${open ? 'is-open' : ''}`}
        style={{ '--avatar-shift': `${placement.shift}px` } as React.CSSProperties}
        onMouseEnter={show}
        onMouseLeave={() => {
          timer.current = setTimeout(() => {
            if (!account.current?.contains(document.activeElement)) setOpen(false)
          }, 120)
        }}
        onFocusCapture={show}
        onBlurCapture={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node)) close()
        }}
      >
        <button
          data-account-control
          className="desktop-account-avatar"
          aria-label="账户菜单"
          aria-expanded={open}
          onClick={show}
        >
          <UserAvatar
            name={user?.displayName ?? '访客'}
            avatarUrl={user?.avatarUrl ?? null}
            size="small"
          />
        </button>
        {open && (
          <div
            className="desktop-account-popover"
            style={{ left: placement.left }}
            aria-label="账户选项"
          >
            <div className="desktop-account-popover__identity">
              <strong>{user?.displayName ?? '游客'}</strong>
              {user && badge && badge !== 'student' && badge !== 'profile' && (
                <div className="desktop-account-popover__badge">
                  <VerificationBadge
                    level={user.verificationLevel}
                    roles={user.roles}
                    displayedKind={badge}
                    userId={user.id}
                  />
                  <span>{identityLabels[badge]}</span>
                </div>
              )}
            </div>
            {user && (
              <div className="desktop-account-popover__stats">
                {['动态', '关注球队', '收藏'].map((label, index) => (
                  <div
                    key={label}
                    title={index === 0 ? '当前赛事最近50条公开动态中的本人动态' : label}
                  >
                    <strong>{stats[index]}</strong>
                    <span>{label}</span>
                  </div>
                ))}
              </div>
            )}
            <button
              data-account-control
              onClick={() =>
                select(user ? onProfile : () => void Taro.reLaunch({ url: '/pages/login/index' }))
              }
            >
              <ProfileIcon name="user" />
              <span>{user ? '个人中心' : '登录或注册'}</span>
              <ProfileIcon name="right" />
            </button>
            <button data-account-control onClick={() => select(onSettings)}>
              <ProfileIcon name="settings" />
              <span>设置</span>
              <ProfileIcon name="right" />
            </button>
            <button data-account-control onClick={() => select(onFeedback)}>
              <ProfileIcon name="comment" />
              <span>问题反馈</span>
              <ProfileIcon name="right" />
            </button>
            {canShowTestRoles(user) && (
              <button data-account-control onClick={() => select(() => setTestRoles(true))}>
                <ProfileIcon name="user" />
                <span>切换测试角色</span>
                <ProfileIcon name="right" />
              </button>
            )}
            {user && (
              <button
                data-account-control
                className="desktop-account-popover__logout"
                onClick={() =>
                  select(() => {
                    void endTestRoleControl()
                      .catch(() => undefined)
                      .then(onLogout)
                  })
                }
              >
                <ProfileIcon name="logout" />
                <span>退出登录</span>
              </button>
            )}
            <div className="desktop-account-popover__version">晓球 V1.0.0</div>
          </div>
        )}
      </div>
      {user && (
        <div
          className={`desktop-mail-hover ${mailOpen ? 'is-open' : ''}`}
          ref={mail}
          onMouseEnter={openMail}
          onMouseLeave={() => {
            mailTimer.current = setTimeout(() => setMailOpen(false), 120)
          }}
          onFocusCapture={openMail}
          onBlurCapture={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node)) setMailOpen(false)
          }}
        >
          <button
            data-account-control
            className="desktop-account-icon"
            aria-label="我的消息"
            aria-expanded={mailOpen}
            onClick={() => select(onMessages)}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              aria-hidden="true"
            >
              <rect x="3" y="5" width="18" height="14" rx="2" />
              <path d="m3 6 9 7 9-7" />
            </svg>
          </button>
          {mailOpen && (
            <div
              className="desktop-mail-menu"
              aria-label="消息快捷分类"
              style={
                {
                  left: mailPlacement.left,
                  '--caret-x': `${mailPlacement.caret}px`,
                } as React.CSSProperties
              }
            >
              {visibleMessageCategories(preferences).map((item) => (
                <button key={item.id} data-account-control onClick={() => void messages(item.id)}>
                  {item.label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      {canReport && (
        <button
          data-account-control
          className="desktop-account-icon"
          aria-label="信息录入"
          title="信息录入"
          onClick={() => {
            close()
            setReport(true)
          }}
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            aria-hidden="true"
          >
            <path d="m16 3 5 5-12 12H4v-5Z" />
            <path d="m14 5 5 5M3 22h18" />
          </svg>
        </button>
      )}
      {report && user && <InformationEntryDialog onClose={() => setReport(false)} />}
      {testRoles && <TestRoleDialog onClose={() => setTestRoles(false)} />}
    </div>
  )
}
