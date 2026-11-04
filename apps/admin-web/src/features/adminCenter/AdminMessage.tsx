import { useState } from 'react'
import type { OrganizationContext } from '../adminSchedule/types'
import { useWorkflowCommand, CommandStatus } from '../adminWorkflows/client'
import { Modal } from './shared'
export function AdminMessage({
  context,
  recipient,
  system = false,
  onClose,
}: {
  context: OrganizationContext
  recipient: { id: string; displayName: string }
  system?: boolean
  onClose: () => void
}) {
  const [body, setBody] = useState(''),
    [sent, setSent] = useState(false)
  const writer = useWorkflowCommand(
    context,
    () => setSent(true),
    system ? '/admin/center/system-notifications' : `/messages/direct/${recipient.id}`,
  )
  return (
    <Modal title={`${system ? '系统通知' : '私信'} · ${recipient.displayName}`} onClose={onClose}>
      <div className="gov-detail-body">
        {sent ? (
          <p role="status">已发送。</p>
        ) : (
          <>
            <label className="mc-field">
              <span>消息内容</span>
              <textarea
                autoFocus
                rows={5}
                maxLength={1000}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                disabled={writer.locked}
              />
            </label>
            <button
              disabled={writer.locked || body.trim().length < 2}
              onClick={() =>
                void writer.run({
                  path: system
                    ? '/admin/center/system-notifications'
                    : `/messages/direct/${recipient.id}`,
                  headers: { 'Idempotency-Key': `admin-message-${crypto.randomUUID()}` },
                  body: system
                    ? {
                        recipientUserId: recipient.id,
                        title: '晓球管理中心通知',
                        body: body.trim(),
                        reason: '管理员发送系统通知',
                      }
                    : { body: body.trim(), clientMessageId: `admin-${crypto.randomUUID()}` },
                })
              }
            >
              发送
            </button>
            <CommandStatus command={writer} />
          </>
        )}
      </div>
    </Modal>
  )
}
