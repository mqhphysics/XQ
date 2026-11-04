import { useWorkflowCommand, CommandStatus } from '../adminWorkflows/client'
import type { OrganizationContext } from '../adminSchedule/types'
import { refreshManagementData } from '../adminAuth/refresh'

/** A successful review updates its own queue; no confirm dialog or global reload. */
export function QuickApprove({ context, path, method = 'POST', body, onDone, label = '通过' }: {
  context: OrganizationContext; path: string; method?: 'POST' | 'PUT'; body: Record<string, unknown>;
  onDone: () => void; label?: string;
}) {
  const command = useWorkflowCommand(context, () => {
    onDone()
    refreshManagementData(['/admin/center/overview', '/admin/ai-review/stats'])
  }, path)
  return <span className="mc-quick-approve" onClick={event => event.stopPropagation()}>
    <button type="button" disabled={command.locked} onClick={() => void command.run({ path, method,
      body: { ...body, reason: '审核通过' }, headers: { 'Idempotency-Key': crypto.randomUUID() },
    })}>{command.busy ? '正在通过…' : label}</button>
    <CommandStatus command={command} />
  </span>
}
