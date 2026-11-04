import { useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import Taro from '@tarojs/taro'
import { ReportModal as ExistingReportModal } from './report-modal.shared'
import { productRepository, createClientActionId } from '../../features/product/product.repository'
import type { ReportTargetType } from '../../features/product/product.types'
import { useOverlayFocus } from '../overlay-focus'
import { PostIcon } from '../post-social/icons'
import './index.h5.scss'

export function ReportModal(props: {
  targetId?: string
  targetType: ReportTargetType
  title: string
  onClose: () => void
}) {
  const [reason, setReason] = useState(''),
    [details, setDetails] = useState(''),
    [saving, setSaving] = useState(false)
  const [clientId] = useState(() => createClientActionId('report'))
  const busy = useRef(false)
  const desktop = window.matchMedia('(min-width:721px)').matches
  const close = () => {
    if (!busy.current) props.onClose()
  }
  useOverlayFocus(desktop, '.report-panel-h5', close)
  if (!desktop) return <ExistingReportModal {...props} />
  const submit = async () => {
    if (reason.trim().length < 2 || busy.current) return
    busy.current = true
    setSaving(true)
    try {
      await productRepository.createReport(
        props.targetType,
        reason.trim(),
        details.trim(),
        clientId,
        props.targetId,
      )
      await Taro.showToast({ title: '已提交给管理员', icon: 'success' })
      props.onClose()
    } catch (error) {
      await Taro.showToast({
        title: error instanceof Error ? error.message : '提交失败，请重试',
        icon: 'none',
      })
    } finally {
      busy.current = false
      setSaving(false)
    }
  }
  return createPortal(
    <div
      className="report-layer-h5"
      onClick={(event) => {
        if (event.target === event.currentTarget) close()
      }}
    >
      <form
        className="report-panel-h5 xq-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={props.title}
        onSubmit={(event) => {
          event.preventDefault()
          void submit()
        }}
      >
        <header className="xq-dialog__header">
          <div>
            <span>REPORT & FEEDBACK</span>
            <h2>{props.title}</h2>
          </div>
          <button type="button" aria-label="关闭反馈" onClick={close}>
            <PostIcon name="close" />
          </button>
        </header>
        <div className="xq-dialog__body">
          <label className="report-field-label" htmlFor="report-reason-h5">
            问题概括
          </label>
          <input
            data-report-field
            id="report-reason-h5"
            aria-label="问题概括"
            maxLength={120}
            placeholder="例如：辱骂、人身攻击、错误数据"
            value={reason}
            disabled={saving}
            onChange={(event) => setReason(event.target.value)}
          />
          <label className="report-field-label" htmlFor="report-details-h5">
            补充说明（选填）
          </label>
          <textarea
            data-report-field
            id="report-details-h5"
            aria-label="补充说明"
            maxLength={1000}
            placeholder="请说明具体位置和希望如何处理"
            value={details}
            disabled={saving}
            onChange={(event) => setDetails(event.target.value)}
          />
        </div>
        <footer className="xq-dialog__footer">
          <button type="button" disabled={saving} onClick={close}>
            取消
          </button>
          <button type="submit" disabled={reason.trim().length < 2 || saving}>
            {saving ? '提交中' : '提交'}
          </button>
        </footer>
      </form>
    </div>,
    document.body,
  )
}
