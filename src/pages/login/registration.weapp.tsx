import { Button, Input, Text, Textarea, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useEffect, useRef, useState } from 'react'
import { ProductApiError, request } from '../../features/product/product.repository'
import {
  nativeRegistration,
  type RegistrationCheck,
} from '../../features/product/registration.repository.weapp'
import {
  startEmailCooldown,
  useEmailResendCountdown,
} from '../../components/email-code/countdown.weapp'
import { NativeDialog } from '../../components/native-ui/index.weapp'
import {
  missingRegistrationMessage,
  nativeRegistrationPayload,
  registrationErrors,
  registrationLabels,
  type NativeRegistrationValues,
} from './registration.logic'

const fields = ['realName', 'studentId', 'email', 'password', 'confirmPassword'] as const
const empty: NativeRegistrationValues = {
  realName: '',
  studentId: '',
  password: '',
  confirmPassword: '',
  email: '',
}

export function NativeRegistrationForm() {
  const [value, setValue] = useState(empty)
  const [touched, setTouched] = useState<Partial<Record<keyof NativeRegistrationValues, boolean>>>(
    {},
  )
  const [attempted, setAttempted] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [serverError, setServerError] = useState('')
  const [emailCode, setEmailCode] = useState('')
  const [sending, setSending] = useState(false)
  const [help, setHelp] = useState(false)
  const [check, setCheck] = useState<{
    key: string
    result?: RegistrationCheck
    message?: string
  } | null>(null)
  const lock = useRef(false),
    sendLock = useRef(false)
  const { remaining } = useEmailResendCountdown(value.email)
  const errors = registrationErrors(value)
  const key = `${value.realName.normalize('NFKC').trim()}|${value.studentId.trim()}`
  const currentCheck = check?.key === key ? check : null
  useEffect(() => {
    if (value.realName.trim().length < 2 || !/^\d{10}$/.test(value.studentId.trim())) return
    let active = true
    const timer = setTimeout(() => {
      setCheck({ key })
      void nativeRegistration
        .check(value.realName.trim(), value.studentId.trim())
        .then((result) => {
          if (active) setCheck({ key, result })
        })
        .catch((issue) => {
          if (active)
            setCheck({
              key,
              message: issue instanceof Error ? issue.message : '名单匹配失败，请稍后重试',
            })
        })
    }, 350)
    return () => {
      active = false
      clearTimeout(timer)
    }
  }, [key, value.realName, value.studentId])
  const sendCode = async () => {
    if (!value.email.trim() || errors.email || sendLock.current || remaining) return
    sendLock.current = true
    setSending(true)
    setServerError('')
    const address = value.email.trim()
    try {
      const reply = await request<{ message: string; retryAfterSeconds: number }>(
        '/auth/email/code',
        {
          method: 'POST',
          authenticated: false,
          data: { email: address, purpose: 'REGISTER' },
        },
      )
      startEmailCooldown(address, reply.retryAfterSeconds)
      await Taro.showToast({ title: reply.message, icon: 'none' })
    } catch (reason) {
      if (reason instanceof ProductApiError && reason.statusCode === 429)
        startEmailCooldown(address, reason.retryAfterSeconds)
      setServerError(reason instanceof Error ? reason.message : '验证码申请失败')
    } finally {
      sendLock.current = false
      setSending(false)
    }
  }
  const submit = async () => {
    if (lock.current) return
    setAttempted(true)
    setServerError('')
    const message = missingRegistrationMessage(value) || Object.values(errors)[0]
    if (message) {
      await Taro.showToast({ title: message, icon: 'none', duration: 2500 })
      return
    }
    if (value.email.trim() && !/^\d{6}$/.test(emailCode)) {
      setServerError('请填写邮箱验证码')
      return
    }
    lock.current = true
    setSubmitting(true)
    try {
      const result = await nativeRegistration.check(value.realName.trim(), value.studentId.trim())
      setCheck({ key, result })
      if (!result.eligible) return
      await nativeRegistration.register(nativeRegistrationPayload(value, emailCode))
      await Taro.reLaunch({ url: '/pages/index/index' })
    } catch (reason) {
      setServerError(reason instanceof Error ? reason.message : '注册失败，请重试。')
    } finally {
      lock.current = false
      setSubmitting(false)
    }
  }
  return (
    <View className="auth-form native-register">
      {fields.map((field) => {
        const invalid = Boolean(errors[field] && (attempted || touched[field]))
        const matched = field === 'realName' || field === 'studentId'
        const valid = matched
          ? currentCheck?.result?.eligible
          : Boolean(value[field]) && !errors[field]
        return (
          <View key={field} className="native-register__field">
            <Text className="auth-label">{registrationLabels[field]}</Text>
            <Input
              className={`auth-input${invalid ? ' native-register__input--invalid' : valid ? ' native-register__input--valid' : ''}`}
              type={field === 'studentId' ? 'number' : 'text'}
              password={field === 'password' || field === 'confirmPassword'}
              maxlength={
                field === 'studentId'
                  ? 32
                  : field === 'email'
                    ? 254
                    : field === 'realName'
                      ? 120
                      : 128
              }
              placeholder={
                field === 'password' ? '至少6位，不限制字符类型' : registrationLabels[field]
              }
              value={value[field]}
              disabled={submitting}
              onInput={(event) => {
                setValue((current) => ({ ...current, [field]: event.detail.value }))
                if (field === 'email') setEmailCode('')
              }}
              onBlur={() => setTouched((current) => ({ ...current, [field]: true }))}
            />
            {invalid && <Text className="native-register__error">{errors[field]}</Text>}
            {field === 'studentId' && currentCheck && (
              <Text
                className={
                  currentCheck.result?.eligible
                    ? 'native-note'
                    : currentCheck.message || currentCheck.result
                      ? 'native-register__error'
                      : 'native-note'
                }
              >
                {currentCheck.result?.message || currentCheck.message || '正在匹配学生名单…'}
              </Text>
            )}
            {field === 'email' && value.email.trim() && !errors.email ? (
              <View className="auth-code-row">
                <Input
                  className="auth-input"
                  type="number"
                  maxlength={6}
                  placeholder="邮箱验证码"
                  value={emailCode}
                  onInput={(event) =>
                    setEmailCode(event.detail.value.replace(/\D/g, '').slice(0, 6))
                  }
                />
                <Button
                  loading={sending}
                  disabled={sending || remaining > 0 || submitting}
                  onClick={() => void sendCode()}
                >
                  {remaining ? `${remaining}秒后重发` : '获取验证码'}
                </Button>
              </View>
            ) : null}
          </View>
        )
      })}
      {serverError && <Text className="native-register__error">{serverError}</Text>}
      <Button
        className="auth-link native-register__help"
        disabled={submitting}
        onClick={() => setHelp(true)}
      >
        注册遇到问题？反馈给管理员
      </Button>
      <Button
        className="auth-primary"
        loading={submitting}
        disabled={submitting}
        onClick={() => void submit()}
      >
        注册并进入
      </Button>
      {help && <RegistrationHelp value={value} onClose={() => setHelp(false)} />}
    </View>
  )
}

