import { Button, Input, Text, Textarea } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useRef, useState } from 'react'
import type { ReportTargetType } from '../../features/product/product.types'
import { createClientActionId, productRepository } from '../../features/product/product.repository'
import { NativeDialog } from '../native-ui/index.weapp'
export function ReportModal({
  targetId,
  targetType,
  title,
  onClose,
  onHistory,
}: {
  targetId?: string
  targetType: ReportTargetType
  title: string
  onClose: () => void
  onHistory?: () => void
}) {
  const [reason, setReason] = useState(''),
    [details, setDetails] = useState(''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false)
  const key = useRef(createClientActionId('report')),
    lock = useRef(false)
  const submit = async () => {
    if (lock.current || reason.trim().length < 2) return
    lock.current = true
    setBusy(true)
    setError('')
    try {
      await productRepository.createReport(
        targetType,
        reason.trim(),
        details.trim(),
        key.current,
        targetId,
      )
      void Taro.showToast({ title: '已提交给管理员', icon: 'success' })
      onClose()
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : '提交失败')
    } finally {
      lock.current = false
      setBusy(false)
    }
  }
  return (
    <NativeDialog
      unsavedChanges={Boolean(reason.trim() || details.trim())}
      title={title}
      busy={busy}
      onClose={onClose}
      footer={
        <>
          {onHistory && (
            <Button className="native-button" disabled={busy} onClick={onHistory}>
              反馈记录
            </Button>
          )}
          <Button
            className="native-button native-button--primary"
            disabled={busy || reason.trim().length < 2}
            loading={busy}
            onClick={() => void submit()}
          >
            提交
          </Button>
        </>
      }
    >
      <Text className="native-label">问题概括</Text>
      <Input
        className="native-field"
        maxlength={120}
        value={reason}
        placeholder="简要说明遇到的问题"
        onInput={(event) => setReason(event.detail.value)}
      />
      <Text className="native-label">补充说明</Text>
      <Textarea
        className="native-field"
        maxlength={1000}
        value={details}
        placeholder="选填"
        onInput={(event) => setDetails(event.detail.value)}
      />
      {error && <Text className="native-error">{error}</Text>}
    </NativeDialog>
  )
}
