import { Button, Input, Text, Textarea, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useNativeRefreshTask } from '../../features/product/native-refresh'

import { PublicShell } from '../../components/public-shell'
import { IdentityEntry } from '../../components/identity-center'
import { EmailVerificationPanel } from '../../components/email-code'
import { AvatarCropper } from '../../components/avatar-cropper'
import { openMessaging } from '../../components/messaging-drawer'
import { ReportModal } from '../../components/report-modal'
import { DataState } from '../../components/public-ui'
import { ProductSection, UserAvatar } from '../../components/product-ui'
import { PersonTrigger } from '../../components/person-trigger'
import { positionLabel, roleLabel, verificationLabel } from '../../features/product/product.format'
import { peekProduct, productRepository } from '../../features/product/product.repository'
import { readSession } from '../../features/product/session'
import { openPlayer } from '../../features/product/player-navigation'
import type {
  AdminIdentity,
  AuthUser,
  HomeResponse,
  NotificationResponse,
  ReportItem,
} from '../../features/product/product.types'

import './index.scss'
import { DesktopProfile, useDesktopProfile } from './desktop-profile'
import { MediaAccountEntry } from '../../features/managed-media'
import { ProfileSkeleton } from './profile-skeleton'

type PageState =
  | { phase: 'loading' }
  | { phase: 'ready'; home: HomeResponse; user: AuthUser }
  | { phase: 'failed'; message: string }

export default function MePage() {
  const desktop = useDesktopProfile()
  // H5: render at once from the cached home snapshot + stored session user, then refresh
  // both in the background (no blank "loading" screen when switching to 我的).
  const [state, setState] = useState<PageState>(() => {
    const home = peekProduct<HomeResponse>('/public/home')
    const user = readSession()?.user
    return home && user ? { phase: 'ready', home, user } : { phase: 'loading' }
  })
  const shown = useRef(state.phase === 'ready')

  const load = useCallback(async (refresh = false) => {
    if (!shown.current) setState({ phase: 'loading' })
    try {
      if (!readSession()) {
        await Taro.reLaunch({ url: '/pages/login/index' })
        return
      }
      const [home, user] = await Promise.all([
        productRepository.getHome(),
        productRepository.getMe(),
      ])
      shown.current = true
      setState({ phase: 'ready', home, user })
    } catch (error) {
      if (!readSession()) {
        await Taro.reLaunch({ url: '/pages/login/index' })
        return
      }
      // Keep the instantly rendered page on a background refresh failure.
      if (shown.current) {
        if (refresh) throw error
        return
      }
      setState({
        phase: 'failed',
        message: error instanceof Error ? error.message : '账户页面加载失败。',
      })
    }
  }, [])
  useNativeRefreshTask(() => load(true))
  useEffect(() => {
    void load()
  }, [load])

  const tournamentId = state.phase === 'ready' ? state.home.tournament.id : undefined
  return (
    <PublicShell active="me" tournamentId={tournamentId}>
      {state.phase === 'ready' && !desktop && (
        <IdentityEntry
          user={state.user}
          onUserChange={(user) =>
            setState((current) => (current.phase === 'ready' ? { ...current, user } : current))
          }
        />
      )}
      {state.phase === 'loading' &&
        (desktop ? <ProfileSkeleton /> : <DataState kind="loading" title="正在读取账户" />)}
      {state.phase === 'failed' && (
        <DataState
          kind="error"
          title="账户页面不可用"
          description={state.message}
          onRetry={() => void load()}
        />
      )}
      {state.phase === 'ready' && desktop && (
        <DesktopProfile
          key={`${state.user.organizationId}:${state.user.id}`}
          home={state.home}
          user={state.user}
          onUserChange={(user) =>
            setState((current) => (current.phase === 'ready' ? { ...current, user } : current))
          }
          renderService={(service, onServiceLink) => {
            if (service === 'notifications')
              return (
                <NotificationsPanel
                  onReportLink={(admin) => onServiceLink(admin ? 'adminReports' : 'reports')}
                  onNavigate={() => onServiceLink(null)}
                />
              )
            if (service === 'reports') return <MyReportsPanel />
            if (service === 'adminReports') return <AdminReportPanel />
            return <AdminIdentityDirectory />
          }}
        />
      )}
      {state.phase === 'ready' && !desktop && (
        <ProfilePanel
          tournamentId={state.home.tournament.id}
          user={state.user}
          onUserChange={(user) =>
            setState((current) => (current.phase === 'ready' ? { ...current, user } : current))
          }
        />
      )}
    </PublicShell>
  )
}