function RegistrationHelp({
  value,
  onClose,
}: {
  value: NativeRegistrationValues
  onClose: () => void
}) {
  const [details, setDetails] = useState(''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false)
  const key = useRef(
      'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
        const value = Math.floor(Math.random() * 16)
        return (char === 'x' ? value : (value & 3) | 8).toString(16)
      }),
    ),
    lock = useRef(false)
  const submit = async () => {
    if (lock.current) return
    if (details.trim().length < 2) {
      setError('请简单描述遇到的问题')
      return
    }
    lock.current = true
    setBusy(true)
    setError('')
    try {
      const result = await nativeRegistration.feedback({
        clientRequestId: key.current,
        ...(value.realName.trim() ? { realName: value.realName.trim() } : {}),
        ...(value.studentId.trim() ? { studentNumber: value.studentId.trim() } : {}),
        ...(value.email.trim() && !registrationErrors(value).email
          ? { contactEmail: value.email.trim() }
          : {}),
        details: details.trim(),
      })
      await Taro.showModal({ title: '反馈已提交', content: result.message, showCancel: false })
      onClose()
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : '反馈未提交，请稍后重试')
    } finally {
      lock.current = false
      setBusy(false)
    }
  }
  return (
    <NativeDialog
      title="注册问题反馈"
      busy={busy}
      unsavedChanges={Boolean(details.trim())}
      onClose={onClose}
      compact
      footer={
        <Button
          className="native-button native-button--primary"
          loading={busy}
          disabled={busy}
          onClick={() => void submit()}
        >
          提交给管理员
        </Button>
      }
    >
      <Text className="native-note">
        {value.realName.trim() || '姓名未填写'} {value.studentId.trim()}
      </Text>
      <Textarea
        className="native-field native-register__feedback"
        value={details}
        maxlength={1000}
        placeholder="请描述注册时遇到的问题"
        onInput={(event) => setDetails(event.detail.value)}
      />
      {error && <Text className="native-error">{error}</Text>}
    </NativeDialog>
  )
}
