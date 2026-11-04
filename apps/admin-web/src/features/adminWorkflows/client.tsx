import { ADMIN_REFRESH_EVENT } from '../adminAuth/refresh'
import { useCallback, useEffect, useRef, useState } from 'react'
import { requireAdminApi } from '../adminAuth/config'
import { AdminApiError, requestAdmin } from '../adminAuth/request'
import type { OrganizationContext } from '../adminSchedule/types'

interface WorkflowRequest {
  path: string
  method?: 'POST' | 'PATCH' | 'PUT' | 'DELETE'
  body?: unknown
  headers?: Record<string, string>
}

export function workflowRequest<T>(
  context: OrganizationContext,
  path: string,
  options: {
    method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'
    body?: unknown
    headers?: Record<string, string>
    signal?: AbortSignal
  } = {},
): Promise<T> {
  return requestAdmin<T>(requireAdminApi(), context, path, options)
}

export function useWorkflowRead<T>(context: OrganizationContext, path: string | null) {
  const identity = `${context.organizationId}/${context.accessToken}/${path ?? ''}`
  const [state, setState] = useState<{
    identity: string
    data: T | null
    loading: boolean
    error: string
  }>({
    identity,
    data: null,
    loading: Boolean(path),
    error: '',
  })
  const [revision, setRevision] = useState(0)
  useEffect(() => {
    const refresh = (event: Event) => {
      const paths = (event as CustomEvent<{ paths?: string[] }>).detail?.paths
      if (!paths || paths.some(prefix => path?.startsWith(prefix))) setRevision((value) => value + 1)
    }
    window.addEventListener(ADMIN_REFRESH_EVENT, refresh)
    return () => window.removeEventListener(ADMIN_REFRESH_EVENT, refresh)
  }, [path])
  useEffect(() => {
    const controller = new AbortController()
    if (!path) {
      setState({ identity, data: null, loading: false, error: '' })
      return () => controller.abort()
    }
    setState((previous) => ({
      identity,
      data: previous.identity === identity ? previous.data : null,
      loading: true,
      error: '',
    }))
    void workflowRequest<T>(context, path, { signal: controller.signal }).then(
      (data) => {
        if (!controller.signal.aborted) setState({ identity, data, loading: false, error: '' })
      },
      (error) => {
        if (!controller.signal.aborted)
          setState((previous) => ({
            identity,
            data:
              previous.identity === identity &&
              !(error instanceof AdminApiError && [401, 403].includes(error.status))
                ? previous.data
                : null,
            loading: false,
            error: errorMessage(error),
          }))
      },
    )
    return () => controller.abort()
    // Only session identity and the requested object determine this read.
  }, [identity, path, revision])
  const visible =
    state.identity === identity ? state : { data: null, loading: Boolean(path), error: '' }
  return { ...visible, refresh: useCallback(() => setRevision((value) => value + 1), []) }
}

// An uncertain write retains its full command and key. A retry never reads new form fields.
export function useWorkflowCommand<T>(
  context: OrganizationContext,
  onSuccess: (result: T) => void,
  scope: string,
) {
  const storageKey = `xiaoqiu:admin-workflow-pending:v1:${context.organizationId}:${context.userId}:${scope}`
  const [pending, setPending] = useState<WorkflowRequest | null>(() => {
    try {
      const raw = sessionStorage.getItem(storageKey)
      const stored = raw ? (JSON.parse(raw) as WorkflowRequest) : null
      return stored && stored.path === scope && stored.body && typeof stored.body === 'object'
        ? stored
        : null
    } catch {
      return null
    }
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const pendingRef = useRef<WorkflowRequest | null>(pending)
  const busyRef = useRef(false)
  const alive = useRef(true)
  const success = useRef(onSuccess)
  success.current = onSuccess
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])
  const retain = (request: WorkflowRequest | null) => {
    pendingRef.current = request
    setPending(request)
    try {
      if (request) sessionStorage.setItem(storageKey, JSON.stringify(request))
      else sessionStorage.removeItem(storageKey)
    } catch {
      /* The current page still retains the original command in memory. */
    }
  }

  const run = async (request?: WorkflowRequest) => {
    if (busyRef.current) return
    const command = pendingRef.current ?? request
    if (!command) return
    retain(command)
    busyRef.current = true
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const result = await workflowRequest<T>(context, command.path, {
        method: command.method ?? 'POST',
        body: command.body,
        ...(command.headers ? { headers: command.headers } : {}),
      })
      if (!alive.current) return
      retain(null)
      setNotice('操作已由服务器保存。')
      success.current(result)
    } catch (cause) {
      if (!alive.current) return
      const uncertain =
        cause instanceof AdminApiError &&
        (cause.status === 0 ||
          cause.status >= 500 ||
          (cause.status === 409 &&
            (cause.code === 'IDEMPOTENCY_IN_PROGRESS' ||
              /原幂等键重试|保留幂等键重试|请求正在处理/.test(cause.message))))
      if (!uncertain) retain(null)
      setError(
        uncertain
          ? `${errorMessage(cause)} 本次操作结果尚未确认；请保留当前页面并重试原请求。`
          : cause instanceof AdminApiError && cause.status === 409
            ? `${cause.message} 请刷新并核对最新版本，再发起新的操作。`
            : errorMessage(cause),
      )
    } finally {
      busyRef.current = false
      if (alive.current) setBusy(false)
    }
  }
  return { pending, busy, error, notice, run, locked: busy || pending !== null }
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '请求未完成，请稍后重试。'
}
export function actionId(): string {
  return `admin-${crypto.randomUUID()}`
}
export function displayDate(value: string): string {
  const date = new Date(value)
  return Number.isFinite(date.getTime())
    ? date.toLocaleString('zh-CN', { timeZone: 'Asia/Singapore', hour12: false })
    : '时间待定'
}
export const workflowLabels: Record<string, string> = {
  DRAFT: '草稿',
  SUBMITTED: '待审核',
  RETURNED: '已退回',
  APPROVED: '已批准',
  LOCKED: '已锁定',
  REOPENED: '已开放补报',
  CONFIRMED: '已确认',
  SAVE: '保存',
  SUBMIT: '提交',
  RETURN: '退回',
  APPROVE: '批准',
  LOCK: '锁定',
  REOPEN: '开放补报',
  CONFIRM: '确认',
  CORRECT: '开启更正',
  FINISHED: '正常完赛',
  HOME_FORFEIT: '主队弃权',
  AWAY_FORFEIT: '客队弃权',
  ABANDONED: '比赛中止',
  GOAL: '进球',
  OWN_GOAL: '乌龙球',
  YELLOW_CARD: '黄牌',
  RED_CARD: '红牌',
  SUBSTITUTION: '换人',
}
export function CommandStatus({
  command,
}: {
  command: {
    error: string
    notice: string
    pending: unknown
    busy: boolean
    run: () => Promise<void>
  }
}) {
  return (
    <>
      {command.error ? (
        <div className="mc-alert" role="alert">
          {command.error}
        </div>
      ) : null}
      {command.notice ? (
        <p className="wf-success" role="status">
          {command.notice}
        </p>
      ) : null}
      {command.pending && !command.busy ? (
        <div className="mc-alert">
          <p>有一项请求尚待确认。重试会使用原内容与原提交编号，不会新增一次操作。</p>
          <button
            type="button"
            onClick={() => {
              void command.run()
            }}
          >
            重试本次请求
          </button>
        </div>
      ) : null}
    </>
  )
}
