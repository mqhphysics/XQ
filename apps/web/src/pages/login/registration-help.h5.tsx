import { useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useOverlayFocus } from '../../components/overlay-focus'
import { studentRegistration } from '../../features/product/registration.repository.h5'
import { validRegistrationEmail, type StudentRegistrationForm } from './student-registration.h5'
import './registration-help.h5.scss'

export function RegistrationHelp({
  form,
  onClose,
  onGuest,
}: {
  form: StudentRegistrationForm
  onClose: () => void
  onGuest: () => Promise<void>
}) {
  const [details, setDetails] = useState(''),
    [email, setEmail] = useState(validRegistrationEmail(form.email) ? form.email : ''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [success, setSuccess] = useState(false)
  const key = useRef(crypto.randomUUID()),
    locked = useRef(false)
  useOverlayFocus(true, '.registration-help', onClose)
  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (locked.current) return
    if (details.trim().length < 2) {
      setError('请简单描述遇到的问题。')
      return
    }
    if (email.trim() && !validRegistrationEmail(email)) {
      setError('联系邮箱格式不正确，也可以留空。')
      return
    }
    locked.current = true
    setBusy(true)
    setError('')
    try {
      await studentRegistration.feedback({
        clientRequestId: key.current,
        ...(form.realName.trim() ? { realName: form.realName.trim() } : {}),
        ...(form.studentId.trim() ? { studentNumber: form.studentId.trim() } : {}),
        ...(email.trim() ? { contactEmail: email.trim() } : {}),
        details: details.trim(),
      })
      setSuccess(true)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '反馈未提交，请稍后重试。')
    } finally {
      locked.current = false
      setBusy(false)
    }
  }
  return createPortal(
    <div
      className="registration-help-scrim"
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onClose()
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="registration-help-title"
        className="registration-help"
        tabIndex={-1}
      >
        <header className="registration-help__header">
          <h2 id="registration-help-title" className="registration-help__title">
            注册问题反馈
          </h2>
          <button
            type="button"
            className="registration-help__close"
            aria-label="关闭注册反馈"
            disabled={busy}
            onClick={onClose}
          >
            <svg
              className="registration-help__close-icon"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <path d="m6 6 12 12M18 6 6 18" />
            </svg>
          </button>
        </header>
        {success ? (
          <div className="registration-help__success">
            <h3>反馈已提交给管理员</h3>
            <p>可以先以游客身份浏览，之后再尝试注册。</p>
            <button
              type="button"
              className="art-login__control art-login__primary"
              onClick={() => void onGuest()}
            >
              以游客身份进入
            </button>
          </div>
        ) : (
          <form className="registration-help__form" onSubmit={(e) => void submit(e)} noValidate>
            <p className="registration-help__context">
              {form.realName.trim() || '姓名未填写'}
              {form.studentId.trim() ? ` · ${form.studentId.trim()}` : ''}
            </p>
            <label className="registration-help__label" htmlFor="registration-help-details">
              遇到了什么问题 <span aria-hidden="true">*</span>
            </label>
            <textarea
              id="registration-help-details"
              className="registration-help__input registration-help__description"
              rows={4}
              maxLength={1000}
              value={details}
              required
              onChange={(e) => {
                setDetails(e.target.value)
                key.current = crypto.randomUUID()
              }}
              placeholder="例如：姓名在名单里，但提示无法匹配"
            />
            <label className="registration-help__label" htmlFor="registration-help-email">
              联系邮箱（选填）
            </label>
            <input
              id="registration-help-email"
              className="registration-help__input"
              type="email"
              value={email}
              maxLength={254}
              onChange={(e) => {
                setEmail(e.target.value)
                key.current = crypto.randomUUID()
              }}
            />
            {error && (
              <p role="alert" className="art-login__error">
                {error}
              </p>
            )}
            <button type="submit" className="art-login__control art-login__primary" disabled={busy}>
              {busy ? '提交中…' : '提交反馈'}
            </button>
          </form>
        )}
      </section>
    </div>,
    document.body,
  )
}
