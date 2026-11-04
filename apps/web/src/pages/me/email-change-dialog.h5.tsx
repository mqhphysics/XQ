import { useEffect, useRef, useState } from 'react'
import type { AuthUser } from '../../features/product/product.types'
import {
  emailChange,
  type EmailChangeFlow,
} from '../../features/product/email-change.repository.h5'
import { ReportModal } from '../../components/report-modal'
import { ProfileDialog } from './profile-dialog.h5'
import './personal-information.h5.scss'
import { useEmailResendCountdown } from '../../components/email-code/countdown.h5'
import { ProductApiError } from '../../features/product/product.repository'
export function EmailChangeDialog({
  user,
  onChanged,
  onClose,
}: {
  user: AuthUser
  onChanged: (user: AuthUser) => void
  onClose: () => void
}) {
  const [flow, setFlow] = useState<EmailChangeFlow | null>(null),
    [email, setEmail] = useState(''),
    [code, setCode] = useState('')
  const [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [busy, setBusy] = useState(false),
    [success, setSuccess] = useState(false),
    [manual, setManual] = useState(false)
  const [requestedEmail, setRequestedEmail] = useState<string | null>(null)
  const old = flow?.stage === 'OLD_EMAIL'
  const { remaining, start } = useEmailResendCountdown(old ? (flow?.currentEmail ?? '') : email)
  const lock = useRef(false)
  const initiallyBound = useRef(Boolean(user.email)).current
  useEffect(() => {
    let active = true
    void emailChange
      .start()
      .then((value) => {
        if (active) {
          setFlow(value)
          setEmail(value.newEmail ?? '')
          setRequestedEmail(value.newEmail)
        }
      })
      .catch((issue) => {
        if (active) setError(issue.message)
      })
    return () => {
      active = false
    }
  }, [user.id, user.organizationId])
  const close = () => {
    if (!lock.current) onClose()
  }
  const send = async () => {
    if (!flow || lock.current || remaining) return
    if (!old && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError('请输入有效的新邮箱')
      return
    }
    lock.current = true
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const result = await emailChange.requestCode(flow.id, old ? undefined : email.trim())
      setRequestedEmail(email.trim().toLowerCase())
      start(result.retryAfterSeconds)
      setNotice(result.message)
    } catch (issue) {
      if (issue instanceof ProductApiError && issue.statusCode === 429)
        start(issue.retryAfterSeconds ?? 60)
      setError(issue instanceof Error ? issue.message : '验证码请求失败')
    } finally {
      lock.current = false
      setBusy(false)
    }
  }
  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!flow || lock.current) return
    lock.current = true
    setBusy(true)
    setError('')
    try {
      if (old) {
        setFlow(await emailChange.verifyOld(flow.id, code))
        setCode('')
        setNotice('原邮箱已验证，请继续验证新邮箱。')
        setRequestedEmail(null)
      } else {
        onChanged(await emailChange.complete(flow.id, code))
        setSuccess(true)
      }
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : '验证未完成')
    } finally {
      lock.current = false
      setBusy(false)
    }
  }
  const formId = 'email-change-form'
  const twoStep = Boolean(flow?.currentEmail)
  const submitDisabled =
    busy || code.length !== 6 || (!old && requestedEmail !== email.trim().toLowerCase())
  const steps = [
    { label: '验证原邮箱', note: flow?.currentEmail ?? '' },
    { label: initiallyBound ? '绑定新邮箱' : '绑定邮箱', note: '输入新邮箱并验证' },
  ]
  const current = old ? 0 : 1
  return (
    <ProfileDialog
      className="email-change-dialog"
      title={initiallyBound ? '换绑邮箱' : '绑定邮箱'}
      {...(success ? {} : { note: '验证邮箱归属后完成绑定，验证码 5 分钟内有效。' })}
      onClose={close}
      {...(flow && !success
        ? {
            footer: (
              <div className="email-change-footer">
                <button
                  data-profile-button
                  type="button"
                  className="profile-button profile-button--outline"
                  disabled={busy}
                  onClick={close}
                >
                  取消
                </button>
                <button
                  data-profile-button
                  data-email-submit
                  type="submit"
                  form={formId}
                  className="profile-button profile-button--primary"
                  disabled={submitDisabled}
                >
                  {busy ? '正在验证…' : old ? '验证并继续' : '验证并绑定'}
                </button>
              </div>
            ),
          }
        : {})}
    >
      {success ? (
        <div className="email-change-success">
          <span>✓</span>
          <strong>{initiallyBound ? '邮箱换绑已完成' : '邮箱绑定已完成'}</strong>
          <button
            data-profile-button
            className="profile-button profile-button--primary"
            onClick={onClose}
          >
            完成
          </button>
        </div>
      ) : (
        <>
          {!flow && !error && (
            <p className="email-change-loading" role="status">
              正在读取邮箱绑定…
            </p>
          )}
          {flow && (
            <form
              id={formId}
              className="email-change-form"
              onSubmit={(event) => void submit(event)}
            >
              {twoStep && (
                <ol className="email-stepper" aria-label="换绑步骤">
                  {steps.map((step, index) => (
                    <li
                      key={step.label}
                      className={`email-stepper__step ${index < current ? 'is-done' : ''} ${index === current ? 'is-active' : ''}`}
                      aria-current={index === current ? 'step' : undefined}
                    >
                      <span className="email-stepper__dot" aria-hidden="true">
                        {index < current ? '✓' : index + 1}
                      </span>
                      <span className="email-stepper__text">
                        <strong>{step.label}</strong>
                        <small>{step.note}</small>
                      </span>
                    </li>
                  ))}
                </ol>
              )}
              <div className="email-field">
                <label className="email-field__label" htmlFor="email-change-address">
                  {old ? '原邮箱' : '新邮箱'}
                </label>
                <input
                  id="email-change-address"
                  data-email-input=""
                  className="email-field__input"
                  type="email"
                  autoComplete="email"
                  placeholder={old ? '' : 'name@example.edu.cn'}
                  value={old ? (flow.currentEmail ?? '') : email}
                  readOnly={old}
                  required
                  onChange={(event) => {
                    setEmail(event.target.value)
                    setCode('')
                    setRequestedEmail(null)
                    setNotice('')
                  }}
                />
              </div>
              <div className="email-field">
                <label className="email-field__label" htmlFor="email-change-code">
                  邮箱验证码
                </label>
                <div className="email-field__row">
                  <input
                    id="email-change-code"
                    data-email-input=""
                    className="email-field__input email-field__input--code"
                    aria-label="邮箱验证码"
                    autoComplete="one-time-code"
                    inputMode="numeric"
                    pattern="[0-9]{6}"
                    maxLength={6}
                    placeholder="6 位数字"
                    value={code}
                    required
                    onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))}
                  />
                  <button
                    data-profile-button
                    data-email-send
                    type="button"
                    className={`email-field__send ${remaining ? 'is-counting' : ''}`}
                    disabled={busy || remaining > 0}
                    onClick={() => void send()}
                  >
                    {remaining
                      ? `${remaining} 秒后重新获取`
                      : busy
                        ? '正在发送…'
                        : requestedEmail
                          ? '重新获取'
                          : '获取验证码'}
                  </button>
                </div>
                {notice ? (
                  <p className="email-field__hint is-notice" role="status">
                    {notice}
                  </p>
                ) : (
                  <p className="email-field__hint">
                    {old
                      ? '验证码将发送到原邮箱。'
                      : '先填写新邮箱，再获取验证码；完成后将使用新邮箱登录和找回密码。'}
                  </p>
                )}
              </div>
            </form>
          )}
          {error && (
            <p className="profile-error" role="alert">
              {error}
            </p>
          )}
          {(!flow || old) && (
            <p className="email-change-manual">
              原邮箱无法使用？
              <button data-profile-button type="button" onClick={() => setManual(true)}>
                向管理员申请
              </button>
            </p>
          )}
          {manual && (
            <ReportModal
              targetType="FEEDBACK"
              title="邮箱换绑申请"
              onClose={() => setManual(false)}
            />
          )}
        </>
      )}
    </ProfileDialog>
  )
}
