import { Button, Input, Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useRef, useState } from 'react'
import { emailAuth } from '../../features/product/email-auth.repository.h5'
import { ProductApiError } from '../../features/product/product.repository'
import {
  startEmailCooldown,
  useEmailResendCountdown,
} from '../../components/email-code/countdown.weapp'
export function NativeEmailLogin() {
  const [email, setEmail] = useState(''),
    [code, setCode] = useState('')
  const { remaining } = useEmailResendCountdown(email)
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [notice, setNotice] = useState('')
  const lock = useRef(false),
    target = useRef('')
  target.current = email.trim().toLowerCase()
  const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
  const run = async (mode: 'send' | 'login') => {
    if (lock.current || !valid || (mode === 'send' && remaining)) return
    lock.current = true
    setBusy(true)
    setError('')
    setNotice('')
    const address = target.current
    try {
      if (mode === 'send') {
        const result = await emailAuth.requestCode(address, 'LOGIN')
        startEmailCooldown(address, result.retryAfterSeconds)
        if (target.current === address) setNotice(result.message)
      } else {
        await emailAuth.login(address, code)
        await Taro.reLaunch({ url: '/pages/index/index' })
      }
    } catch (issue) {
      if (issue instanceof ProductApiError && issue.statusCode === 429)
        startEmailCooldown(address, issue.retryAfterSeconds)
      setError(issue instanceof Error ? issue.message : '邮箱服务暂不可用，请重试')
    } finally {
      lock.current = false
      setBusy(false)
    }
  }
  return (
    <>
      <Text className="auth-label">绑定邮箱</Text>
      <Input
        className="auth-input"
        placeholder="请输入已绑定的邮箱"
        value={email}
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
          placeholder="请输入验证码"
          value={code}
          onInput={(event) => setCode(event.detail.value.replace(/\D/g, '').slice(0, 6))}
        />
        <Button
          disabled={!valid || busy || remaining > 0}
          loading={busy}
          onClick={() => void run('send')}
        >
          {remaining ? `${remaining}秒后重发` : '获取验证码'}
        </Button>
      </View>
      {error && <Text className="native-error">{error}</Text>}
      {notice && <Text className="native-note">{notice}</Text>}
      <Button
        className="auth-primary"
        disabled={!valid || code.length !== 6 || busy}
        loading={busy}
        onClick={() => void run('login')}
      >
        邮箱登录
      </Button>
    </>
  )
}
