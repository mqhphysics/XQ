import Taro, { getCurrentInstance } from '@tarojs/taro'
import { useEffect, useState, type HTMLInputTypeAttribute } from 'react'

import sceneSource from '../../assets/login-art/stadium-particle-plate.png'
import brandMark from '../../assets/home-visual/brand-mark.png'
import { AuthRecoveryDialog } from '../../components/auth-recovery/index.h5'
import { AuthScene } from '../../components/auth-scene/index.h5'
import { EmailCodeField } from '../../components/email-code/index.h5'
import { emailAuth } from '../../features/product/email-auth.repository.h5'
import { productRepository } from '../../features/product/product.repository'
import { readSession } from '../../features/product/session'
import {
  studentRegistration,
  type RegistrationCheck,
} from '../../features/product/registration.repository.h5'
import {
  emptyStudentRegistration,
  studentRegistrationErrors,
  type StudentRegistrationForm,
} from './student-registration.h5'
import { RegistrationHelp } from './registration-help.h5'
import { CLOSED_GUEST_POLICY } from '../../features/product-config/product-config.logic'
import { dispatchGuestEntry } from '../../features/product-config/guest-entry.logic'
import { useProductConfiguration } from '../../features/product-config/use-product-config.h5'
import ExistingLoginPage from './mobile-email-login.h5'
import { prefetchAppData } from '../../components/public-shell/prefetch-tabs'

import './index.h5.scss'

const minimumLoginPasswordLength = process.env.TARO_APP_LOCAL_SHORT_PASSWORDS === '1' ? 1 : 6

