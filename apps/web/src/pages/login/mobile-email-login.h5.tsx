import Taro from '@tarojs/taro'
import { useEffect, useRef, useState } from 'react'
import brandMark from '../../assets/home-visual/brand-mark.png'
import { AuthRecoveryDialog } from '../../components/auth-recovery/index.h5'
import { EmailCodeField } from '../../components/email-code/index.h5'
import { emailAuth } from '../../features/product/email-auth.repository.h5'
import { productRepository } from '../../features/product/product.repository'
import { readSession } from '../../features/product/session'
import type { RegisterInput } from '../../features/product/product.types'
import type { GuestEntryPolicy } from '../../../../../packages/contracts/src/product-config'
import './mobile-email-login.h5.scss'

const empty: RegisterInput & { emailCode: string; confirmPassword: string } = {
  username: '',
  displayName: '',
  realName: '',
  studentId: '',
  email: '',
  emailCode: '',
  password: '',
  confirmPassword: '',
}
export default function MobileEmailLogin({
  guestPolicy,
  onGuestEntry,
}: {
  allowGuest?: boolean
  guestPolicy?: GuestEntryPolicy
  onGuestEntry?: () => Promise<void>
}) {
  const [screen, setScreen] = useState<'login' | 'register'>('login')
  const [method, setMethod] = useState<'password' | 'email'>('password')
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [registration, setRegistration] = useState(empty)
  const [busy, setBusy] = useState(false)
  const busyRef = useRef(false)
  const [error, setError] = useState('')
  const [recovery, setRecovery] = useState(false)
  useEffect(() => {
    if (readSession()) void Taro.reLaunch({ url: '/pages/index/index' })
  }, [])
  async function submit() {
    if (busyRef.current) return
    if (screen === 'register' && registration.password !== registration.confirmPassword) {
      setError('两次输入的密码不一致')
      return
    }
    busyRef.current = true
    setBusy(true)
    setError('')
    try {
      if (screen === 'register') {
        const { confirmPassword: _confirmation, ...input } = registration
        await productRepository.register(input)
      } else if (method === 'email') await emailAuth.login(email, code)
      else await productRepository.login(identifier, password)
      await Taro.reLaunch({ url: '/pages/index/index' })
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : '请求失败，请重试')
    } finally {
      busyRef.current = false
      setBusy(false)
    }
  }
  const update = (key: keyof typeof empty, value: string) =>
    setRegistration((old) => ({
      ...old,
      [key]: value,
      ...(key === 'email' ? { emailCode: '' } : {}),
    }))
  return (
    <main className="mobile-email-login">
      <header>
        <img src={brandMark} alt="" />
        <h1>晓球</h1>
        <p>记录校园足球的每一刻</p>
      </header>
      <div className="mobile-email-login__tabs" role="group" aria-label="账号操作">
        {(['login', 'register'] as const).map((item) => (
          <button
            data-mobile-button=""
            type="button"
            key={item}
            aria-pressed={screen === item}
            onClick={() => {
              setScreen(item)
              setError('')
            }}
          >
            {item === 'login' ? '登录' : '注册'}
          </button>
        ))}
      </div>
      <h2>{screen === 'register' ? '创建实名账号' : '欢迎回来'}</h2>
      <form
        onSubmit={(event) => {
          event.preventDefault()
          void submit()
        }}
      >
        {screen === 'login' ? (
          <>
            <div className="mobile-email-login__tabs" role="group" aria-label="登录方式">
              <button
                data-mobile-button=""
                type="button"
                aria-pressed={method === 'password'}
                onClick={() => setMethod('password')}
              >
                账号密码
              </button>
              <button
                data-mobile-button=""
                type="button"
                aria-pressed={method === 'email'}
                onClick={() => setMethod('email')}
              >
                邮箱验证码
              </button>
            </div>
            {method === 'password' ? (
              <>
                <label data-mobile-field="">
                  账号
                  <input
                    data-mobile-input=""
                    autoComplete="username"
                    value={identifier}
                    required
                    onChange={(event) => setIdentifier(event.target.value)}
                  />
                </label>
                <label data-mobile-field="">
                  密码
                  <input
                    data-mobile-input=""
                    type="password"
                    autoComplete="current-password"
                    value={password}
                    required
                    onChange={(event) => setPassword(event.target.value)}
                  />
                </label>
              </>
            ) : (
              <>
                <label data-mobile-field="">
                  绑定邮箱
                  <input
                    data-mobile-input=""
                    type="email"
                    autoComplete="email"
                    value={email}
                    required
                    maxLength={254}
                    onChange={(event) => {
                      setEmail(event.target.value)
                      setCode('')
                    }}
                  />
                </label>
                <EmailCodeField email={email} purpose="LOGIN" value={code} onChange={setCode} />
              </>
            )}
            <button data-mobile-button="" type="button" onClick={() => setRecovery(true)}>
              忘记密码
            </button>
          </>
        ) : (
          <>
            <p>公开页面显示昵称，实名与学号仅供本人和授权管理员使用。</p>
            {(
              [
                ['username', '用户名', 'text', 'username'],
                ['displayName', '公开昵称', 'text', 'nickname'],
                ['realName', '真实姓名', 'text', 'name'],
                ['studentId', '学号（10位数字）', 'text', 'off'],
                ['email', '绑定邮箱', 'email', 'email'],
              ] as const
            ).map(([key, label, type, autoComplete]) => (
              <label data-mobile-field="" key={key}>
                {label}
                <input
                  data-mobile-input=""
                  type={type}
                  autoComplete={autoComplete}
                  required
                  maxLength={key === 'email' ? 254 : key === 'studentId' ? 10 : 120}
                  value={registration[key]}
                  onChange={(event) => update(key, event.target.value)}
                />
              </label>
            ))}
            <EmailCodeField
              email={registration.email}
              purpose="REGISTER"
              value={registration.emailCode}
              onChange={(value) => update('emailCode', value)}
            />
            <label data-mobile-field="">
              密码（至少8位）
              <input
                data-mobile-input=""
                type="password"
                autoComplete="new-password"
                minLength={8}
                maxLength={128}
                required
                value={registration.password}
                onChange={(event) => update('password', event.target.value)}
              />
            </label>
            <label data-mobile-field="">
              确认密码
              <input
                data-mobile-input=""
                type="password"
                autoComplete="new-password"
                minLength={8}
                maxLength={128}
                required
                value={registration.confirmPassword}
                onChange={(event) => update('confirmPassword', event.target.value)}
              />
            </label>
          </>
        )}
        {error && (
          <p role="alert" className="mobile-email-login__error">
            {error}
          </p>
        )}
        <button
          data-mobile-button=""
          className="mobile-email-login__primary"
          type="submit"
          disabled={
            busy ||
            (screen === 'register'
              ? registration.emailCode.length !== 6
              : method === 'email' && code.length !== 6)
          }
        >
          {busy ? '提交中…' : screen === 'register' ? '注册并进入' : '登录'}
        </button>
      </form>
      {guestPolicy?.visible && onGuestEntry && (
        <button data-mobile-button="" type="button" onClick={() => void onGuestEntry()}>
          以游客身份浏览
        </button>
      )}
      {recovery && <AuthRecoveryDialog onClose={() => setRecovery(false)} />}
    </main>
  )
}
