import { Button, Input, Text, Textarea, View } from '@tarojs/components'
import { useEffect, useRef, useState } from 'react'
import { NativeDialog } from '../../components/native-ui'
import { createClientActionId } from '../../features/product/product.repository'
import {
  studentRegistrationRepository,
  type StudentRegistrationState,
} from '../../features/product/student-registration.repository.weapp'
import { readSession } from '../../features/product/session'

export function NativeRegistrationCorrection({
  onClose,
  onBack,
}: {
  onClose: () => void
  onBack?: (() => void) | undefined
}) {
  const [data, setData] = useState<StudentRegistrationState | null>(null)
  const [name, setName] = useState(''),
    [number, setNumber] = useState(''),
    [reason, setReason] = useState('')
  const [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [saved, setSaved] = useState(false)
  const initial = useRef({ name: '', number: '', reason: '' }),
    lock = useRef(false),
    alive = useRef(true)
  const attempt = useRef<{ signature: string; key: string } | null>(null)
  const load = async () => {
    const before = readSession()
    setError('')
    try {
      const next = await studentRegistrationRepository.load(true)
      if (!alive.current || !before || before.accessToken !== readSession()?.accessToken) return
      const latest = next.items[0]
      const values = {
        name: latest?.realName || next.current?.realName || before.user.realName || '',
        number: latest?.studentNumber || next.current?.studentNumber || before.user.studentId || '',
        reason: latest?.reason || '',
      }
      initial.current = values
      setName(values.name)
      setNumber(values.number)
      setReason(values.reason)
      setData(next)
    } catch (issue) {
      if (alive.current) setError(issue instanceof Error ? issue.message : '申请资料读取失败')
    }
  }
  useEffect(() => {
    alive.current = true
    void load()
    return () => {
      alive.current = false
    }
  }, [])
  const dirty =
    name !== initial.current.name ||
    number !== initial.current.number ||
    reason !== initial.current.reason
  const latest = data?.items[0]
  const valid = name.trim().length >= 2 && /^20\d{8}$/.test(number.trim())
  const submit = async () => {
    if (!data || !valid || lock.current) return
    lock.current = true
    setBusy(true)
    setError('')
    setSaved(false)
    const before = readSession()
    const payload = {
      expectedVersion: latest?.version || 0,
      realName: name.trim(),
      studentNumber: number.trim(),
      reason: reason.trim(),
    }
    const signature = JSON.stringify(payload)
    if (attempt.current?.signature !== signature)
      attempt.current = { signature, key: createClientActionId('registration-correction') }
    try {
      await studentRegistrationRepository.submit(payload, attempt.current.key)
      if (!alive.current || !before || before.accessToken !== readSession()?.accessToken) return
      attempt.current = null
      setSaved(true)
      initial.current = {
        name: payload.realName,
        number: payload.studentNumber,
        reason: payload.reason,
      }
      setData(null)
      await load()
    } catch (issue) {
      if (alive.current) setError(issue instanceof Error ? issue.message : '申请提交失败，请重试')
    } finally {
      lock.current = false
      if (alive.current) setBusy(false)
    }
  }
  return (
    <NativeDialog
      title="姓名与学号更正"
      onClose={onClose}
      onBack={onBack}
      bodyHeight={380}
      loading={!data && !error}
      busy={busy}
      unsavedChanges={dirty}
      footer={
        <Button
          className="native-button native-button--primary"
          disabled={!data || !valid || busy || (!dirty && latest?.status !== 'RETURNED')}
          loading={busy}
          onClick={() => void submit()}
        >
          提交审核
        </Button>
      }
    >
      {!data && !error && <Text className="native-note">正在读取身份资料…</Text>}
      {data && (
        <View>
          <Text className="native-note">
            填写正确的姓名与学号，审核通过后更新。昵称和公开球员名保持不变。
          </Text>
          {latest && (
            <Text className="native-note">
              最新申请：
              {
                {
                  PENDING: '待审核',
                  APPROVED: '已通过',
                  RETURNED: '请更正后重新提交',
                  REJECTED: '未通过',
                }[latest.status]
              }
            </Text>
          )}
          {latest?.decisionNote && (
            <Text className="native-note">审核说明：{latest.decisionNote}</Text>
          )}
          {saved && <Text className="native-note">已提交审核，审核结果将通过消息通知你。</Text>}
          <Text className="native-label">正确姓名</Text>
          <Input
            className="native-field"
            value={name}
            maxlength={120}
            disabled={busy}
            onInput={(event) => {
              setName(event.detail.value)
              setSaved(false)
            }}
            placeholder="填写真实姓名"
          />
          <Text className="native-label">正确学号</Text>
          <Input
            className="native-field"
            type="number"
            value={number}
            maxlength={10}
            disabled={busy}
            onInput={(event) => {
              setNumber(event.detail.value)
              setSaved(false)
            }}
            placeholder="20开头的10位数字"
          />
          <Text className="native-label">更正说明（选填）</Text>
          <Textarea
            className="native-field"
            value={reason}
            maxlength={500}
            disabled={busy}
            onInput={(event) => {
              setReason(event.detail.value)
              setSaved(false)
            }}
            placeholder="可简要说明填错的内容或原因"
          />
        </View>
      )}
      {error && <Text className="native-error">{error}</Text>}
      {!data && error && (
        <Button className="native-button" onClick={() => void load()}>
          重新加载
        </Button>
      )}
    </NativeDialog>
  )
}
