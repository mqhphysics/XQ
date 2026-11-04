import { useEffect, useRef, useState } from 'react'
import { useOverlayFocus } from '../overlay-focus/index.h5'
import { EmailCodeField } from '../email-code/index.h5'
import { emailAuth } from '../../features/product/email-auth.repository.h5'

import './index.h5.scss'

type Attachment = { id: string; name: string; url: string }
const MAX_IMAGE_BYTES = 5 * 1024 * 1024

export function AuthRecoveryDialog({ onClose }: { onClose: () => void }) {
  const [method, setMethod] = useState<'email' | 'wechat' | 'manual'>('email')
  const [email, setEmail] = useState('')
  const [emailCode, setEmailCode] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [resetting, setResetting] = useState(false)
  const [resetSuccess, setResetSuccess] = useState(false)
  const resetBusy = useRef(false)
  const [name, setName] = useState('')
  const [studentId, setStudentId] = useState('')
  const [contact, setContact] = useState('')
  const [registeredAt, setRegisteredAt] = useState('')
  const [description, setDescription] = useState('')
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [error, setError] = useState('')
  const [review, setReview] = useState(false)
  const ownedUrls = useRef(new Set<string>())
  const heading = useRef<HTMLHeadingElement>(null)
  useOverlayFocus(true, '.auth-recovery__dialog', onClose)
  useEffect(() => {
    const urls = ownedUrls.current
    return () => {
      urls.forEach((url) => URL.revokeObjectURL(url))
      urls.clear()
    }
  }, [])

  function changeMethod(next: typeof method) {
    setMethod(next)
    setReview(false)
    setError('')
  }
  function addImages(files: FileList | null) {
    if (!files) return
    const selected = Array.from(files)
    if (attachments.length + selected.length > 2) {
      setError('最多选择2张照片。')
      return
    }
    if (
      selected.some(
        (file) =>
          !['image/jpeg', 'image/png', 'image/webp'].includes(file.type) ||
          file.size > MAX_IMAGE_BYTES,
      )
    ) {
      setError('请选择JPG、PNG或WebP照片，每张不超过5MB。')
      return
    }
    const added = selected.map((file) => {
      const url = URL.createObjectURL(file)
      ownedUrls.current.add(url)
      return { id: crypto.randomUUID(), name: file.name, url }
    })
    setAttachments([...attachments, ...added])
    setError('')
  }
  function removeImage(image: Attachment) {
    URL.revokeObjectURL(image.url)
    ownedUrls.current.delete(image.url)
    setAttachments(attachments.filter((item) => item.id !== image.id))
  }
  function confirmApplication() {
    if (name.trim().length < 2 || !/^\d{10}$/.test(studentId.trim())) {
      setError('请填写真实姓名和10位学号。')
      return
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact.trim())) {
      setError('请填写可联系的邮箱，用于接收核验结果。')
      return
    }
    if (!attachments.length && description.trim().length < 10) {
      setError('请上传证件照片，或至少用10个字说明注册、使用及遇到的问题。')
      return
    }
    setError('')
    setReview(true)
    window.requestAnimationFrame(() => heading.current?.focus())
  }

  return (
    <div
      className="auth-recovery__backdrop"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <section
        className="auth-recovery__dialog xq-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="recovery-title"
        aria-describedby="recovery-subtitle"
        tabIndex={-1}
      >
        <header className="auth-recovery__header xq-dialog__header">
          <div>
            <p className="auth-recovery__eyebrow">晓球 · 账号帮助</p>
            <h2 id="recovery-title" ref={heading} tabIndex={-1}>
              {method === 'manual' ? (review ? '确认核验资料' : '申请人工核验') : '找回你的账号'}
            </h2>
            <p id="recovery-subtitle">
              {method === 'manual'
                ? '核验通过后，再获取密码重置指引。'
                : '选择一种方式，验证身份后重新设置密码。'}
            </p>
          </div>
          <button
            className="auth-recovery__close"
            type="button"
            aria-label="关闭找回密码"
            onClick={onClose}
          >
            ×
          </button>
        </header>
        <div className="xq-dialog__body">
          {method !== 'manual' ? (
            <>
              <div className="auth-recovery__methods" role="group" aria-label="找回方式">
                <button
                  type="button"
                  className={method === 'email' ? 'is-active' : ''}
                  aria-pressed={method === 'email'}
                  onClick={() => changeMethod('email')}
                >
                  绑定邮箱
                </button>
                <button
                  type="button"
                  className={method === 'wechat' ? 'is-active' : ''}
                  aria-pressed={method === 'wechat'}
                  onClick={() => changeMethod('wechat')}
                >
                  微信找回
                </button>
              </div>
              {method === 'email' ? (
                <div className="auth-recovery__body">
                  <p className="auth-recovery__intro">
                    使用已验证的绑定邮箱接收验证码，再设置新密码。旧账号需先登录验证邮箱。
                  </p>
                  <label className="auth-recovery__field" htmlFor="recovery-email">
                    绑定邮箱
                    <input
                      className="auth-recovery__input"
                      id="recovery-email"
                      type="email"
                      autoComplete="email"
                      placeholder="name@example.com"
                      value={email}
                      onChange={(event) => {
                        setEmail(event.currentTarget.value)
                        setEmailCode('')
                        setResetSuccess(false)
                      }}
                    />
                  </label>
                  {resetSuccess ? (
                    <p role="status">密码已重置，旧登录已失效。请关闭窗口，用新密码登录。</p>
                  ) : (
                    <>
                      <EmailCodeField
                        email={email}
                        purpose="RESET_PASSWORD"
                        value={emailCode}
                        onChange={setEmailCode}
                      />
                      <label className="auth-recovery__field" htmlFor="recovery-new-password">
                        新密码（至少8位）
                        <input
                          className="auth-recovery__input"
                          id="recovery-new-password"
                          type="password"
                          autoComplete="new-password"
                          maxLength={128}
                          value={newPassword}
                          onChange={(event) => setNewPassword(event.target.value)}
                        />
                      </label>
                      <label className="auth-recovery__field" htmlFor="recovery-confirm-password">
                        确认新密码
                        <input
                          className="auth-recovery__input"
                          id="recovery-confirm-password"
                          type="password"
                          autoComplete="new-password"
                          maxLength={128}
                          value={confirmPassword}
                          onChange={(event) => setConfirmPassword(event.target.value)}
                        />
                      </label>
                      {error && (
                        <p className="auth-recovery__error" role="alert">
                          {error}
                        </p>
                      )}
                      <button
                        className="auth-recovery__primary"
                        type="button"
                        disabled={
                          resetting ||
                          emailCode.length !== 6 ||
                          newPassword.length < 8 ||
                          !confirmPassword
                        }
                        onClick={() => {
                          if (resetBusy.current) return
                          if (newPassword !== confirmPassword) {
                            setError('两次输入的密码不一致')
                            return
                          }
                          resetBusy.current = true
                          setResetting(true)
                          setError('')
                          void emailAuth
                            .resetPassword(email, emailCode, newPassword)
                            .then(() => {
                              setResetSuccess(true)
                              setNewPassword('')
                              setConfirmPassword('')
                              setEmailCode('')
                            })
                            .catch((issue: unknown) =>
                              setError(issue instanceof Error ? issue.message : '密码重置失败'),
                            )
                            .finally(() => {
                              resetBusy.current = false
                              setResetting(false)
                            })
                        }}
                      >
                        {resetting ? '重置中…' : '验证并重置密码'}
                      </button>
                    </>
                  )}
                </div>
              ) : (
                <div className="auth-recovery__body auth-recovery__wechat">
                  <p className="auth-recovery__intro">使用已绑定账号的微信，扫码验证身份。</p>
                  <div className="auth-recovery__qr">
                    <PlaceholderQr />
                    <span>示意码</span>
                  </div>
                  <p className="auth-recovery__qr-caption">二维码占位 · 暂不可扫码</p>
                  <p className="auth-recovery__notice">微信找回将在小程序账号绑定完成后开放。</p>
                </div>
              )}
              <footer className="auth-recovery__footer">
                <span>没有绑定，或暂时无法使用？</span>
                <button type="button" onClick={() => changeMethod('manual')}>
                  申请人工核验 <span aria-hidden="true">→</span>
                </button>
              </footer>
            </>
          ) : (
            <>
              <button
                className="auth-recovery__back"
                type="button"
                onClick={() => (review ? setReview(false) : changeMethod('email'))}
              >
                {review ? '← 返回修改资料' : '← 选择其它找回方式'}
              </button>
              {review ? (
                <div className="auth-recovery__body">
                  <p className="auth-recovery__status">待提交 · 人工核验即将开放</p>
                  <dl className="auth-recovery__summary">
                    <div>
                      <dt>姓名 / 学号</dt>
                      <dd>
                        {name} / {studentId}
                      </dd>
                    </div>
                    <div>
                      <dt>联系邮箱</dt>
                      <dd>{contact}</dd>
                    </div>
                    <div>
                      <dt>大致注册时间</dt>
                      <dd>{registeredAt.trim() || '未填写'}</dd>
                    </div>
                    <div>
                      <dt>情况说明</dt>
                      <dd>{description.trim() || '已提供证件照片'}</dd>
                    </div>
                    <div>
                      <dt>核验照片</dt>
                      <dd>
                        {attachments.length
                          ? `已选择${attachments.length}张，仅在当前窗口预览`
                          : '未选择'}
                      </dd>
                    </div>
                  </dl>
                  <p className="auth-recovery__notice">
                    申请入口开放后，资料将交由管理员核验；通过后通过联系邮箱发送重置指引。当前资料尚未提交，关闭窗口后清除。
                  </p>
                  <button className="auth-recovery__primary" type="button" disabled>
                    提交核验申请 · 即将开放
                  </button>
                </div>
              ) : (
                <form
                  className="auth-recovery__body"
                  noValidate
                  onSubmit={(event) => {
                    event.preventDefault()
                    confirmApplication()
                  }}
                >
                  <div className="auth-recovery__grid">
                    <label className="auth-recovery__field" htmlFor="recovery-name">
                      真实姓名
                      <input
                        className="auth-recovery__input"
                        id="recovery-name"
                        autoComplete="name"
                        value={name}
                        maxLength={80}
                        onChange={(event) => setName(event.currentTarget.value)}
                      />
                    </label>
                    <label className="auth-recovery__field" htmlFor="recovery-student">
                      学号
                      <input
                        className="auth-recovery__input"
                        id="recovery-student"
                        inputMode="numeric"
                        maxLength={10}
                        value={studentId}
                        onChange={(event) => setStudentId(event.currentTarget.value)}
                      />
                    </label>
                    <label className="auth-recovery__field" htmlFor="recovery-contact">
                      可联系邮箱
                      <input
                        className="auth-recovery__input"
                        id="recovery-contact"
                        type="email"
                        autoComplete="email"
                        value={contact}
                        maxLength={140}
                        onChange={(event) => setContact(event.currentTarget.value)}
                      />
                    </label>
                    <label className="auth-recovery__field" htmlFor="recovery-date">
                      大致注册时间 <small>选填</small>
                      <input
                        className="auth-recovery__input"
                        id="recovery-date"
                        value={registeredAt}
                        maxLength={100}
                        placeholder="例如：2026年9月中旬"
                        onChange={(event) => setRegisteredAt(event.currentTarget.value)}
                      />
                    </label>
                  </div>
                  <p className="auth-recovery__hint">联系邮箱可以与原绑定邮箱不同。</p>
                  <label className="auth-recovery__field" htmlFor="recovery-description">
                    注册、使用情况与遇到的问题
                    <textarea
                      className="auth-recovery__textarea"
                      id="recovery-description"
                      rows={3}
                      value={description}
                      maxLength={2000}
                      placeholder="大致何时注册、在哪些设备用过、这次为什么无法登录……"
                      onChange={(event) => setDescription(event.currentTarget.value)}
                    />
                  </label>
                  <div className="auth-recovery__evidence">
                    <div className="auth-recovery__evidence-title">
                      学生卡 / 学生证照片 <small>选填，最多2张，每张5MB</small>
                    </div>
                    <label className="auth-recovery__upload" htmlFor="recovery-evidence">
                      选择照片
                      <input
                        className="auth-recovery__input"
                        id="recovery-evidence"
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        multiple
                        disabled={attachments.length >= 2}
                        onChange={(event) => {
                          addImages(event.currentTarget.files)
                          event.currentTarget.value = ''
                        }}
                      />
                    </label>
                    {attachments.length > 0 && (
                      <div className="auth-recovery__previews">
                        {attachments.map((image) => (
                          <figure key={image.id}>
                            <img
                              className="auth-recovery__image"
                              src={image.url}
                              alt={`核验照片：${image.name}`}
                            />
                            <figcaption>{image.name}</figcaption>
                            <button
                              type="button"
                              aria-label={`移除${image.name}`}
                              onClick={() => removeImage(image)}
                            >
                              移除
                            </button>
                          </figure>
                        ))}
                      </div>
                    )}
                  </div>
                  <p className="auth-recovery__hint">
                    照片或详细说明提供一项即可。只有核验通过，才能重置密码。
                  </p>
                  {error && (
                    <p className="auth-recovery__error" role="alert">
                      {error}
                    </p>
                  )}
                  <button className="auth-recovery__primary" type="submit">
                    下一步：确认核验资料
                  </button>
                </form>
              )}
            </>
          )}
        </div>
      </section>
    </div>
  )
}

// Deliberately illustrative, with no URL or usable recovery token.
function PlaceholderQr() {
  const marks = []
  for (let y = 0; y < 25; y++) {
    for (let x = 0; x < 25; x++) {
      const inFinder = (x < 8 && y < 8) || (x > 16 && y < 8) || (x < 8 && y > 16)
      if (!inFinder && (x * 17 + y * 11 + x * y) % 7 < 3)
        marks.push(<rect key={`${x}-${y}`} x={x} y={y} width="1" height="1" />)
    }
  }
  return (
    <svg
      viewBox="-2 -2 29 29"
      role="img"
      aria-label="微信找回示意二维码，暂不可扫码"
      fill="currentColor"
    >
      {marks}
      {[
        [0, 0],
        [18, 0],
        [0, 18],
      ].map(([x, y]) => (
        <g key={`${x}-${y}`} transform={`translate(${x} ${y})`}>
          <path d="M0 0h7v7H0Zm1 1v5h5V1Z" fillRule="evenodd" />
          <rect x="2" y="2" width="3" height="3" />
        </g>
      ))}
    </svg>
  )
}
