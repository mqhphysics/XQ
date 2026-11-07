import { useState } from 'react'
import type { OrganizationContext } from '../adminSchedule/types'
import { useWorkflowCommand, CommandStatus } from '../adminWorkflows/client'
import { DataState, Modal, useAdminData } from './shared'
import { refreshManagementData } from '../adminAuth/refresh'
import './student-registration.css'

interface Registration {
  id: string
  version: number
  status: string
  realName: string
  studentNumber: string
  reason: string
  currentStudentRecordId: string | null
  user: { id: string }
  candidates: Array<{
    id: string
    collegeName: string
    studentNumber: string | null
    user: { id: string } | null
  }>
}

export function StudentRegistrationReview({
  context,
  compact = false,
}: {
  context: OrganizationContext
  compact?: boolean
}) {
  const result = useAdminData<{ items: Registration[] }>(
    context,
    context.canManageOrganization ? '/admin/campus/registrations' : null,
  )
  const [notice, setNotice] = useState('')
  const pending = result.data?.items.filter((item) => item.status === 'PENDING') ?? []
  if (!context.canManageOrganization) return null
  if (!pending.length && !result.error && !result.loading && !notice) return null
  return (
    <section
      className={`mc-panel registration-review ${compact ? 'registration-review-compact' : ''}`}
    >
      <div className="registration-review-heading">
        <h2>姓名与学号核验 {pending.length > 0 && <span>{pending.length}</span>}</h2>
        {notice && <span role="status">{notice}</span>}
      </div>
      <DataState {...result} onRetry={result.refresh} />
      {pending.map((item) => (
        <ReviewItem
          key={`${item.id}/${item.version}`}
          context={context}
          item={item}
          onDone={(decision) => {
            setNotice(decision === 'APPROVE' ? '已纳入学生档案' : '已发送更正通知')
            refreshManagementData()
          }}
        />
      ))}
    </section>
  )
}

function ReviewItem({
  context,
  item,
  onDone,
}: {
  context: OrganizationContext
  item: Registration
  onDone: (decision: 'APPROVE' | 'RETURN') => void
}) {
  const [dialog, setDialog] = useState<'APPROVE' | 'RETURN' | null>(null)
  const [selected, setSelected] = useState('')
  const [reason, setReason] = useState('你填写的姓名或学号需要核对，请提交正确的身份资料。')
  const [deadlineDays, setDeadlineDays] = useState<7 | 14>(14)
  const candidates = item.candidates.filter(
    (student) =>
      item.currentStudentRecordId === student.id ||
      ((!student.user || student.user.id === item.user.id) &&
        (!student.studentNumber || student.studentNumber === item.studentNumber)),
  )
  const writer = useWorkflowCommand<{ saved: boolean }>(
    context,
    () => {
      onDone(dialog === 'RETURN' ? 'RETURN' : 'APPROVE')
      setDialog(null)
    },
    `/admin/campus/registrations/${item.id}/review`,
  )
  const save = (decision: 'APPROVE' | 'RETURN') =>
    void writer.run({
      path: `/admin/campus/registrations/${item.id}/review`,
      headers: { 'Idempotency-Key': `registration-${crypto.randomUUID()}` },
      body: {
        expectedVersion: item.version,
        decision,
        reason: decision === 'RETURN' ? reason : '管理员核对姓名与学号',
        ...(decision === 'RETURN' ? { deadlineDays } : {}),
        ...(decision === 'APPROVE' && !item.currentStudentRecordId && candidates.length > 1
          ? { studentRecordId: selected }
          : {}),
      },
    })
  return (
    <article className="registration-review-item">
      <div className="registration-review-person">
        <strong>{item.realName}</strong>
        <span>{item.studentNumber}</span>
        {item.reason && <span>说明：{item.reason}</span>}
      </div>
      <div className="registration-actions">
        <button
          disabled={writer.locked}
          onClick={() =>
            !item.currentStudentRecordId && candidates.length > 1
              ? setDialog('APPROVE')
              : save('APPROVE')
          }
        >
          确认
        </button>
        <button
          className="secondary-button"
          disabled={writer.locked}
          onClick={() => setDialog('RETURN')}
        >
          有误
        </button>
      </div>
      <CommandStatus command={writer} />
      {dialog && (
        <Modal
          title={dialog === 'RETURN' ? '发送身份资料更正通知' : '核对同名学生'}
          onClose={() => {
            if (!writer.locked) setDialog(null)
          }}
        >
          <div className="registration-message">
            <p>
              <strong>{item.realName}</strong> · {item.studentNumber}
            </p>
            {dialog === 'RETURN' ? (
              <div>
                <label className="mc-field">
                  <span>以当前管理员身份发送官方私信</span>
                  <textarea
                    rows={4}
                    value={reason}
                    maxLength={500}
                    disabled={writer.locked}
                    onChange={(event) => setReason(event.target.value)}
                  />
                </label>
                <label className="mc-field">
                  <span>建议更正期限</span>
                  <select
                    value={deadlineDays}
                    disabled={writer.locked}
                    onChange={(event) => setDeadlineDays(Number(event.target.value) as 7 | 14)}
                  >
                    <option value={14}>14天</option>
                    <option value={7}>7天</option>
                  </select>
                </label>
                <p>到期不会自动封禁，后续处理仍由管理员核对。</p>
              </div>
            ) : (
              <label className="mc-field">
                <span>学生档案</span>
                <select
                  value={selected}
                  disabled={writer.locked}
                  onChange={(event) => setSelected(event.target.value)}
                >
                  <option value="">选择已核实的同名学生</option>
                  {candidates.map((student) => (
                    <option key={student.id} value={student.id}>
                      {student.collegeName || '学院待补充'} · {student.studentNumber || '待补学号'}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <div className="mc-actions">
              <button
                disabled={
                  writer.locked || (dialog === 'RETURN' ? reason.trim().length < 2 : !selected)
                }
                onClick={() => save(dialog)}
              >
                {dialog === 'RETURN' ? '发送通知' : '确认纳入'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </article>
  )
}
