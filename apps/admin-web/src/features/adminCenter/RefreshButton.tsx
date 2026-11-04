import { useEffect, useState, useSyncExternalStore } from 'react'
import { requestActivity } from '../adminAuth/request-activity'
import { refreshManagementData } from '../adminAuth/refresh'

export function RefreshButton() {
  // Lucide refresh-cw, ISC; full attribution: public/icons/LUCIDE-LICENSE.txt.
  const active = useSyncExternalStore(requestActivity.subscribe, requestActivity.snapshot)
  const [pending, setPending] = useState(false),
    [minimumElapsed, setMinimumElapsed] = useState(false),
    [status, setStatus] = useState('')
  useEffect(() => {
    if (!pending) return
    const timer = window.setTimeout(() => setMinimumElapsed(true), 500)
    return () => window.clearTimeout(timer)
  }, [pending])
  useEffect(() => {
    if (pending && minimumElapsed && active === 0) {
      setPending(false)
      setStatus('刷新完成')
    }
  }, [pending, minimumElapsed, active])
  return (
    <>
      <button
        type="button"
        className={`mc-refresh${pending ? ' is-loading' : ''}`}
        aria-label="刷新管理平台"
        aria-busy={pending}
        disabled={pending}
        title={pending ? '正在刷新…' : '刷新当前页面与待办'}
        onClick={() => {
          setMinimumElapsed(false)
          setPending(true)
          setStatus('正在刷新')
          refreshManagementData()
        }}
      >
        <svg
          width="19"
          height="19"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
          <path d="M21 3v5h-5" />
          <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
          <path d="M8 16H3v5" />
        </svg>
      </button>
      <span className="mc-sr-only" role="status">
        {status}
      </span>
    </>
  )
}
