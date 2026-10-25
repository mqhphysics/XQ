import { Button, Input, Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useEffect, useState, type ReactNode } from 'react'

import { productRepository } from '../../features/product/product.repository'
import { enterGuestMode, readSession } from '../../features/product/session'
import type { RegisterInput } from '../../features/product/product.types'
import type { GuestEntryPolicy } from '@/product-config'

import './index.scss'

type ScreenMode = 'login' | 'register'
type LoginMode = 'password' | 'email'

const emptyRegistration: RegisterInput & { confirmPassword: string } = {
  username: '',
  displayName: '',
  realName: '',
  studentId: '',
  email: '',
  password: '',
  confirmPassword: '',
}

export default function LoginPage({
  allowGuest = true,
  guestPolicy,
  onGuestEntry,
  visual,
  onScreenChange,
  onRequestRecovery,
  redirectAuthenticated = true,
  registrationForm,
  emailLoginForm,
}: {
  allowGuest?: boolean
  guestPolicy?: GuestEntryPolicy
  onGuestEntry?: () => Promise<void>
  visual?: ReactNode
  onScreenChange?: (screen: ScreenMode) => void
  onRequestRecovery?: () => void
  redirectAuthenticated?: boolean
  registrationForm?: ReactNode
  emailLoginForm?: ReactNode
}) {
  const [screenMode, setScreenMode] = useState<ScreenMode>('login')
  const [loginMode, setLoginMode] = useState<LoginMode>('password')
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [email, setEmail] = useState('')
  const [emailCode, setEmailCode] = useState('')
  const [registration, setRegistration] = useState(emptyRegistration)
  const [submitting, setSubmitting] = useState(false)
  const [failureMessage, setFailureMessage] = useState('')
  const [showRecovery, setShowRecovery] = useState(false)
  const [recoveryName, setRecoveryName] = useState('')
  const [recoveryStudentId, setRecoveryStudentId] = useState('')
  const [recoveryPassword, setRecoveryPassword] = useState('')

  useEffect(() => {
    if (redirectAuthenticated && readSession()) {
      void Taro.reLaunch({ url: '/pages/index/index' })
    }
  }, [redirectAuthenticated])

  useEffect(() => onScreenChange?.(screenMode), [onScreenChange, screenMode])

  const minimumLength =
    Taro.getEnv() === Taro.ENV_TYPE.WEAPP ||
    (Taro.getEnv() === Taro.ENV_TYPE.WEB && process.env.TARO_APP_LOCAL_SHORT_PASSWORDS === '1')
      ? 1
      : 8
  const login = async () => {
    if (!identifier.trim() || password.length < minimumLength || submitting) return
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
    if (registration.password !== registration.confirmPassword) {
      await Taro.showToast({ title: '两次输入的密码不一致', icon: 'none' })
      return
    }
    if (!canRegister(registration)) return
    setSubmitting(true)
    setFailureMessage('')
    try {
      const { confirmPassword: _confirmPassword, ...input } = registration
      await productRepository.register(input)
      await Taro.reLaunch({ url: '/pages/index/index' })
    } catch (error) {
      setFailureMessage(error instanceof Error ? error.message : '注册失败，请重试。')
      await showError(error, '注册失败')
    } finally {
      setSubmitting(false)
    }
  }

  const resetPassword = async () => {
    if (
      !recoveryName.trim() ||
      !recoveryStudentId.trim() ||
      recoveryPassword.length < 8 ||
      submitting
    ) {
      return
    }
    setSubmitting(true)
    try {
      await productRepository.resetPasswordByIdentity(
        recoveryName,
        recoveryStudentId,
        recoveryPassword,
      )
      setIdentifier(recoveryStudentId.trim())
      setPassword(recoveryPassword)
      setShowRecovery(false)
      await Taro.showToast({ title: '密码已重置', icon: 'success' })
    } catch (error) {
      await showError(error, '重置失败')
    } finally {
      setSubmitting(false)
    }
  }

  const enterAsGuest = async () => {
    if (guestPolicy) {
      if (guestPolicy.enabled && onGuestEntry) await onGuestEntry()
      else
        await Taro.showToast({
          title: guestPolicy.reason || '功能暂未开放',
          icon: 'none',
          duration: 2200,
        })
      return
    }
    enterGuestMode()
    await Taro.reLaunch({ url: '/pages/index/index' })
  }

  const showEmailPlaceholder = async () => {
    await Taro.showToast({ title: '邮箱验证码服务正在接入', icon: 'none', duration: 2200 })
  }

  return (
    <View className="auth-page">
      {visual ?? (
        <View className="auth-visual">
          <View className="auth-brand">
            <Text className="auth-brand__mark">XQ</Text>
            <Text className="auth-brand__name">晓球</Text>
          </View>
          <View className="auth-visual__copy">
            <Text className="auth-visual__eyebrow">CAMPUS FOOTBALL</Text>
            <Text className="auth-visual__title">每一场校园比赛，都值得被认真记录</Text>
            <Text className="auth-visual__body">
              赛程、数据、球队与同学们的现场声音，在这里汇成完整赛季。
            </Text>
          </View>
        </View>
      )}

      <View className="auth-panel">
        <View className="auth-panel__inner">
          <View className="auth-tabs">
            <Button
              className={'auth-tab ' + (screenMode === 'login' ? 'auth-tab--active' : '')}
              onClick={() => setScreenMode('login')}
            >
              登录
            </Button>
            <Button
              className={'auth-tab ' + (screenMode === 'register' ? 'auth-tab--active' : '')}
              onClick={() => setScreenMode('register')}
            >
              注册
            </Button>
          </View>

          {(!allowGuest || Taro.getEnv() === Taro.ENV_TYPE.WEAPP) && failureMessage ? (
            <View className="auth-account-error" role="alert">
              {failureMessage}
            </View>
          ) : null}

          {screenMode === 'login' ? (
            <View className="auth-form">
              <Text className="auth-form__title">欢迎回来</Text>
              <Text className="auth-form__subtitle">登录后继续关注你的球队与比赛。</Text>
              <View className="login-methods">
                <Button
                  className={loginMode === 'password' ? 'login-method--active' : ''}
                  onClick={() => setLoginMode('password')}
                >
                  账号密码
                </Button>
                <Button
                  className={loginMode === 'email' ? 'login-method--active' : ''}
                  onClick={() => setLoginMode('email')}
                >
                  邮箱验证码
                </Button>
              </View>

              {loginMode === 'password' ? (
                <>
                  <FieldLabel>用户名 / 昵称 / 姓名 / 学号</FieldLabel>
                  <Input
                    className="auth-input"
                    placeholder="请输入账号信息"
                    value={identifier}
                    onInput={(event) => setIdentifier(event.detail.value)}
                  />
                  <FieldLabel>密码</FieldLabel>
                  <Input
                    className="auth-input"
                    password
                    placeholder="请输入密码"
                    value={password}
                    onInput={(event) => setPassword(event.detail.value)}
                  />
                  <Button
                    className="auth-link"
                    onClick={() =>
                      onRequestRecovery ? onRequestRecovery() : setShowRecovery((value) => !value)
                    }
                  >
                    忘记密码
                  </Button>
                  <Button
                    className="auth-primary"
                    disabled={!identifier.trim() || password.length < minimumLength || submitting}
                    loading={submitting}
                    onClick={() => void login()}
                  >
                    登录
                  </Button>
                </>
              ) : emailLoginForm ? (
                emailLoginForm
              ) : (
                <>
                  <FieldLabel>绑定邮箱</FieldLabel>
                  <Input
                    className="auth-input"
                    placeholder="name@example.com"
                    value={email}
                    onInput={(event) => setEmail(event.detail.value)}
                  />
                  <FieldLabel>验证码</FieldLabel>
                  <View className="auth-code-row">
                    <Input
                      className="auth-input"
                      placeholder="6 位验证码"
                      value={emailCode}
                      onInput={(event) => setEmailCode(event.detail.value)}
                    />
                    <Button onClick={() => void showEmailPlaceholder()}>获取验证码</Button>
                  </View>
                  <Button
                    className="auth-primary"
                    disabled={!email.trim() || emailCode.length !== 6}
                    onClick={() => void showEmailPlaceholder()}
                  >
                    邮箱登录
                  </Button>
                </>
              )}

              {showRecovery && loginMode === 'password' && (
                <View className="recovery-box">
                  <View className="recovery-box__head">
                    <Text>找回密码</Text>
                    <Button onClick={() => setShowRecovery(false)}>关闭</Button>
                  </View>
                  <FieldLabel>真实姓名</FieldLabel>
                  <Input
                    className="auth-input"
                    value={recoveryName}
                    onInput={(event) => setRecoveryName(event.detail.value)}
                  />
                  <FieldLabel>学号</FieldLabel>
                  <Input
                    className="auth-input"
                    value={recoveryStudentId}
                    onInput={(event) => setRecoveryStudentId(event.detail.value)}
                  />
                  <FieldLabel>新密码</FieldLabel>
                  <Input
                    className="auth-input"
                    password
                    value={recoveryPassword}
                    onInput={(event) => setRecoveryPassword(event.detail.value)}
                  />
                  <Button
                    className="auth-secondary"
                    disabled={
                      !recoveryName.trim() ||
                      !recoveryStudentId.trim() ||
                      recoveryPassword.length < 8 ||
                      submitting
                    }
                    onClick={() => void resetPassword()}
                  >
                    重置密码
                  </Button>
                </View>
              )}
            </View>
          ) : (
            (registrationForm ?? (
              <View className="auth-form">
                <Text className="auth-form__title">创建实名账号</Text>
                <Text className="auth-form__subtitle">
                  公开页面显示昵称，实名与学号仅供本人和授权管理员使用。
                </Text>
                <View className="register-grid">
                  <FormField
                    label="用户名"
                    value={registration.username}
                    onChange={(value) => setRegistration({ ...registration, username: value })}
                  />
                  <FormField
                    label="公开昵称"
                    value={registration.displayName}
                    onChange={(value) => setRegistration({ ...registration, displayName: value })}
                  />
                  <FormField
                    label="真实姓名"
                    value={registration.realName}
                    onChange={(value) => setRegistration({ ...registration, realName: value })}
                  />
                  <FormField
                    label="学号（10位数字）"
                    value={registration.studentId}
                    onChange={(value) => setRegistration({ ...registration, studentId: value })}
                  />
                  <FormField
                    className="register-grid__wide"
                    label="绑定邮箱"
                    value={registration.email}
                    onChange={(value) => setRegistration({ ...registration, email: value })}
                  />
                  <FormField
                    label="密码"
                    password
                    value={registration.password}
                    onChange={(value) => setRegistration({ ...registration, password: value })}
                  />
                  <FormField
                    label="确认密码"
                    password
                    value={registration.confirmPassword}
                    onChange={(value) =>
                      setRegistration({ ...registration, confirmPassword: value })
                    }
                  />
                </View>
                <Button
                  className="auth-primary"
                  disabled={!canRegister(registration) || submitting}
                  loading={submitting}
                  onClick={() => void register()}
                >
                  注册并进入
                </Button>
              </View>
            ))
          )}

          {(guestPolicy ? guestPolicy.visible : allowGuest) ? (
            <View className="guest-entry">
              <Button className="guest-entry__button" onClick={() => void enterAsGuest()}>
                以游客身份浏览
              </Button>
              <Text className="guest-entry__hint">
                {guestPolicy
                  ? '登录后查看球队、赛程与比赛数据。'
                  : '无需注册，先看赛程、比分和球队'}
              </Text>
            </View>
          ) : (
            <Text className="guest-entry__hint">当前仅向已登录账号开放，请登录或注册后进入。</Text>
          )}
          <Text className="auth-version">晓球 V1.0.0</Text>
        </View>
      </View>
    </View>
  )
}

function FieldLabel({ children }: { children: string }) {
  return <Text className="auth-label">{children}</Text>
}

function FormField({
  className = '',
  label,
  password = false,
  value,
  onChange,
}: {
  className?: string
  label: string
  password?: boolean
  value: string
  onChange: (value: string) => void
}) {
  return (
    <View className={className}>
      <FieldLabel>{label}</FieldLabel>
      <Input
        className="auth-input"
        password={password}
        value={value}
        onInput={(event) => onChange(event.detail.value)}
      />
    </View>
  )
}

function canRegister(input: RegisterInput & { confirmPassword: string }): boolean {
  return Boolean(
    input.username.trim().length >= 3 &&
    input.displayName.trim().length >= 2 &&
    input.realName.trim().length >= 2 &&
    /^\d{10}$/.test(input.studentId.trim()) &&
    input.email.includes('@') &&
    input.password.length >= 8 &&
    input.confirmPassword.length >= 8,
  )
}

async function showError(error: unknown, fallback: string) {
  await Taro.showToast({
    title: error instanceof Error ? error.message : fallback,
    icon: 'none',
    duration: 2200,
  })
}
