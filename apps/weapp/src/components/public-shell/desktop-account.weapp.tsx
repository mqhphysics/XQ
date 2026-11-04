import { Button, Image, ScrollView, Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useEffect, useRef, useState } from 'react'
import { UserAvatar } from '../product-ui'
import { VerificationBadge } from '../verification-badge'
import { EditProfile } from '../../pages/me/desktop-profile.weapp'
import { productRepository } from '../../features/product/product.repository'
import { readSession } from '../../features/product/session'
import { refreshNativeCurrentUser } from '../../features/product/current-user.weapp'
import {
  personalBackgroundUrl,
  playerBackgroundUrl,
} from '../../features/managed-media/backgrounds.weapp'
import { openPlayer } from '../../features/product/player-navigation'
import { roleLabel, positionLabel } from '../../features/product/product.format'
import type {
  AuthUser,
  PlayerDetailResponse,
  TeamPreferencesResponse,
} from '../../features/product/product.types'
import type { DesktopAccountProps } from './desktop-account'
import './native-account.weapp.scss'
import { useNativeBackLayer } from '../../features/native-navigation/leave-guard.weapp'
import {
  NativeSwipeDrawer,
  type NativeSwipeDrawerHandle,
} from '../native-navigation/swipe-drawer.weapp'

export function useDesktopAccount() {
  return true
}
function AccountBackdrop({ src, fallback }: { src: string; fallback: string }) {
  const [failed, setFailed] = useState(false)
  useEffect(() => setFailed(false), [src])
  return (
    <View className="native-account-backdrop" aria-hidden>
      <Image src={failed ? fallback : src} mode="aspectFit" onError={() => setFailed(true)} />
      <View />
    </View>
  )
}
export function DesktopAccount({
  user,
  onProfile,
  onMessages,
  onFeedback,
  onLogout,
}: DesktopAccountProps) {
  const [open, setOpen] = useState(false)
  const drawer = useRef<NativeSwipeDrawerHandle>(null),
    afterClose = useRef<(() => void) | null>(null)
  const close = () => drawer.current?.close()
  useNativeBackLayer(async () => {
    close()
    return true
  }, open)
  const [edit, setEdit] = useState(false)
  const [current, setCurrent] = useState<AuthUser | null>(user)
  const [player, setPlayer] = useState<PlayerDetailResponse | null>(null)
  const [teams, setTeams] = useState<TeamPreferencesResponse | null>(null)
  const [failure, setFailure] = useState('')
  useEffect(() => {
    setCurrent(user)
  }, [user])
  useEffect(() => {
    if (!open) return
    let active = true
    void refreshNativeCurrentUser()
      .then(() => {
        if (active) setCurrent(readSession()?.user ?? null)
      })
      .catch(() => {})
    return () => {
      active = false
    }
  }, [open])
  useEffect(() => {
    if (!open || !current) return
    let active = true
    const identity = current.id
    setFailure('')
    void Promise.all([
      productRepository.getTeamPreferences(),
      current.linkedPlayer
        ? productRepository.getPlayer(current.linkedPlayer.id)
        : Promise.resolve(null),
    ])
      .then(([preferences, profile]) => {
        if (active && readSession()?.user.id === identity) {
          setTeams(preferences)
          setPlayer(profile)
        }
      })
      .catch((reason) => {
        if (active) setFailure(reason instanceof Error ? reason.message : '角色信息读取失败')
      })
    return () => {
      active = false
    }
  }, [open, current?.id, current?.linkedPlayer?.id])
  useEffect(() => {
    if (!open) return
    Taro.eventCenter.trigger('xiaoqiu:native-overlay', true)
    return () => {
      Taro.eventCenter.trigger('xiaoqiu:native-overlay', false)
    }
  }, [open])
  const select = (action: () => void) => {
    afterClose.current = action
    close()
  }
  const status = Taro.getWindowInfo().statusBarHeight ?? 20
  const menu = Taro.getMenuButtonBoundingClientRect()
  const mailShift = Math.max(
    16,
    Taro.getWindowInfo().windowWidth * 0.77 - (menu.left || Taro.getWindowInfo().windowWidth) + 12,
  )
  const roles = [...new Set(current?.roles.map((role) => role.role) ?? [])]
  return (
    <>
      <Button
        className="public-account"
        aria-label="打开个人侧栏"
        onClick={() => {
          setCurrent(readSession()?.user ?? null)
          setOpen(true)
        }}
      >
        <View className="public-account__avatar">
          <UserAvatar
            avatarUrl={current?.avatarUrl ?? null}
            name={current?.displayName ?? '访客'}
            size="small"
          />
        </View>
      </Button>
      {open && (
        <NativeSwipeDrawer
          ref={drawer}
          top={status}
          onInterrupt={() => {
            afterClose.current = null
          }}
          onClose={() => {
            setOpen(false)
            const action = afterClose.current
            afterClose.current = null
            if (action) Taro.nextTick(action)
          }}
        >
          <View className="native-account-tools">
            <Button
              className="native-account-tools__close"
              aria-label="关闭个人侧栏"
              onClick={close}
            >
              ×
            </Button>
            <Text>个人中心</Text>
            {current && (
              <Button
                className="native-account-tools__mail"
                style={`transform:translateX(-${mailShift}px);`}
                aria-label="打开信箱"
                onClick={() => select(onMessages)}
              >
                <View />
              </Button>
            )}
          </View>
          {current ? (
            <>
              <ScrollView scrollY className="native-account-half" showScrollbar={false}>
                <View className="native-account-personal">
                  <AccountBackdrop
                    src={personalBackgroundUrl(current.coverUrl)}
                    fallback={personalBackgroundUrl(null)}
                  />
                  <View className="native-account-personal-content">
                    <View
                      className="native-account-identity"
                      role="button"
                      aria-label="进入我的"
                      onClick={() => select(onProfile)}
                    >
                      <UserAvatar
                        name={current.displayName}
                        avatarUrl={current.avatarUrl}
                        size="large"
                      />
                      <View>
                        <View>
                          <Text>{current.displayName}</Text>
                          <VerificationBadge
                            level={current.verificationLevel}
                            roles={current.roles}
                          />
                        </View>
                        <Text>@{current.username}</Text>
                      </View>
                    </View>
                  </View>
                </View>
                <View className="native-account-section-title">
                  <Text>基本信息</Text>
                  <Button
                    className="native-button native-button--quiet"
                    onClick={() => {
                      select(() => setEdit(true))
                    }}
                  >
                    编辑
                  </Button>
                </View>
                <View className="native-account-info">
                  <Text>姓名</Text>
                  <Text>{current.realName || '未填写'}</Text>
                  <Text>学号</Text>
                  <Text>{current.studentId || '未填写'}</Text>
                  <Text>邮箱</Text>
                  <Text>{current.email || '未绑定'}</Text>
                  <Text>简介</Text>
                  <Text>{current.bio || '未填写'}</Text>
                </View>
              </ScrollView>
              <ScrollView
                scrollY
                className="native-account-half native-account-half--roles"
                showScrollbar={false}
              >
                <Text className="native-account-role-heading">我的身份</Text>
                {player && (
                  <Button
                    className="native-account-role-card native-account-role-card--player"
                    onClick={() =>
                      select(() => {
                        void openPlayer(player.id)
                      })
                    }
                  >
                    <View className="native-account-role-cover">
                      <AccountBackdrop
                        src={playerBackgroundUrl(player.coverUrl)}
                        fallback={playerBackgroundUrl(null)}
                      />
                      <View className="native-account-role-cover__copy">
                        <Text>球员 · {player.team?.name ?? '暂无所属球队'}</Text>
                        <Text>
                          {positionLabel(player.position)}
                          {player.shirtNumber ? ` · ${player.shirtNumber}号` : ''}
                        </Text>
                      </View>
                    </View>
                    <View className="native-account-player-stats">
                      {(
                        [
                          ['出场', player.stats.appearances],
                          ['进球', player.stats.goals],
                          ['助攻', player.stats.assists],
                        ] as const
                      ).map(([label, value]) => (
                        <View key={label}>
                          <Text>{value}</Text>
                          <Text>{label}</Text>
                        </View>
                      ))}
                    </View>
                  </Button>
                )}
                {roles
                  .filter((role) => role !== 'PLAYER' && role !== 'STUDENT')
                  .map((role) => (
                    <View className="native-account-role-card" key={role}>
                      <Text>{roleLabel(role)}</Text>
                      <Text>
                        {role === 'TEAM_CAPTAIN' || role === 'TEAM_COACH'
                          ? '球队人员与报名管理'
                          : role === 'MATCH_REPORTER'
                            ? '授权比赛的信息录入与战报'
                            : role === 'PLATFORM_ADMIN' ||
                                role === 'ORGANIZATION_ADMIN' ||
                                role === 'TOURNAMENT_ADMIN'
                              ? '授权范围内的赛事与内容管理'
                              : '校园足球账号'}
                      </Text>
                    </View>
                  ))}
                {!player && roles.every((role) => ['STUDENT', 'PLAYER'].includes(role)) && (
                  <View className="native-account-role-card">
                    <Text>{roles.includes('PLAYER') ? '球员' : '学生'}</Text>
                    <Text>{current.linkedPlayer?.displayName || '校园足球账号'}</Text>
                  </View>
                )}
                {teams && (
                  <View className="native-account-team">
                    <Text>我的主队</Text>
                    <Text>
                      {teams.primaryTeam?.name ?? '尚未选择'} · 关注 {teams.followedTeams.length}{' '}
                      支球队
                    </Text>
                  </View>
                )}
                {failure && <Text className="native-error">{failure}</Text>}
              </ScrollView>
            </>
          ) : (
            <View className="native-account-guest">
              <Text>登录晓球，关注球队与比赛</Text>
              <Button
                className="native-button native-button--primary"
                onClick={() =>
                  select(() => {
                    void Taro.reLaunch({ url: '/pages/login/index' })
                  })
                }
              >
                登录或注册
              </Button>
            </View>
          )}
          <View className="native-account-bottom">
            {current && (
              <Button className="native-button" onClick={() => select(onLogout)}>
                退出登录
              </Button>
            )}
            <Button
              className="native-button native-button--quiet"
              onClick={() => select(onFeedback)}
            >
              问题反馈
            </Button>
          </View>
        </NativeSwipeDrawer>
      )}
      {edit && current && (
        <EditProfile
          user={current}
          onClose={() => setEdit(false)}
          onChanged={(updated) => {
            setCurrent(updated)
            setEdit(false)
          }}
        />
      )}
    </>
  )
}
