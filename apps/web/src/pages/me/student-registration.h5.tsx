import { useEffect, useState } from 'react'
import { createClientActionId, productRequest } from '../../features/product/product.repository'
import './student-registration.h5.scss'

type Registration = {
  id: string
  version: number
  status: string
  studentNumber: string
  decisionNote: string | null
}
function useRegistration() {
  const [record, setRecord] = useState<Registration | null>(null)
  const [revision, setRevision] = useState(0)
  useEffect(() => {
    let active = true
    void productRequest<{ items: Registration[] }>('/me/campus/registration')
      .then((result) => {
        if (active) setRecord(result.items[0] ?? null)
      })
      .catch(() => {})
    const changed = () => setRevision((value) => value + 1)
    window.addEventListener('xiaoqiu:registration-changed', changed)
    return () => {
      active = false
      window.removeEventListener('xiaoqiu:registration-changed', changed)
    }
  }, [revision])
  return record
}
export function StudentRegistrationStatus({ onEdit }: { onEdit: () => void }) {
  const record = useRegistration()
  if (record?.status !== 'RETURNED') return null
  return (
    <div className="student-registration-notice" role="status">
      <span>{record.decisionNote || '请核对并更正注册学号'}</span>
      <button type="button" data-profile-button onClick={onEdit}>
        前往个人信息
      </button>
    </div>
  )
}
export function StudentNumberField({
  studentId,
  onCorrection,
}: {
  studentId?: string | null
  onCorrection: () => void
}) {
  const record = useRegistration()
  const [editing, setEditing] = useState(false),
    [number, setNumber] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('')
  const editable = record && ['PENDING', 'RETURNED'].includes(record.status)
  const save = async () => {
    if (!record || busy) return
    setBusy(true)
    setError('')
    try {
      await productRequest('/me/campus/registration', {
        method: 'POST',
        headers: { 'Idempotency-Key': createClientActionId('registration') },
        data: {
          expectedVersion: record.version,
          studentNumber: number.trim(),
          reason: '本人更正注册学号',
        },
      })
      setEditing(false)
      window.dispatchEvent(new Event('xiaoqiu:registration-changed'))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '提交未完成，请重试')
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="profile-info-row registration-number-row">
      <span>学号</span>
      {editing ? (
        <form
          onSubmit={(event) => {
            event.preventDefault()
            void save()
          }}
        >
          <input
            aria-label="更正学号"
            value={number}
            onChange={(event) => setNumber(event.target.value)}
            inputMode="numeric"
            maxLength={10}
            disabled={busy}
          />
          <button data-profile-button disabled={busy || !/^20\d{8}$/.test(number.trim())}>
            {busy ? '提交中…' : '提交核验'}
          </button>
          <button
            data-profile-button
            type="button"
            disabled={busy}
            onClick={() => setEditing(false)}
          >
            取消
          </button>
          {error && <span role="alert">{error}</span>}
        </form>
      ) : (
        <>
          <span>
            {studentId || record?.studentNumber || '未登记'}
            {editable && (
              <span className="registration-number-state">
                {record.status === 'RETURNED' ? '需要更正' : '待核验'}
              </span>
            )}
          </span>
          <button
            data-profile-button
            onClick={() => {
              if (!editable) return onCorrection()
              setNumber(record.studentNumber)
              setEditing(true)
            }}
          >
            {editable ? '更改' : '申请更正'}
          </button>
        </>
      )}
    </div>
  )
}