function ProfilePanel({
  tournamentId,
  user,
  onUserChange,
}: {
  tournamentId: string
  user: AuthUser
  onUserChange: (user: AuthUser) => void
}) {
  const [loggingOut, setLoggingOut] = useState(false)
  const [editing, setEditing] = useState(false)
  const [avatarOpen, setAvatarOpen] = useState(false)
  const [feedbackOpen, setFeedbackOpen] = useState(false)
  const [savingProfile, setSavingProfile] = useState(false)
  const [displayName, setDisplayName] = useState(user.displayName)
  const [email, setEmail] = useState(user.email ?? '')
  const [bio, setBio] = useState(user.bio ?? '')
  const roleNames = user.roles.map((item) => roleLabel(item.role))
  const isOrganizationAdmin = user.roles.some(
    (item) =>
      item.role === 'PLATFORM_ADMIN' ||
      (item.role === 'ORGANIZATION_ADMIN' &&
        item.scopeType === 'ORGANIZATION' &&
        item.scopeId === user.organizationId),
  )

  const saveProfile = async () => {
    if (savingProfile) return
    setSavingProfile(true)
    try {
      const updated = await productRepository.updateProfile(
        displayName.trim(),
        email.trim(),
        bio.trim(),
      )
      onUserChange(updated)
      setEditing(false)
      await Taro.showToast({ title: '资料已保存', icon: 'success' })
    } catch (error) {
      await Taro.showToast({
        title: error instanceof Error ? error.message : '保存失败',
        icon: 'none',
      })
    } finally {
      setSavingProfile(false)
    }
  }

  const logout = async () => {
    if (loggingOut) return
    const confirmation = await Taro.showModal({
      title: '退出登录',
      content:
        Taro.getEnv() === Taro.ENV_TYPE.WEB
          ? '退出后需重新登录账号才能访问球队与赛事。'
          : '退出后仍可使用游客模式浏览公开赛事数据。',
      confirmText: '退出',
    })
    if (!confirmation.confirm) return
    setLoggingOut(true)
    try {
      await productRepository.logout()
    } catch {
      // 本地会话已由 repository 的 finally 清除，仍需离开受保护页面。
    } finally {
      await Taro.reLaunch({ url: '/pages/login/index' })
    }
  }

  return (
    <View>
      <View className="profile-header">
        <View className="profile-header__main">
          <Button
            aria-label="更换头像"
            className="profile-avatar-action"
            onClick={() => setAvatarOpen(true)}
          >
            <UserAvatar avatarUrl={user.avatarUrl} name={user.displayName} size="large" />
            <Text className="profile-avatar-action__label">更换头像</Text>
          </Button>
          <View className="profile-header__copy">
            <Text className="profile-header__eyebrow">ACCOUNT PROFILE</Text>
            <View className="profile-header__name-row">
              <Text className="profile-header__name">{user.displayName}</Text>
              <Text className="profile-header__verified">
                {verificationLabel(user.verificationLevel)}
              </Text>
            </View>
            <Text className="profile-header__username">@{user.username}</Text>
            <Text className="profile-header__bio">{user.bio ?? '这位用户暂时没有填写简介。'}</Text>
            <View className="profile-header__roles">
              {(roleNames.length > 0 ? roleNames : ['普通用户']).map((role) => (
                <Text key={role}>{role}</Text>
              ))}
            </View>
          </View>
        </View>
        <View className="profile-header__actions">
          <MediaAccountEntry />
          <Button className="profile-header__edit" onClick={() => setEditing((value) => !value)}>
            {editing ? '收起编辑' : '编辑资料'}
          </Button>
          <Button
            className="profile-header__logout"
            disabled={loggingOut}
            loading={loggingOut}
            onClick={() => void logout()}
          >
            退出登录
          </Button>
        </View>
      </View>

      {editing && (
        <View className="profile-editor surface">
          <View>
            <Text>昵称</Text>
            <Input
              maxlength={120}
              value={displayName}
              onInput={(event) => setDisplayName(event.detail.value)}
            />
          </View>
          <View>
            <Text>绑定邮箱</Text>
            <Input
              type="text"
              maxlength={254}
              value={email}
              onInput={(event) => setEmail(event.detail.value)}
            />
          </View>
          <View className="profile-editor__bio">
            <Text>个人简介</Text>
            <Textarea maxlength={280} value={bio} onInput={(event) => setBio(event.detail.value)} />
          </View>
          <Button
            className="button button--primary"
            disabled={displayName.trim().length < 2 || !email.includes('@') || savingProfile}
            loading={savingProfile}
            onClick={() => void saveProfile()}
          >
            保存资料
          </Button>
        </View>
      )}

      <View className="identity-summary__heading">
        <Text>仅本人可见的账户信息</Text>
        <Text>实名资料不会出现在公开球队与社区页面</Text>
      </View>
      <EmailVerificationPanel user={user} onVerified={onUserChange} />
      <View className="identity-summary">
        <View>
          <Text className="identity-summary__label">真实姓名</Text>
          <Text className="identity-summary__value">{user.realName ?? '未登记'}</Text>
        </View>
        <View>
          <Text className="identity-summary__label">学号</Text>
          <Text className="identity-summary__value identity-summary__value--mono">
            {user.studentId ?? '未登记'}
          </Text>
        </View>
        <View>
          <Text className="identity-summary__label">绑定邮箱</Text>
          <Text className="identity-summary__value">{user.email ?? '未绑定'}</Text>
        </View>
      </View>

      {user.linkedPlayer && (
        <View
          className="linked-player"
          onClick={() => void openPlayer(user.linkedPlayer!.id, tournamentId)}
        >
          <View>
            <Text className="linked-player__eyebrow">已认领球员</Text>
            <Text className="linked-player__name">{user.linkedPlayer.displayName}</Text>
            <Text className="linked-player__position">
              {positionLabel(user.linkedPlayer.position)}
            </Text>
          </View>
          <Text className="linked-player__open">查看完整档案</Text>
        </View>
      )}

      <View className="profile-section">
        <ProductSection kicker="ACCOUNT" title="个人服务" />
        <View className="service-grid">
          <ServiceItem
            title="我的主队"
            note="战绩、赛程与阵容"
            action={() =>
              void Taro.reLaunch({
                url: '/pages/my-team/index?tournamentId=' + encodeURIComponent(tournamentId),
              })
            }
          />
          <ServiceItem
            title="消息与私信"
            note="点赞、回复与校内私聊"
            action={() => openMessaging()}
          />
          <ServiceItem
            title="问题反馈"
            note="提交后可查看处理回复"
            action={() => setFeedbackOpen(true)}
          />
          {user.linkedPlayer && (
            <ServiceItem
              title="球员档案"
              note="数据与出场记录"
              action={() => void openPlayer(user.linkedPlayer!.id, tournamentId)}
            />
          )}
        </View>
      </View>

      <NotificationsPanel />
      <MyReportsPanel />

      {isOrganizationAdmin && <AdminReportPanel />}
      {isOrganizationAdmin && <AdminIdentityDirectory />}
      {avatarOpen && (
        <AvatarCropper
          onCancel={() => setAvatarOpen(false)}
          onConfirm={async (dataUrl) => {
            const result = await productRepository.uploadAvatar(dataUrl)
            onUserChange(result.user)
            setAvatarOpen(false)
            await Taro.showToast({ title: '头像已更新', icon: 'success' })
          }}
        />
      )}
      {feedbackOpen && (
        <ReportModal
          targetType="FEEDBACK"
          title="问题反馈"
          onClose={() => setFeedbackOpen(false)}
        />
      )}
    </View>
  )
}

