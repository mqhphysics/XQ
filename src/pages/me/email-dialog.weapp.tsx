import { Button, Input, Text, View } from '@tarojs/components'
import { useEffect, useRef, useState } from 'react'
import { NativeDialog } from '../../components/native-ui/index.weapp'
import { ProductApiError, request } from '../../features/product/product.repository'
import {
  startEmailCooldown,
  useEmailResendCountdown,
} from '../../components/email-code/countdown.weapp'
import { readSession, saveSession } from '../../features/product/session'
import type { AuthUser } from '../../features/product/product.types'

interface EmailFlow {
  id: string
  stage: 'OLD_EMAIL' | 'NEW_EMAIL' | 'COMPLETED'
  currentEmail: string | null
  newEmail: string | null
  expiresAt: string
}
export function NativeEmailDialog({
  user,
  onClose,
  onChanged,
}: {
  user: AuthUser
  onClose: () => void
  onChanged: (user: AuthUser) => void
}) {
  const [flow, setFlow] = useState<EmailFlow | null>(null),
    [email, setEmail] = useState(''),
    [code, setCode] = useState('')
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [notice, setNotice] = useState('')
  const address = flow?.stage === 'OLD_EMAIL' ? flow.currentEmail || user.email || '' : email
  const { remaining } = useEmailResendCountdown(address)
  const [requested, setRequested] = useState<string | null>(null)
  const lock = useRef(false)
  useEffect(() => {
    let active = true
    void request<EmailFlow>('/auth/email/change/start', { method: 'POST' })
      .then((value) => {
        if (active) {
          setFlow(value)
          setEmail(value.newEmail ?? '')
        }
      })
      .catch((reason) => {
        if (active) setError(reason instanceof Error ? reason.message : '邮箱服务暂不可用')
      })
    return () => {
      active = false
    }
  }, [])
  const old = flow?.stage === 'OLD_EMAIL'
  const send = async () => {
    if (!flow || lock.current || remaining) return
    lock.current = true
    setBusy(true)
    setError('')
    try {
      const reply = await request<{ message: string; retryAfterSeconds: number }>(
        '/auth/email/change/code',
        {
          method: 'POST',
          data: { changeId: flow.id, ...(!old ? { newEmail: email.trim() } : {}) },
        },
      )
      setRequested(email.trim().toLowerCase())
      startEmailCooldown(address, reply.retryAfterSeconds)
      setNotice(reply.message)
    } catch (reason) {
      if (reason instanceof ProductApiError && reason.statusCode === 429)
        startEmailCooldown(address, reason.retryAfterSeconds)
      setError(reason instanceof Error ? reason.message : '验证码发送失败')
    } finally {
      lock.current = false
      setBusy(false)
    }
  }
  const submit = async () => {
    if (!flow || lock.current || code.length !== 6) return
    lock.current = true
    setBusy(true)
    setError('')
    const before = readSession()
    try {
      if (old) {
        setFlow(
          await request<EmailFlow>('/auth/email/change/verify-old', {
            method: 'POST',
            data: { changeId: flow.id, emailCode: code },
          }),
        )
        setCode('')
        setEmail('')
        setRequested(null)
        setNotice('原邮箱验证完成，请填写新邮箱')
      } else {
        const updated = await request<AuthUser>('/auth/email/change/complete', {
          method: 'POST',
          data: { changeId: flow.id, emailCode: code },
        })
        const current = readSession()
        if (
          !before ||
          current?.accessToken !== before.accessToken ||
          current.user.id !== updated.id
        )
          throw new Error('账号已切换，请重新打开邮箱设置')
        saveSession({ ...current, user: updated })
        onChanged(updated)
        onClose()
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '邮箱验证失败')
    } finally {
      lock.current = false
      setBusy(false)
    }
  }
  return (
    <NativeDialog
      unsavedChanges={
        Boolean(code.trim()) ||
        Boolean(
          flow &&
          email.trim().toLowerCase() !==
            (flow.newEmail || flow.currentEmail || '').trim().toLowerCase(),
        )
      }
      title={user.email ? '邮箱设置' : '绑定邮箱'}
      busy={busy}
      onClose={onClose}
      compact
      footer={
        <Button
          className="native-button native-button--primary"
          disabled={
            busy || !flow || code.length !== 6 || (!old && requested !== email.trim().toLowerCase())
          }
          loading={busy}
          onClick={() => void submit()}
        >
          {old ? '验证原邮箱' : '确认绑定'}
        </Button>
      }
    >
      {!flow && !error && <Text className="native-note">正在读取邮箱设置…</Text>}
      {flow && (
        <>
          <Text className="native-label">{old ? '原邮箱' : user.email ? '新邮箱' : '邮箱'}</Text>
          {old ? (
            <Text className="native-email-address">{flow.currentEmail}</Text>
          ) : (
            <Input
              className="native-field"
              value={email}
              placeholder="请输入邮箱"
              onInput={(event) => {
                setEmail(event.detail.value)
                setCode('')
              }}
            />
          )}
          <Text className="native-label">验证码</Text>
          <View className="native-code-row">
            <Input
              className="native-field"
              type="number"
              maxlength={6}
              value={code}
              placeholder="6 位验证码"
              onInput={(event) => setCode(event.detail.value.replace(/\D/g, '').slice(0, 6))}
            />
            <Button
              className="native-button"
              disabled={
                busy || remaining > 0 || (!old && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))
              }
              onClick={() => void send()}
            >
              {remaining ? `${remaining}秒后重发` : '获取验证码'}
            </Button>
          </View>
        </>
      )}
      {notice && <Text className="native-note">{notice}</Text>}
      {error && <Text className="native-error">{error}</Text>}
    </NativeDialog>
  )
}
