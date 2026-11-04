import { useCallback, useEffect, useId, useRef, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { requireAdminApi } from '../adminAuth/config'
import { AdminApiError, requestAdmin } from '../adminAuth/request'
import type { OrganizationContext } from '../adminSchedule/types'
import { ADMIN_REFRESH_EVENT } from '../adminAuth/refresh'
import { CommandStatus, useWorkflowCommand } from '../adminWorkflows/client'
import { refreshManagementData } from '../adminAuth/refresh'
import { actionReason } from './action-reason'

export type Row = Record<string, unknown> & { id: string }
export interface PageData<T = Row> {
  items: T[]
  total: number
  page: number
  pageSize: number
}
export function message(error: unknown): string {
  if (error instanceof AdminApiError && error.status === 409) return error.message
  return error instanceof Error ? error.message : '读取失败，请重试。'
}
export function textValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '未填写'
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}
const LABELS: Record<string, string> = {
  ACTIVE: '正常',
  SUSPENDED: '已停用',
  PENDING: '待审核',
  LEFT: '已退出',
  FROZEN: '已冻结',
  DELETED: '已注销',
  DRAFT: '草稿',
  PUBLISHED: '已发布',
  HIDDEN: '已隐藏',
  ARCHIVED: '已归档',
  OPEN: '待处理',
  IN_REVIEW: '处理中',
  RESOLVED: '已处理',
  REJECTED: '已驳回',
  SUBMITTED: '待审核',
  APPROVED: '已批准',
  LOCKED: '已锁定',
  SCHEDULED: '未开赛',
  LIVE: '进行中',
  FINISHED: '已结束',
  POSTPONED: '已延期',
  CANCELLED: '已取消',
  OFFICIAL: '官方资讯',
  COMMUNITY: '社区动态',
  TEAM: '球队动态',
  ORGANIZATION_ADMIN: '组织管理员',
  PLATFORM_ADMIN: '总管理员',
  TOURNAMENT_ADMIN: '赛事管理员',
  TEAM_CAPTAIN: '队长',
  TEAM_COACH: '教练',
  MATCH_REPORTER: '信息员',
  GK: '门将',
  DF: '后卫',
  MF: '中场',
  FW: '前锋',
  LEFT_FOOT: '左脚',
  RIGHT_FOOT: '右脚',
  BOTH: '双脚',
  GOALKEEPER: '门将',
  DEFENDER: '后卫',
  MIDFIELDER: '中场',
  FORWARD: '前锋',
  RIGHT: '右脚',
  LOGIN: '登录',
  SESSION_REVOKED: '会话撤销',
  POST_CREATED: '发布帖子',
  COMMENT_CREATED: '发表评论',
  CURRENT_LIKE: '当前点赞关系',
  USER_PROFILE_UPDATED: '修改用户资料',
  USER_IDENTITY_VIEWED: '查看用户身份',
  USER_DIRECTORY_VIEWED: '查看用户目录',
  POST_APPROVED: '批准帖子',
  POST_BLOCKED: '封禁帖子',
  POST_RESTORED: '恢复帖子',
  MEDIA_BLOCKED: '封禁图片',
  MEDIA_RESTORED: '恢复图片',
  MEDIA_PREVIEWED: '查看图片',
  LOCAL_OWNER_SESSION_STARTED: '本机一键进入',
  USER_ACCESS_FROZEN: '冻结账号',
  USER_ACCESS_BANNED: '封禁账号',
  USER_ACCESS_RESTORED: '恢复账号访问',
  AI_MODERATION_REVIEWED: 'AI审核记录',
  DIRECT_MESSAGE_QUEUE_VIEWED: '查看私聊审核队列',
  DIRECT_MESSAGE_HIDDEN: '隐藏违规私信',
  DIRECT_MESSAGE_APPROVED: '私信复核通过',
  DIRECT_MESSAGE_RESTORED: '恢复私信展示',
  REGISTRATION_HELP_SUBMITTED: '收到注册问题',
  REGISTRATION_HELP_RESOLVED: '处理注册问题',
  ADMIN_LOGIN_PASSWORD_ASSIGNED: '分配登录密码',
  ADMIN_LOGIN_PASSWORD_VIEWED: '查看登录密码',
  PLAYER_LOGIN_ACCOUNTS_CREATED: '为球员创建账号',
  ALLOW: '建议通过',
  REVIEW: '需要复核',
  BLOCK: '建议封禁',
}
export function label(value: unknown) {
  return LABELS[String(value)] || textValue(value)
}
export function time(value: unknown) {
  if (!value || Number.isNaN(Date.parse(String(value)))) return '未记录'
  return new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(String(value)),
  )
}
export function useAdminData<T>(
  context: OrganizationContext,
  path: string | null,
  map?: (data: unknown) => T,
) {
  const identity = `${context.organizationId}/${context.accessToken}/${path ?? ''}`
  const [state, setState] = useState<{
    identity: string
    data: T | null
    error: string
    loading: boolean
  }>({ identity, data: null, error: '', loading: Boolean(path) })
  const [revision, setRevision] = useState(0)
  const refresh = useCallback(() => setRevision((v) => v + 1), [])
  useEffect(() => {
    const handle = (event: Event) => {
      const paths = (event as CustomEvent<{ paths?: string[] }>).detail?.paths
      if (!paths || paths.some(prefix => path?.startsWith(prefix))) refresh()
    }
    window.addEventListener(ADMIN_REFRESH_EVENT, handle)
    return () => window.removeEventListener(ADMIN_REFRESH_EVENT, handle)
  }, [refresh, path])
  useEffect(() => {
    const controller = new AbortController()
    if (!path) {
      setState({ identity, data: null, error: '', loading: false })
      return
    }
    setState((previous) => ({
      identity,
      data: previous.identity === identity ? previous.data : null,
      error: '',
      loading: true,
    }))
    void requestAdmin<T>(requireAdminApi(), context, path, { signal: controller.signal })
      .then((data) => {
        if (!controller.signal.aborted)
          setState({ identity, data: map ? map(data) : data, error: '', loading: false })
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted)
          setState((previous) => ({
            identity,
            data:
              previous.identity === identity &&
              !(error instanceof AdminApiError && [401, 403].includes(error.status))
                ? previous.data
                : null,
            error: message(error),
            loading: false,
          }))
      })
    return () => controller.abort()
  }, [identity, path, revision, map])
  return {
    ...(state.identity === identity ? state : { data: null, error: '', loading: Boolean(path) }),
    refresh,
    update: (change: (current: T | null) => T | null) => setState(previous =>
      previous.identity === identity ? { ...previous, data: change(previous.data) } : previous),
  }
}
export function DataState({
  loading,
  error,
  empty,
  onRetry,
}: {
  loading: boolean
  error: string
  empty?: boolean
  onRetry: () => void
}) {
  if (loading)
    return (
      <div className="mc-state" role="status">
        <span className="mc-spinner" />
        正在读取后台数据…
      </div>
    )
  if (error)
    return (
      <div className="mc-state mc-error" role="alert">
        <strong>暂时无法读取</strong>
        <p>{error}</p>
        <button className="secondary-button" onClick={onRetry}>
          重新读取
        </button>
      </div>
    )
  if (empty)
    return (
      <div className="mc-state">
        <strong>这里还没有记录</strong>
        <p>新增资料或调整筛选条件后，记录会显示在这里。</p>
      </div>
    )
  return null
}
export function Icon({ name, className = '' }: { name: string; className?: string }) {
  return (
    <img
      className={`mc-icon ${className}`}
      src={`${import.meta.env.BASE_URL}icons/${name}.svg`}
      alt=""
      aria-hidden="true"
    />
  )
}
export function Badge({ value }: { value: unknown }) {
  return <span className={`mc-badge mc-status-${String(value).toLowerCase()}`}>{label(value)}</span>
}
export function PendingCapability({ title, description }: { title: string; description: string }) {
  return (
    <details className="mc-capability">
      <summary>
        <span className="mc-badge">待接通</span>
        <strong>{title}</strong>
      </summary>
      <p>{description}</p>
    </details>
  )
}
export function Pager({
  data,
  page,
  onPage,
}: {
  data: PageData
  page: number
  onPage: (v: number) => void
}) {
  return (
    <footer className="mc-pager">
      <span>
        共 {data.total} 条 · 第 {page} 页
      </span>
      <div className="mc-actions">
        <button className="secondary-button" disabled={page <= 1} onClick={() => onPage(page - 1)}>
          上一页
        </button>
        <button
          className="secondary-button"
          disabled={page * data.pageSize >= data.total}
          onClick={() => onPage(page + 1)}
        >
          下一页
        </button>
      </div>
    </footer>
  )
}
export function Modal({
  title,
  children,
  onClose,
  variant = 'dialog',
  className = '',
}: {
  title: string
  children: ReactNode
  onClose: () => void
  variant?: 'dialog' | 'drawer'
  className?: string
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  useEffect(() => {
    const dialog = ref.current
    dialog?.showModal()
    return () => dialog?.close()
  }, [])
  return (
    <dialog
      ref={ref}
      className={`mc-modal ${variant === 'drawer' ? 'mc-drawer' : ''} ${className}`}
      onCancel={(event) => {
        event.preventDefault()
        onClose()
      }}
      aria-labelledby={titleId}
    >
      <header>
        <h2 id={titleId}>{title}</h2>
        <button type="button" className="mc-dialog-close" aria-label="关闭弹窗" onClick={onClose}>
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            aria-hidden="true"
          >
            <path d="m6 6 12 12M18 6 6 18" strokeLinecap="round" />
          </svg>
        </button>
      </header>
      {children}
    </dialog>
  )
}
export function ActionForm({
  context,
  path,
  method = 'POST',
  body,
  submitLabel,
  children,
  onDone,
  canSubmit = true,
  refreshAll = true,
}: {
  context: OrganizationContext
  path: string
  method?: 'POST' | 'PATCH' | 'PUT'
  body: Record<string, unknown>
  submitLabel: string
  children?: ReactNode
  onDone: () => void
  canSubmit?: boolean
  refreshAll?: boolean
}) {
  const [reason, setReason] = useState('')
  const reasonPolicy = actionReason(path, method, body)
  const reasonId = useId()
  const command = useWorkflowCommand<unknown>(
    context,
    () => {
      onDone()
      if (refreshAll) refreshManagementData()
    },
    path,
  )
  async function submit(event: FormEvent) {
    event.preventDefault()
    if (command.locked || !canSubmit) return
    const payload = { ...body, reason: reasonPolicy.required ? reason.trim() : reasonPolicy.text }
    await command.run({
      path,
      method,
      body: payload,
      headers: { 'Idempotency-Key': crypto.randomUUID() },
    })
  }
  return (
    <form
      className="mc-form"
      onSubmit={(e) => {
        void submit(e)
      }}
    >
      <fieldset className="mc-form-body" disabled={command.locked}>
        {children}
      </fieldset>
      <CommandStatus command={command} />
      <div className="mc-savebar">
        {reasonPolicy.required && (
          <label className="mc-field">
            <span id={reasonId}>修改原因</span>
            <input
              aria-labelledby={reasonId}
              required
              minLength={2}
              maxLength={500}
              value={reason}
              disabled={command.locked}
              placeholder="例如：核对报名表后补充资料（至少2字）"
              onChange={(e) => setReason(e.target.value)}
            />
          </label>
        )}
        <button
          type="submit"
          disabled={
            command.locked || !canSubmit || (reasonPolicy.required && reason.trim().length < 2)
          }
        >
          {command.busy ? '正在保存…' : submitLabel}
        </button>
      </div>
    </form>
  )
}