function NotificationsPanel({
  onReportLink,
  onNavigate,
}: { onReportLink?: (admin: boolean) => void; onNavigate?: () => void } = {}) {
  const [data, setData] = useState<NotificationResponse | null>(null)
  const [error, setError] = useState('')
  const [expanded, setExpanded] = useState(false)
  const load = useCallback(async () => {
    try {
      setData(await productRepository.getNotifications())
      setError('')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '消息加载失败')
    }
  }, [])
  const openNotification = async (item: NotificationResponse['items'][number]) => {
    try {
      setData(await productRepository.readNotification(item.id))
      if (item.type === 'REPORT_CREATED' || item.type === 'REPORT_UPDATED') {
        if (onReportLink) {
          onReportLink(item.type === 'REPORT_CREATED')
          return
        }
        await Taro.pageScrollTo({
          duration: 240,
          selector: item.type === 'REPORT_CREATED' ? '#admin-reports' : '#my-reports',
        })
        return
      }
      if (!item.linkPath) return
      const conversationId = readConversationId(item.linkPath)
      if (conversationId) {
        onNavigate?.()
        openMessaging({ conversationId })
        return
      }
      if (item.linkPath.startsWith('/pages/me/index')) return
      if (item.linkPath.startsWith('/pages/')) {
        onNavigate?.()
        await Taro.navigateTo({ url: item.linkPath })
      }
    } catch (error) {
      await Taro.showToast({
        title: error instanceof Error ? error.message : '消息打开失败',
        icon: 'none',
      })
    }
  }
  const markAllRead = async () => {
    try {
      setData(await productRepository.readAllNotifications())
    } catch (reason) {
      await Taro.showToast({
        title: reason instanceof Error ? reason.message : '全部已读操作失败',
        icon: 'none',
      })
    }
  }
  useEffect(() => {
    void load()
  }, [load])
  return (
    <View className="profile-section">
      <ProductSection
        kicker="NOTIFICATIONS"
        title="消息"
        {...(data ? { note: `${data.unreadCount} 条未读` } : {})}
      />
      {error && (
        <DataState
          kind="error"
          title="消息不可用"
          description={error}
          onRetry={() => void load()}
        />
      )}
      {data && (
        <View className="notification-list surface">
          <View className="notification-list__head">
            <Text>点赞、回复、申请与处理结果</Text>
            <Button disabled={data.unreadCount === 0} onClick={() => void markAllRead()}>
              全部已读
            </Button>
          </View>
          {(expanded ? data.items : data.items.slice(0, 20)).map((item) => (
            <View
              className={`notification-item ${item.readAt ? '' : 'notification-item--unread'}`}
              key={item.id}
              onClick={() => void openNotification(item)}
            >
              <UserAvatar
                avatarUrl={item.actor?.avatarUrl ?? null}
                name={item.actor?.displayName ?? '晓球'}
                userId={item.actor?.id}
                size="small"
              />
              <View>
                <Text>{item.title}</Text>
                <Text>{item.body ?? '点击查看'}</Text>
              </View>
              {!item.readAt && <Text className="notification-item__dot" />}
            </View>
          ))}
          {data.items.length > 20 && (
            <Button
              className="notification-list__more"
              onClick={() => setExpanded((value) => !value)}
            >
              {expanded ? '收起较早消息' : `查看其余 ${data.items.length - 20} 条`}
            </Button>
          )}
          {data.items.length === 0 && <Text className="profile-empty">暂时没有新消息</Text>}
        </View>
      )}
    </View>
  )
}

