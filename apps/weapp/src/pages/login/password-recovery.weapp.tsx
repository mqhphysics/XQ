import { Button, Input, ScrollView, Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useRef, useState } from 'react'
import { emailAuth } from '../../features/product/email-auth.repository.h5'
import { ProductApiError } from '../../features/product/product.repository'
import {
  startEmailCooldown,
  useEmailResendCountdown,
} from '../../components/email-code/countdown.weapp'

export function NativePasswordRecovery({
  onClose,
  onHelp,
}: {
  onClose: () => void
  onHelp: (email: string) => void
}) {
  const [email, setEmail] = useState(''),
    [code, setCode] = useState('')
  const [password, setPassword] = useState(''),
    [confirmation, setConfirmation] = useState('')
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [notice, setNotice] = useState('')
  const lock = useRef(false)
  const { remaining } = useEmailResendCountdown(email)
  const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
  const validPassword = Array.from(password).length >= 6 && Array.from(password).length <= 128
  const run = async (action: 'send' | 'reset') => {
    if (lock.current || !validEmail || (action === 'send' && remaining)) return
    if (action === 'reset' && (!/^\d{6}$/.test(code) || !validPassword)) return
    if (action === 'reset' && password !== confirmation) {
      setError('两次输入的密码不一致')
      return
    }
    lock.current = true
    setBusy(true)
    setError('')
    setNotice('')
    const address = email.trim()
    try {
      if (action === 'send') {
        const reply = await emailAuth.requestCode(address, 'RESET_PASSWORD')
        startEmailCooldown(address, reply.retryAfterSeconds)
        setNotice(reply.message)
      } else {
        await emailAuth.resetPassword(address, code, password)
        onClose()
        await Taro.showToast({ title: '密码已重置，请用新密码登录', icon: 'none' })
      }
    } catch (issue) {
      if (action === 'send' && issue instanceof ProductApiError && issue.statusCode === 429)
        startEmailCooldown(address, issue.retryAfterSeconds)
      setError(issue instanceof Error ? issue.message : '找回暂未完成，请重试')
    } finally {
      lock.current = false
      setBusy(false)
    }
  }
  return (
    <View
      className="native-recovery"
      catchMove
      onClick={() => {
        if (!lock.current) onClose()
      }}
    >
      <View
        className="native-recovery__dialog recovery-box"
        role="dialog"
        aria-label="找回密码"
        onClick={(event) => event.stopPropagation()}
      >
        <View className="recovery-box__head">
          <Text>找回密码</Text>
          <Button
            className="native-recovery__close"
            aria-label="关闭找回密码"
            disabled={busy}
            onClick={onClose}
          >
            ×
          </Button>
        </View>
        <ScrollView className="native-recovery__body" scrollY>
          <Text className="auth-label">已验证的绑定邮箱</Text>
          <Input
            className="auth-input"
            value={email}
            maxlength={254}
            disabled={busy}
            placeholder="请输入已绑定并验证的邮箱"
            onInput={(event) => {
              setEmail(event.detail.value)
              setCode('')
              setError('')
              setNotice('')
            }}
          />
          <Text className="auth-label">验证码</Text>
          <View className="auth-code-row">
            <Input
              className="auth-input"
              type="number"
              maxlength={6}
              value={code}
              disabled={busy}
              placeholder="6位验证码"
              onInput={(event) => setCode(event.detail.value.replace(/\D/g, '').slice(0, 6))}
            />
            <Button
              disabled={busy || !validEmail || remaining > 0}
              onClick={() => void run('send')}
            >
              {remaining ? `${remaining}秒后重发` : '获取验证码'}
            </Button>
          </View>
          <Text className="auth-label">新密码</Text>
          <Input
            className="auth-input"
            password
            maxlength={128}
            value={password}
            disabled={busy}
            placeholder="6至128位密码"
            onInput={(event) => setPassword(event.detail.value)}
          />
          <Text className="auth-label">确认新密码</Text>
          <Input
            className="auth-input"
            password
            maxlength={128}
            value={confirmation}
            disabled={busy}
            placeholder="再次输入新密码"
            onInput={(event) => setConfirmation(event.detail.value)}
          />
          {notice && <Text className="native-note">{notice}</Text>}
          {error && <Text className="native-recovery__error">{error}</Text>}
          <Button
            className="auth-secondary"
            loading={busy}
            disabled={busy || !validEmail || code.length !== 6 || !validPassword || !confirmation}
            onClick={() => void run('reset')}
          >
            重置密码
          </Button>
          <Button className="auth-link" disabled={busy} onClick={() => onHelp(email.trim())}>
            无法使用绑定邮箱？提交找回申请
          </Button>
        </ScrollView>
      </View>
    </View>
  )
}
