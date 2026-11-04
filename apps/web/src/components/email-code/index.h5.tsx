import { useEffect, useRef, useState } from 'react'
import { useEmailResendCountdown } from './countdown.h5'
import { ProductApiError } from '../../features/product/product.repository'
import { emailAuth, type EmailPurpose } from '../../features/product/email-auth.repository.h5'
import type { AuthUser } from '../../features/product/product.types'
import './index.h5.scss'

export function EmailCodeField({
  email,
  purpose,
  value,
  onChange,
  error: fieldError,
}: {
  email: string
  purpose: EmailPurpose
  value: string
  onChange: (value: string) => void
  error?: string | undefined
}) {
  const [sending, setSending] = useState(false)
  const { remaining, start } = useEmailResendCountdown(email)
  const [requested, setRequested] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const busy = useRef(false)
  const currentEmail = useRef(email)
  currentEmail.current = email
  const id = `email-code-${purpose.toLowerCase()}`
  useEffect(() => {
    setError('')
    setMessage('')
    setRequested(false)
  }, [email.trim().toLowerCase()])
  async function send() {
    if (busy.current || remaining) return
    busy.current = true
    setSending(true)
    setError('')
    setMessage('')
    const target = email
    try {
      const result = await emailAuth.requestCode(target, purpose)
      start(result.retryAfterSeconds)
      setRequested(true)
      if (currentEmail.current === target) setMessage(result.message)
    } catch (issue) {
      if (issue instanceof ProductApiError && issue.statusCode === 429)
        start(issue.retryAfterSeconds ?? 60)
      setError(issue instanceof Error ? issue.message : '验证码请求失败，请稍后重试')
    } finally {
      busy.current = false
      setSending(false)
    }
  }
  return (
    <div className="email-code">
      <label className="email-code__label" htmlFor={id}>
        邮箱验证码 <span aria-hidden="true">*</span>
      </label>
      <div className="email-code__row">
        <input
          className="email-code__input"
          id={id}
          autoComplete="one-time-code"
          inputMode="numeric"
          maxLength={6}
          placeholder="6位数字验证码"
          value={value}
          required
          aria-invalid={Boolean(error || fieldError)}
          onChange={(event) => onChange(event.target.value.replace(/\D/g, '').slice(0, 6))}
        />
        <button
          className="email-code__button"
          type="button"
          disabled={sending || remaining > 0 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())}
          onClick={() => void send()}
        >
          {sending
            ? '请求中…'
            : remaining
              ? `${remaining}秒后重发`
              : requested
                ? '重新获取'
                : '获取验证码'}
        </button>
      </div>
      {message && <p role="status">{message}</p>}
      {(error || fieldError) && (
        <p className="email-code__error" role="alert">
          {fieldError || error}
        </p>
      )}
    </div>
  )
}

export function EmailVerificationPanel({
  user,
  onVerified,
}: {
  user: AuthUser
  onVerified: (user: AuthUser) => void
}) {
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  async function verify() {
    if (busy) return
    setBusy(true)
    setError('')
    try {
      onVerified(await emailAuth.verify(user.email ?? '', code))
      setCode('')
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : '验证失败')
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="email-code">
      <p>
        {user.emailVerifiedAt
          ? '邮箱已验证，可用于邮箱登录和找回密码。'
          : '邮箱尚未验证。验证后可用于邮箱登录和找回密码。'}
      </p>
      {!user.emailVerifiedAt && user.email && (
        <>
          <p>验证邮箱：{user.email}</p>
          <EmailCodeField
            email={user.email}
            purpose="VERIFY_EMAIL"
            value={code}
            onChange={setCode}
          />
          <button
            className="email-code__button"
            type="button"
            disabled={code.length !== 6 || busy}
            onClick={() => void verify()}
          >
            {busy ? '验证中…' : '验证绑定邮箱'}
          </button>
        </>
      )}
      {error && (
        <p className="email-code__error" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