function readConversationId(linkPath: string): string | null {
  const match = /[?&]conversationId=([^&]+)/.exec(linkPath)
  if (!match?.[1]) return null
  try {
    return decodeURIComponent(match[1])
  } catch {
    return null
  }
}

function MyReportsPanel() {
  const [items, setItems] = useState<ReportItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const load = useCallback(async () => {
    setLoading(true)
    try {
      setItems((await productRepository.getMyReports()).items)
      setError('')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '投诉记录加载失败')
    } finally {
      setLoading(false)
    }
  }, [])
  useEffect(() => {
    void load()
  }, [load])
  return (
    <View className="profile-section" id="my-reports">
      <ProductSection kicker="REPORTS" title="我的反馈与投诉" note={`${items.length} 条`} />
      {loading && <DataState kind="loading" title="正在读取投诉记录" />}
      {error && !loading && (
        <DataState
          kind="error"
          title="投诉记录不可用"
          description={error}
          onRetry={() => void load()}
        />
      )}
      {!loading && !error && (
        <View className="report-list surface">
          {items.map((item) => (
            <View className="report-row" key={item.id}>
              <View>
                <Text>{item.reason}</Text>
                <Text>{item.details ?? '无补充说明'}</Text>
              </View>
              <View>
                <Text>{reportStatusLabel(item.status)}</Text>
                <Text>{item.resolution ?? '等待管理员处理'}</Text>
              </View>
            </View>
          ))}
          {items.length === 0 && <Text className="profile-empty">暂无反馈或投诉记录</Text>}
        </View>
      )}
    </View>
  )
}