export default function H5LoginPage() {
  const { configuration } = useProductConfiguration()
  const guestPolicy = configuration?.guest ?? CLOSED_GUEST_POLICY
  const onGuestEntry = async () => {
    await dispatchGuestEntry(
      guestPolicy,
      (options) => Taro.reLaunch(options),
      (title) => Taro.showToast({ title, icon: 'none', duration: 2200 }),
    )
  }
  const [desktop, setDesktop] = useState(() => window.matchMedia('(min-width: 1024px)').matches)
  // Schedule / standings / teams start loading while the visitor is still signing in.
  useEffect(() => prefetchAppData(), [])
  useEffect(() => {
    const query = window.matchMedia('(min-width: 1024px)')
    const update = () => setDesktop(query.matches)
    query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [])
  return desktop ? (
    <ArtLoginPage guestPolicy={guestPolicy} onGuestEntry={onGuestEntry} />
  ) : (
    <ExistingLoginPage allowGuest={false} guestPolicy={guestPolicy} onGuestEntry={onGuestEntry} />
  )
}

function ArtLoginPage({
  guestPolicy,
  onGuestEntry,
}: {
  guestPolicy: typeof CLOSED_GUEST_POLICY
  onGuestEntry: () => Promise<void>
}) {
  const [screen, setScreen] = useState<'login' | 'register'>('login')
  const [method, setMethod] = useState<'password' | 'email'>('password')
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [registration, setRegistration] = useState(emptyStudentRegistration)
  const [touched, setTouched] = useState<Partial<Record<keyof StudentRegistrationForm, boolean>>>(
    {},
  )
  const [attempted, setAttempted] = useState(false),
    [codeError, setCodeError] = useState(''),
    [registrationHelp, setRegistrationHelp] = useState(false)
  const [check, setCheck] = useState<{
    key: string
    phase: 'checking' | 'ready' | 'failed'
    result?: RegistrationCheck
    message?: string
  } | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [failureMessage, setFailureMessage] = useState('')
  const [recovery, setRecovery] = useState(false)
  const validation = studentRegistrationErrors(registration)
  const registrationKey =
    registration.realName.normalize('NFKC').trim() + '|' + registration.studentId.trim()
  const currentCheck = check?.key === registrationKey ? check : null
  const fieldError = (key: keyof StudentRegistrationForm) =>
    attempted || touched[key] ? validation[key] : undefined

  useEffect(() => {
    if (
      screen !== 'register' ||
      registration.realName.trim().length < 2 ||
      !/^20\d{8}$/.test(registration.studentId.trim())
    ) {
      setCheck(null)
      return
    }
    let active = true
    const key = registrationKey
    setCheck({ key, phase: 'checking' })
    const timer = window.setTimeout(() => {
      void studentRegistration
        .check(registration.realName, registration.studentId.trim())
        .then((result) => {
          if (active) setCheck({ key, phase: 'ready', result })
        })
        .catch((error) => {
          if (active)
            setCheck({
              key,
              phase: 'failed',
              message: error instanceof Error ? error.message : '暂时无法匹配名单，请稍后重试。',
            })
        })
    }, 350)
    return () => {
      active = false
      window.clearTimeout(timer)
    }
  }, [screen, registration.realName, registration.studentId, registrationKey])

  useEffect(() => {
    const preview = getCurrentInstance().router?.params.preview === 'art'
    if (readSession() && !preview) void Taro.reLaunch({ url: '/pages/index/index' })
  }, [])

  const login = async () => {
    if (!identifier.trim() || password.length < minimumLoginPasswordLength || submitting) return
    setSubmitting(true)
    setFailureMessage('')
    try {
      await productRepository.login(identifier, password)
      await Taro.reLaunch({ url: '/pages/index/index' })
    } catch (error) {
      setFailureMessage(error instanceof Error ? error.message : '登录失败，请重试。')
      await showError(error, '登录失败')
    } finally {
      setSubmitting(false)
    }
  }
  const register = async () => {
    if (submitting) return
    setAttempted(true)
    if (Object.keys(validation).length) return
    setSubmitting(true)
    setFailureMessage('')
    try {
      const result = await studentRegistration.check(
        registration.realName,
        registration.studentId.trim(),
      )
      setCheck({ key: registrationKey, phase: 'ready', result })
      if (!result.eligible) return
      await studentRegistration.register({
        realName: registration.realName.trim(),
        studentId: registration.studentId.trim(),
        password: registration.password,
        ...(registration.email.trim()
          ? { email: registration.email.trim(), emailCode: registration.emailCode }
          : {}),
      })
      await Taro.reLaunch({ url: '/pages/index/index' })
    } catch (error) {
      const message = error instanceof Error ? error.message : '注册失败，请重试。'
      if (/验证码/.test(message)) setCodeError(message)
      else setFailureMessage(message)
    } finally {
      setSubmitting(false)
    }
  }
  const loginWithEmail = async () => {
    if (submitting || code.length !== 6) return
    setSubmitting(true)
    setFailureMessage('')
    try {
      await emailAuth.login(email, code)
      await Taro.reLaunch({ url: '/pages/index/index' })
    } catch (error) {
      setFailureMessage(error instanceof Error ? error.message : '邮箱登录失败')
    } finally {
      setSubmitting(false)
    }
  }
  const updateRegistration = (key: keyof StudentRegistrationForm, value: string) => {
    setRegistration((previous) => ({ ...previous, [key]: value }))
    setFailureMessage('')
    if (key === 'email' || key === 'emailCode') setCodeError('')
  }
  const blur = (key: keyof StudentRegistrationForm) => () =>
    setTouched((previous) => ({ ...previous, [key]: true }))

  return (
    <main className={`art-login ${screen === 'register' ? 'art-login--register' : ''}`}>
      <section className="art-login__left" aria-label="晓球校园足球">
        <div className="art-login__brand">
          <img className="art-login__brand-mark" src={brandMark} alt="" draggable={false} />
          <div>
            <div className="art-login__brand-name">晓球</div>
            <div className="art-login__brand-caption">记录校园足球的每一刻</div>
          </div>
        </div>
        <AuthScene source={sceneSource} />
        <div className="art-login__handwriting art-login__handwriting--top" aria-hidden="true">
          Football
          <br />
          Connects
          <br />
          Us
        </div>
        <div className="art-login__story">
          <h1 className="art-login__story-title">每一场校园比赛，都值得被认真记录</h1>
          <p className="art-login__story-copy">
            赛程、数据、球队与同学们的现场声音，在这里汇成完整赛季。
          </p>
          <div className="art-login__signature">
            体育连接彼此<span>·</span>FOOTBALL CONNECTS US
          </div>
        </div>
        <div className="art-login__handwriting art-login__handwriting--bottom" aria-hidden="true">
          在绿茵场上
          <br />
          遇见更好的我们
        </div>
      </section>

      <section className="art-login__panel" aria-label="账号入口">
        <div className="art-login__values" aria-hidden="true">
          热爱<span>·</span>友谊<span>·</span>成长
        </div>
        <div className="art-login__form-content">
          <div className="art-login__tabs" role="group" aria-label="账号操作">
            <button
              type="button"
              aria-pressed={screen === 'login'}
              className={`art-login__control art-login__tab ${screen === 'login' ? 'is-active' : ''}`}
              onClick={() => setScreen('login')}
            >
              登录
            </button>
            <button
              type="button"
              aria-pressed={screen === 'register'}
              className={`art-login__control art-login__tab ${screen === 'register' ? 'is-active' : ''}`}
              onClick={() => setScreen('register')}
            >
              注册
            </button>
          </div>
          <div className="art-login__form-heading">
            <h2 className="art-login__form-title">
              {screen === 'login' ? '欢迎回来' : '创建账号'}
            </h2>
            {screen === 'login' && (
              <p className="art-login__form-subtitle">登录后继续关注你的球队与比赛。</p>
            )}
          </div>

          {failureMessage ? (
            <p className="art-login__error" role="alert">
              {failureMessage}
            </p>
          ) : null}

          {screen === 'login' ? (
            <>
              <div className="art-login__methods" role="group" aria-label="登录方式">
                <button
                  type="button"
                  aria-pressed={method === 'password'}
                  className={`art-login__control art-login__method ${method === 'password' ? 'is-active' : ''}`}
                  onClick={() => setMethod('password')}
                >
                  账号密码
                </button>
                <button
                  type="button"
                  aria-pressed={method === 'email'}
                  className={`art-login__control art-login__method ${method === 'email' ? 'is-active' : ''}`}
                  onClick={() => setMethod('email')}
                >
                  邮箱验证码
                </button>
              </div>
              {method === 'password' ? (
                <form
                  className="art-login__form"
                  noValidate
                  onSubmit={(event) => {
                    event.preventDefault()
                    void login()
                  }}
                >
                  <Field
                    id="art-identifier"
                    label="用户名 / 昵称 / 姓名 / 学号"
                    value={identifier}
                    onChange={setIdentifier}
                    placeholder="请输入账号信息"
                    autoComplete="username"
                    icon="user"
                  />
                  <Field
                    id="art-password"
                    label="密码"
                    value={password}
                    onChange={setPassword}
                    placeholder="请输入密码"
                    autoComplete="current-password"
                    password
                  />
                  <button
                    type="button"
                    className="art-login__control art-login__forgot"
                    onClick={() => setRecovery(true)}
                  >
                    忘记密码
                  </button>
                  <button
                    type="submit"
                    className="art-login__control art-login__primary"
                    disabled={
                      !identifier.trim() ||
                      password.length < minimumLoginPasswordLength ||
                      submitting
                    }
                    aria-busy={submitting}
                  >
                    {submitting ? '登录中…' : '登录'}
                  </button>
                </form>
              ) : (
                <form
                  className="art-login__form"
                  noValidate
                  onSubmit={(event) => {
                    event.preventDefault()
                    void loginWithEmail()
                  }}
                >
                  <Field
                    id="art-email"
                    label="绑定邮箱"
                    value={email}
                    onChange={(value) => {
                      setEmail(value)
                      setCode('')
                    }}
                    placeholder="name@example.com"
                    autoComplete="email"
                    icon="user"
                  />
                  <EmailCodeField email={email} purpose="LOGIN" value={code} onChange={setCode} />
                  <button
                    type="submit"
                    className="art-login__control art-login__primary"
                    disabled={!email.trim() || code.length !== 6 || submitting}
                  >
                    邮箱登录
                  </button>
                </form>
              )}
            </>
          ) : (
            <form
              className="art-login__form"
              noValidate
              onSubmit={(event) => {
                event.preventDefault()
                void register()
              }}
            >
              <div className="art-login__register-grid">
                <Field
                  id="art-register-name"
                  label="姓名"
                  required
                  maxLength={120}
                  value={registration.realName}
                  onChange={(value) => updateRegistration('realName', value)}
                  onBlur={blur('realName')}
                  error={
                    fieldError('realName') ||
                    (currentCheck?.phase === 'ready' && !currentCheck.result?.eligible
                      ? currentCheck.result?.message
                      : currentCheck?.phase === 'failed'
                        ? currentCheck.message
                        : undefined)
                  }
                  valid={currentCheck?.phase === 'ready' && currentCheck.result?.eligible === true}
                  autoComplete="name"
                />
                <Field
                  id="art-register-student"
                  label="学号"
                  required
                  value={registration.studentId}
                  onChange={(value) => updateRegistration('studentId', value)}
                  onBlur={blur('studentId')}
                  error={fieldError('studentId')}
                  valid={currentCheck?.phase === 'ready' && currentCheck.result?.eligible === true}
                  inputMode="numeric"
                  maxLength={10}
                />
                <Field
                  id="art-register-email"
                  className="art-login__wide"
                  label="邮箱（选填）"
                  value={registration.email}
                  onChange={(value) => {
                    updateRegistration('email', value)
                    updateRegistration('emailCode', '')
                  }}
                  autoComplete="email"
                  inputType="email"
                  maxLength={254}
                  onBlur={blur('email')}
                  error={fieldError('email')}
                  valid={Boolean(registration.email.trim()) && !validation.email}
                />
                {registration.email.trim() && (
                  <div className="art-login__wide">
                    <EmailCodeField
                      email={registration.email}
                      purpose="REGISTER"
                      value={registration.emailCode}
                      onChange={(value) => updateRegistration('emailCode', value)}
                      error={codeError || (attempted ? validation.emailCode : undefined)}
                    />
                  </div>
                )}
                <Field
                  id="art-register-password"
                  className="art-login__wide"
                  label="密码"
                  required
                  value={registration.password}
                  onChange={(value) => updateRegistration('password', value)}
                  autoComplete="new-password"
                  password
                  onBlur={blur('password')}
                  error={fieldError('password')}
                  valid={Boolean(registration.password) && !validation.password}
                />
                <Field
                  id="art-register-confirm"
                  className="art-login__wide"
                  label="确认密码"
                  required
                  value={registration.confirmPassword}
                  onChange={(value) => updateRegistration('confirmPassword', value)}
                  autoComplete="new-password"
                  password
                  onBlur={blur('confirmPassword')}
                  error={
                    registration.confirmPassword
                      ? validation.confirmPassword
                      : fieldError('confirmPassword')
                  }
                  valid={Boolean(registration.confirmPassword) && !validation.confirmPassword}
                />
              </div>
              <button
                type="button"
                className="art-login__registration-help"
                disabled={submitting}
                onClick={() => setRegistrationHelp(true)}
              >
                注册遇到问题？反馈给管理员
              </button>
              <button
                type="submit"
                className="art-login__control art-login__primary"
                disabled={submitting || currentCheck?.phase === 'checking'}
                aria-busy={submitting}
              >
                {submitting ? '注册中…' : '注册并进入'}
              </button>
            </form>
          )}

          {guestPolicy.visible ? (
            <button
              type="button"
              className="art-login__control art-login__guest"
              onClick={() => void onGuestEntry()}
            >
              以游客身份浏览
            </button>
          ) : null}
          <p className="art-login__guest-hint">游客可浏览公开赛事，登录后可发布动态。</p>
        </div>
      </section>
      {recovery && <AuthRecoveryDialog onClose={() => setRecovery(false)} />}
      {registrationHelp && (
        <RegistrationHelp
          form={registration}
          onClose={() => setRegistrationHelp(false)}
          onGuest={onGuestEntry}
        />
      )}
    </main>
  )
}

function Field({
  id,
  label,
  value,
  onChange,
  placeholder,
  autoComplete,
  password = false,
  icon,
  className = '',
  required = false,
  error,
  hint,
  onBlur,
  maxLength = 140,
  inputMode,
  inputType = 'text',
  valid = false,
}: {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  autoComplete?: string
  password?: boolean
  icon?: 'user'
  className?: string
  required?: boolean
  error?: string | undefined
  hint?: string | undefined
  onBlur?: () => void
  maxLength?: number
  inputMode?: 'numeric' | 'email' | 'text'
  inputType?: HTMLInputTypeAttribute
  valid?: boolean
}) {
  const [visible, setVisible] = useState(false)
  const type: HTMLInputTypeAttribute = password && !visible ? 'password' : inputType
  return (
    <div className={`art-login__field ${valid && !error ? 'is-valid' : ''} ${className}`}>
      <label className="art-login__label" htmlFor={id}>
        {label}
        {required && (
          <span className="art-login__required" aria-hidden="true">
            {' '}
            *
          </span>
        )}
      </label>
      <div
        className={`art-login__input-wrap ${icon || password ? 'has-icon' : ''} ${password ? 'has-reveal' : ''}`}
      >
        {(icon || password) && (
          <span className="art-login__field-icon">
            <Icon kind={password ? 'lock' : 'user'} />
          </span>
        )}
        <input
          id={id}
          className="art-login__input"
          type={type}
          value={value}
          maxLength={password ? 128 : maxLength}
          inputMode={inputMode}
          required={required}
          aria-invalid={Boolean(error)}
          aria-describedby={error || hint ? `${id}-help` : undefined}
          onBlur={onBlur}
          placeholder={placeholder}
          autoComplete={autoComplete}
          onChange={(event) => onChange(event.currentTarget.value)}
        />
        {password && (
          <button
            type="button"
            className="art-login__control art-login__reveal"
            aria-label={visible ? '隐藏密码' : '显示密码'}
            aria-pressed={visible}
            onClick={() => setVisible((previous) => !previous)}
          >
            <Icon kind={visible ? 'eye' : 'eye-off'} />
          </button>
        )}
      </div>
      {(error || hint) && (
        <p
          id={`${id}-help`}
          className={'art-login__field-message' + (error ? ' is-error' : '')}
          role={error ? 'alert' : 'status'}
        >
          {error || hint}
        </p>
      )}
    </div>
  )
}

function Icon({ kind }: { kind: 'user' | 'lock' | 'eye' | 'eye-off' }) {
  return (
    <svg
      className="art-login__icon-svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {kind === 'user' && (
        <>
          <circle cx="12" cy="7" r="4" />
          <path d="M4 21v-2a8 8 0 0 1 16 0v2Z" />
        </>
      )}
      {kind === 'lock' && (
        <>
          <rect x="5" y="10" width="14" height="11" rx="1.5" />
          <path d="M8 10V7a4 4 0 0 1 8 0v3M12 15v3" />
          <circle cx="12" cy="15" r=".7" />
        </>
      )}
      {(kind === 'eye' || kind === 'eye-off') && (
        <>
          <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z" />
          <circle cx="12" cy="12" r="3" />
          {kind === 'eye-off' && <path d="m4 20 16-16" />}
        </>
      )}
    </svg>
  )
}

async function showError(error: unknown, fallback: string) {
  await Taro.showToast({
    title: error instanceof Error ? error.message : fallback,
    icon: 'none',
    duration: 2200,
  })
}
