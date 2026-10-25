import { Button, Image, Input, Text, Textarea, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useEffect, useRef, useState } from 'react'
import { NativeDialog } from '../../components/native-ui/index.weapp'
import { UserAvatar } from '../../components/product-ui'
import { VerificationBadge } from '../../components/verification-badge'
import { AvatarCropper } from '../../components/avatar-cropper'
import { ReportModal } from '../../components/report-modal/index.weapp'
import { NativeSettings } from '../../components/native-ui/settings.weapp'
import { NativeMyIdentities } from './identities.weapp'
import { openMessaging } from '../../components/messaging-drawer'
import { productRepository, request } from '../../features/product/product.repository'
import { readSession, saveSession } from '../../features/product/session'
import { openNativeDetail } from '../../features/native-navigation/index.weapp'
import { managedTeamIds } from './profile.logic'
import { personalBackgroundUrl } from '../../features/managed-media/backgrounds.weapp'
import { nativeIdentityKinds } from './identity-panels.logic.weapp'
import { openPlayer } from '../../features/product/player-navigation'
import { roleLabel } from '../../features/product/product.format'
import { NativeEmailDialog } from './email-dialog.weapp'
import { NativeIdentityDialog } from './identity-dialog.weapp'
import { NativeBadgeDialog } from './badge-dialog.weapp'
import type { DesktopProfileProps, ProfileService } from './desktop-profile'
import type { AuthUser, BadgePreferenceResponse } from '../../features/product/product.types'
import './profile.weapp.scss'
import settingsIcon from '../../assets/profile-icons/settings.svg'
import userIcon from '../../assets/profile-icons/user-circle.svg'
import shieldIcon from '../../assets/profile-icons/shield-check.svg'
import usersIcon from '../../assets/profile-icons/users.svg'
import exchangeIcon from '../../assets/profile-icons/arrows-exchange.svg'
import logoutIcon from '../../assets/profile-icons/logout.svg'
import messageIcon from '../../assets/post-icons/message-circle.svg'
import bookmarkIcon from '../../assets/profile-icons/bookmark.svg'
const nativeProfileIcons: Record<string, string> = {
  settings: settingsIcon,
  'user-circle': userIcon,
  'shield-check': shieldIcon,
  users: usersIcon,
  exchange: exchangeIcon,
  logout: logoutIcon,
  'message-circle': messageIcon,
  flag: messageIcon,
  bookmark: bookmarkIcon,
}
function NativeProfileIcon({ icon }: { icon: string }) {
  return nativeProfileIcons[icon] ? (
    <Image className="native-profile-icon" mode="aspectFit" src={nativeProfileIcons[icon]!} />
  ) : (
    <View className={`native-menu-row__icon native-menu-row__icon--${icon}`} />
  )
}

const titles: Record<ProfileService, string> = {
  notifications: '我的通知',
  reports: '反馈记录',
  adminReports: '反馈处理',
  identities: '实名账号目录',
}
type Dialog =
  | ProfileService
  | 'edit'
  | 'identity'
  | 'manageIdentity'
  | 'certification'
  | 'settings'
  | 'email'
  | 'badge'
  | 'logout'
  | null