function AdminReportPanel() {
  const [items, setItems] = useState<ReportItem[]>([])
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const load = useCallback(async () => {
    setLoading(true)
    try {
      setItems((await productRepository.getAdminReports()).items)
      setError('')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '投诉处理台加载失败')
    } finally {
      setLoading(false)
    }
  }, [])
  useEffect(() => {
    void load()
  }, [load])
  const resolve = async (item: ReportItem, hideContent: boolean) => {
    const resolution = drafts[item.id]?.trim() ?? ''
    if (resolution.length < 2) {
      await Taro.showToast({ title: '请先填写至少 2 个字的处理回复', icon: 'none' })
      return
    }
    const result = await Taro.showModal({
      title: hideContent ? '处理并隐藏内容' : '回复提交者',
      content: hideContent
        ? '确认隐藏被投诉内容并把回复发给提交者？'
        : '确认把处理回复发给提交者？',
      confirmText: '确认处理',
    })
    if (!result.confirm) return
    try {
      const data = await productRepository.reviewReport(
        item.id,
        'RESOLVED',
        resolution,
        hideContent,
      )
      setItems(data.items)
      await Taro.showToast({ title: '处理结果已发送', icon: 'success' })
    } catch (error) {
      await Taro.showToast({
        title: error instanceof Error ? error.message : '处理失败',
        icon: 'none',
      })
    }
  }
  return (
    <View className="profile-section" id="admin-reports">
      <ProductSection
        kicker="ADMIN REPORTS"
        title="投诉处理台"
        note={`${items.filter((item) => item.status === 'OPEN').length} 条待处理`}
      />
      {loading && <DataState kind="loading" title="正在读取投诉处理台" />}
      {error && !loading && (
        <DataState
          kind="error"
          title="投诉处理台不可用"
          description={error}
          onRetry={() => void load()}
        />
      )}
      {!loading && !error && (
        <View className="admin-report-list">
          {items.map((item) => (
            <View className="admin-report-card surface" key={item.id}>
              <View>
                <Text>
                  {item.reporter?.displayName ?? '用户'} · {item.targetType}
                </Text>
                <Text>{item.reason}</Text>
                <Text>{item.details ?? '无补充说明'}</Text>
              </View>
              {item.targetPreview && (
                <View className="admin-report-card__target">
                  <Text>{item.targetPreview.title}</Text>
                  <Text>{item.targetPreview.body ?? '内容不可预览'}</Text>
                  {item.targetPreview.linkPath && (
                    <Button
                      onClick={() => void Taro.navigateTo({ url: item.targetPreview!.linkPath! })}
                    >
                      查看被投诉内容
                    </Button>
                  )}
                </View>
              )}
              {item.status === 'OPEN' || item.status === 'IN_REVIEW' ? (
                <>
                  <Input
                    className="admin-report-card__input"
                    maxlength={1000}
                    placeholder="填写给提交者的处理回复"
                    value={drafts[item.id] ?? ''}
                    onInput={(event) =>
                      setDrafts((current) => ({ ...current, [item.id]: event.detail.value }))
                    }
                  />
                  <View className="admin-report-card__actions">
                    <Button onClick={() => void resolve(item, false)}>回复并解决</Button>
                    {(item.targetType === 'POST' || item.targetType === 'COMMENT') && (
                      <Button
                        className="admin-report-card__danger"
                        onClick={() => void resolve(item, true)}
                      >
                        删除内容并回复
                      </Button>
                    )}
                  </View>
                </>
              ) : (
                <Text className="admin-report-card__resolved">{item.resolution}</Text>
              )}
            </View>
          ))}
          {items.length === 0 && <Text className="profile-empty">暂无投诉或反馈</Text>}
        </View>
      )}
    </View>
  )
}

