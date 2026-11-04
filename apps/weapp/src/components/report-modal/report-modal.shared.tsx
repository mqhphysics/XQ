import { Button, Input, Text, Textarea, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useState } from 'react'

import { createClientActionId, productRepository } from '../../features/product/product.repository'
import type { ReportTargetType } from '../../features/product/product.types'
import { useOverlayFocus } from '../overlay-focus'
import { IconButton } from '../icon-button'

import './index.scss'

export function ReportModal({
  targetId,
  targetType,
  title,
  onClose,
}: {
  targetId?: string
  targetType: ReportTargetType
  title: string
  onClose: () => void
}) {
  const [reason, setReason] = useState('')
  const [details, setDetails] = useState('')
  const [clientReportId] = useState(() => createClientActionId('report'))
  const [saving, setSaving] = useState(false)
  useOverlayFocus(true, '.report-modal__panel', onClose)
  const submit = async () => {
    if (reason.trim().length < 2 || saving) return
    setSaving(true)
    try {
      await productRepository.createReport(
        targetType,
        reason.trim(),
        details.trim(),
        clientReportId,
        targetId,
      )
      await Taro.showToast({ title: '已提交给管理员', icon: 'success' })
      onClose()
    } catch (error) {
      await Taro.showToast({
        title: error instanceof Error ? error.message : '提交失败',
        icon: 'none',
      })
    } finally {
      setSaving(false)
    }
  }
  return (
    <View aria-modal role="dialog" aria-label={title} className="report-modal">
      <View className="report-modal__backdrop" onClick={onClose} />
      <View className="report-modal__panel">
        <View className="report-modal__head">
          <View>
            <Text className="report-modal__kicker">REPORT & FEEDBACK</Text>
            <Text className="report-modal__title">{title}</Text>
          </View>
          <IconButton icon="close" aria-label="关闭" className="report-modal__close" onClick={onClose}>
            ×
          </IconButton>
        </View>
        <Text className="report-modal__label">问题概括</Text>
        <Input
          className="report-modal__input"
          maxlength={120}
          placeholder="例如：辱骂、人身攻击、错误数据"
          value={reason}
          onInput={(event) => setReason(event.detail.value)}
        />
        <Text className="report-modal__label">补充说明（选填）</Text>
        <Textarea
          className="report-modal__textarea"
          maxlength={1000}
          placeholder="请说明具体位置和希望如何处理"
          value={details}
          onInput={(event) => setDetails(event.detail.value)}
        />
        <View className="report-modal__actions">
          <Button className="button button--outline" disabled={saving} onClick={onClose}>
            取消
          </Button>
          <Button
            className="button button--primary"
            disabled={reason.trim().length < 2 || saving}
            loading={saving}
            onClick={() => void submit()}
          >
            提交
          </Button>
        </View>
      </View>
    </View>
  )
}