export function useDesktopProfile() {
  return true
}
export function DesktopProfile({ home, user, onUserChange, renderService }: DesktopProfileProps) {
  const [dialog, setDialog] = useState<Dialog>(null)
  const [avatar, setAvatar] = useState(false)
  const [emailOpen, setEmailOpen] = useState(false)
  const [feedback, setFeedback] = useState(false)
  const [logoutBusy, setLogoutBusy] = useState(false)
  const [badge, setBadge] = useState<BadgePreferenceResponse | null>(null)
  const [cover, setCover] = useState<string | null>(null)
  const [coverFailed, setCoverFailed] = useState(false)
  useEffect(() => setCoverFailed(false), [user.coverUrl, cover])
  useEffect(() => {
    let current = true
    setCover(null)
    setCoverFailed(false)
    void request<{ backgroundUrl: string | null }>(
      `/media-assets/users/${encodeURIComponent(user.id)}/presentation`,
    )
      .then((value) => {
        if (current) setCover(value.backgroundUrl)
      })
      .catch(() => {})
    return () => {
      current = false
    }
  }, [user.id])
  const [teamChoices, setTeamChoices] = useState<Array<{ id: string; name: string }>>([])
  const openingTeam = useRef(false)
  const openTeamArea = async () => {
    if (openingTeam.current) return
    openingTeam.current = true
    try {
      const ids = managedTeamIds(
        user,
        home.teams.map((team) => team.id),
      )
      let teamId = ''
      if (ids.length) {
        const teams = await Promise.all(
          ids.map(async (id) => {
            const known = home.teams.find((team) => team.id === id)
            return known || (await productRepository.getCaptainWorkspace(id)).team
          }),
        )
        if (teams.length > 1) {
          setTeamChoices(teams.map(({ id, name }) => ({ id, name })))
          return
        }
        teamId = teams[0]!.id
      } else if (user.linkedPlayer)
        teamId =
          (await productRepository.getPlayer(user.linkedPlayer.id, home.tournament.id)).team?.id ||
          ''
      if (teamId)
        await openNativeDetail(
          `/pages/${ids.length ? 'team-manage' : 'readonly-team-detail'}/index?teamId=${encodeURIComponent(teamId)}&tournamentId=${encodeURIComponent(home.tournament.id)}`,
        )
      else
        await Taro.navigateTo({
          url: `/pages/readonly-teams/index?tournamentId=${encodeURIComponent(home.tournament.id)}`,
        })
    } catch (issue) {
      if (
        !(
          issue &&
          typeof issue === 'object' &&
          'errMsg' in issue &&
          String(issue.errMsg).includes('cancel')
        )
      )
        void Taro.showToast({
          title: issue instanceof Error ? issue.message : '球队读取失败',
          icon: 'none',
        })
    } finally {
      openingTeam.current = false
    }
  }
  useEffect(() => {
    let active = true
    void productRepository
      .getBadgePreference()
      .then((value) => {
        if (active) setBadge(value)
      })
      .catch(() => {})
    return () => {
      active = false
    }
  }, [user.id])
  const admin = user.roles.some(
    (role) =>
      role.role === 'PLATFORM_ADMIN' ||
      (role.role === 'ORGANIZATION_ADMIN' &&
        role.scopeType === 'ORGANIZATION' &&
        role.scopeId === user.organizationId),
  )
  const leave = async () => {
    if (logoutBusy) return
    setLogoutBusy(true)
    try {
      await productRepository.logout()
      await Taro.reLaunch({ url: '/pages/login/index' })
    } catch (error) {
      void Taro.showToast({
        title: error instanceof Error ? error.message : '退出失败',
        icon: 'none',
      })
    } finally {
      setLogoutBusy(false)
    }
  }
  return (
    <View className="native-profile">
      <View className="native-profile-card">
        <Image
          className="native-profile-card__background"
          src={personalBackgroundUrl(coverFailed ? null : user.coverUrl || cover)}
          mode="aspectFill"
          onError={() => setCoverFailed(true)}
        />
        <View className="native-profile-card__shade" />
        <Button
          className="native-profile-avatar"
          aria-label="更换头像"
          onClick={() => setAvatar(true)}
        >
          <UserAvatar avatarUrl={user.avatarUrl} name={user.displayName} size="large" />
        </Button>
        <View className="native-profile-card__copy">
          <View className="native-profile-card__name">
            <Text>{user.displayName}</Text>
            <VerificationBadge
              level={user.verificationLevel}
              roles={user.roles}
              displayedKind={badge?.displayedKind}
            />
          </View>
          <Text className="native-note">@{user.username}</Text>
          {user.bio && <Text className="native-profile-card__bio">{user.bio}</Text>}
        </View>
      </View>
      <View className="native-profile-function-grid" aria-label="我的功能">
        <Shortcut icon="user-circle" title="个人信息" onClick={() => setDialog('edit')} />
        <Shortcut
          icon="shield-check"
          title="我的身份"
          onClick={() => {
            const kinds = nativeIdentityKinds(user, badge?.availableKinds)
            if (kinds.length === 1 && kinds[0] === 'player' && user.linkedPlayer)
              void openPlayer(user.linkedPlayer.id, home.tournament.id)
            else setDialog('identity')
          }}
        />
        <Shortcut
          icon="users"
          title={
            managedTeamIds(
              user,
              home.teams.map((team) => team.id),
            ).length
              ? '管理球队'
              : user.linkedPlayer
                ? '我的球队'
                : '加入球队'
          }
          onClick={() => void openTeamArea()}
        />
        <Shortcut icon="message-circle" title="我的消息" onClick={() => openMessaging()} />
        <Shortcut
          icon="bookmark"
          title="我的收藏"
          onClick={() => void openNativeDetail('/pages/favorites/index')}
        />
        <Shortcut icon="exchange" title="身份管理" onClick={() => setDialog('manageIdentity')} />
        <Shortcut icon="settings" title="设置" onClick={() => setDialog('settings')} />
        <Shortcut icon="flag" title="问题反馈" onClick={() => setFeedback(true)} />
        <Shortcut icon="logout" title="退出登录" onClick={() => setDialog('logout')} />
      </View>
      {teamChoices.length > 0 && (
        <NativeDialog title="选择要管理的球队" onClose={() => setTeamChoices([])}>
          {teamChoices.map((team) => (
            <Button
              key={team.id}
              className="native-menu-row"
              onClick={() => {
                setTeamChoices([])
                void openNativeDetail(
                  `/pages/team-manage/index?teamId=${encodeURIComponent(team.id)}&tournamentId=${encodeURIComponent(home.tournament.id)}`,
                )
              }}
            >
              <Text>{team.name}</Text>
              <Text className="native-menu-row__value">管理 ›</Text>
            </Button>
          ))}
        </NativeDialog>
      )}
      {dialog === 'edit' && (
        <EditProfile
          user={user}
          onClose={() => setDialog(null)}
          onChanged={onUserChange}
          onEmail={() => setEmailOpen(true)}
        />
      )}
      {dialog === 'edit' && emailOpen && (
        <NativeEmailDialog
          user={user}
          onClose={() => setEmailOpen(false)}
          onChanged={onUserChange}
        />
      )}
      {dialog === 'identity' && (
        <NativeMyIdentities
          user={user}
          tournamentId={home.tournament.id}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog === 'manageIdentity' && (
        <NativeDialog title="身份管理" onClose={() => setDialog(null)}>
          <MenuRow
            icon="shield-check"
            title="认证与关联"
            onClick={() => setDialog('certification')}
          />
          <MenuRow icon="check" title="展示身份" onClick={() => setDialog('badge')} />
          {admin && (
            <MenuRow icon="flag" title="反馈处理" onClick={() => setDialog('adminReports')} />
          )}
          {admin && (
            <MenuRow icon="users" title="实名账号目录" onClick={() => setDialog('identities')} />
          )}
        </NativeDialog>
      )}
      {dialog === 'certification' && (
        <NativeIdentityDialog
          user={user}
          onClose={() => setDialog(null)}
          onChanged={onUserChange}
        />
      )}
      {dialog === 'badge' && (
        <NativeBadgeDialog onClose={() => setDialog(null)} onSaved={setBadge} />
      )}
      {dialog && dialog in titles && (
        <NativeDialog title={titles[dialog as ProfileService]} onClose={() => setDialog(null)}>
          {renderService(dialog as ProfileService, setDialog)}
        </NativeDialog>
      )}
      {dialog === 'settings' && <NativeSettings onClose={() => setDialog(null)} />}
      {dialog === 'logout' && (
        <NativeDialog
          title="退出登录"
          compact
          busy={logoutBusy}
          onClose={() => setDialog(null)}
          footer={
            <>
              <Button className="native-button" onClick={() => setDialog(null)}>
                取消
              </Button>
              <Button
                className="native-button native-button--danger"
                loading={logoutBusy}
                onClick={() => void leave()}
              >
                退出
              </Button>
            </>
          }
        >
          <Text className="native-note">确定退出当前账号？</Text>
        </NativeDialog>
      )}
      {feedback && (
        <ReportModal
          title="问题反馈"
          targetType="FEEDBACK"
          onClose={() => setFeedback(false)}
          onHistory={() => {
            setFeedback(false)
            setDialog('reports')
          }}
        />
      )}
      {avatar && (
        <AvatarCropper
          onCancel={() => setAvatar(false)}
          onConfirm={async (image) => {
            const updated = await productRepository.uploadAvatar(image)
            onUserChange(updated.user)
            setAvatar(false)
          }}
        />
      )}
    </View>
  )
}
function Shortcut({ icon, title, onClick }: { icon: string; title: string; onClick: () => void }) {
  return (
    <Button className="native-profile-shortcut" onClick={onClick}>
      <NativeProfileIcon icon={icon} />
      <Text>{title}</Text>
      <Text className="native-profile-shortcut__arrow">›</Text>
    </Button>
  )
}
function MenuRow({
  icon,
  title,
  value,
  onClick,
}: {
  icon: string
  title: string
  value?: string
  onClick: () => void
}) {
  return (
    <Button className="native-menu-row" onClick={onClick}>
      <NativeProfileIcon icon={icon} />
      <Text>{title}</Text>
      <Text className="native-menu-row__value">{value ?? ''}</Text>
      <Text className="native-menu-row__arrow">›</Text>
    </Button>
  )
}
export function EditProfile({
  user,
  onClose,
  onChanged,
  onEmail,
}: {
  user: AuthUser
  onClose: () => void
  onChanged: (user: AuthUser) => void
  onEmail?: () => void
}) {
  const [name, setName] = useState(user.displayName),
    [bio, setBio] = useState(user.bio ?? '')
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('')
  const save = async () => {
    if (busy || name.trim().length < 2) return
    setBusy(true)
    setError('')
    const before = readSession()
    try {
      const updated = await request<AuthUser>('/auth/me', {
        method: 'PATCH',
        data: { displayName: name.trim(), bio: bio.trim() },
      })
      const current = readSession()
      if (!before || current?.accessToken !== before.accessToken || current.user.id !== updated.id)
        throw new Error('账号已切换，请重新打开个人资料')
      saveSession({ ...current, user: updated })
      onChanged(updated)
      onClose()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '保存失败')
    } finally {
      setBusy(false)
    }
  }
  return (
    <NativeDialog
      title="个人资料"
      onClose={onClose}
      busy={busy}
      unsavedChanges={name !== user.displayName || bio !== (user.bio ?? '')}
      footer={
        <Button
          className="native-button native-button--primary"
          loading={busy}
          disabled={busy || name.trim().length < 2}
          onClick={() => void save()}
        >
          保存
        </Button>
      }
    >
      <Text className="native-label">昵称</Text>
      <Input
        className="native-field"
        value={name}
        maxlength={40}
        onInput={(event) => setName(event.detail.value)}
      />
      <Text className="native-label">个人简介</Text>
      <Textarea
        className="native-field"
        value={bio}
        maxlength={280}
        onInput={(event) => setBio(event.detail.value)}
      />
      <View className="native-private-info">
        <Text>用户名</Text>
        <Text>{user.username}</Text>
        <Text>姓名</Text>
        <Text>{user.realName ?? '未登记'}</Text>
        <Text>学号</Text>
        <Text>{user.studentId ?? '未登记'}</Text>
        <Text>身份</Text>
        <Text>{user.roles.map((role) => roleLabel(role.role)).join('、') || '普通学生'}</Text>
      </View>
      {onEmail && (
        <MenuRow
          icon="mail"
          title="绑定邮箱"
          value={user.email ? (user.emailVerifiedAt ? '已验证' : '待验证') : '未绑定'}
          onClick={onEmail}
        />
      )}
      {error && <Text className="native-error">{error}</Text>}
    </NativeDialog>
  )
}