function reportStatusLabel(status: string): string {
  return (
    (
      { OPEN: '待处理', IN_REVIEW: '处理中', RESOLVED: '已解决', REJECTED: '已驳回' } as Record<
        string,
        string
      >
    )[status] ?? status
  )
}

function AdminIdentityDirectory() {
  const [state, setState] = useState<
    | { phase: 'loading' }
    | { phase: 'ready'; identities: AdminIdentity[] }
    | { phase: 'failed'; message: string }
  >({ phase: 'loading' })

  const load = useCallback(async () => {
    setState({ phase: 'loading' })
    try {
      setState({ phase: 'ready', identities: await productRepository.getAdminIdentities() })
    } catch (error) {
      setState({
        phase: 'failed',
        message: error instanceof Error ? error.message : '实名目录加载失败',
      })
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <View className="profile-section">
      <ProductSection kicker="IDENTITY ADMIN" title="实名账号目录" note="组织管理员" />
      {state.phase === 'loading' && <DataState kind="loading" title="正在读取实名目录" />}
      {state.phase === 'failed' && (
        <DataState
          kind="error"
          title="实名目录不可用"
          description={state.message}
          onRetry={() => void load()}
        />
      )}
      {state.phase === 'ready' && (
        <View className="identity-directory">
          {state.identities.map((identity) => (
            <View className="identity-card" key={identity.id}>
              <View className="identity-card__heading">
                <View>
                  <PersonTrigger userId={identity.id} name={identity.displayName}>
                    <Text className="identity-card__nickname">{identity.displayName}</Text>
                  </PersonTrigger>
                  <Text className="identity-card__username">@{identity.username}</Text>
                </View>
                <Text className="identity-card__verification">
                  {verificationLabel(identity.verificationLevel)}
                </Text>
              </View>
              <View className="identity-card__details">
                <Text>实名 {identity.realName ?? '未登记'}</Text>
                <Text>学号 {identity.studentId ?? '未登记'}</Text>
                <Text>邮箱 {identity.email ?? '未绑定'}</Text>
              </View>
              <View className="identity-card__roles">
                {(identity.roles.length > 0 ? identity.roles.map(roleLabel) : ['普通用户']).map(
                  (role) => (
                    <Text key={role}>{role}</Text>
                  ),
                )}
              </View>
            </View>
          ))}
        </View>
      )}
    </View>
  )
}

function ServiceItem({ title, note, action }: { title: string; note: string; action: () => void }) {
  return (
    <View className="service-item" onClick={action}>
      <Text className="service-item__title">{title}</Text>
      <Text className="service-item__note">{note}</Text>
      <Text className="service-item__open">进入</Text>
    </View>
  )
}
