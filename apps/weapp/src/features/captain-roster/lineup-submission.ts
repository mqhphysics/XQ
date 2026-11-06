import type { LineupPlanView, SaveLineupPlan } from './lineup-plan.repository'

export type PendingLineupSubmission =
  | { phase: 'SAVE'; key: string; input: SaveLineupPlan; defaultKey: string | null }
  | { phase: 'DEFAULT'; key: string; plan: LineupPlanView }

export function readPendingLineup(value: unknown): PendingLineupSubmission | null {
  if (!value || typeof value !== 'object') return null
  const item = value as PendingLineupSubmission
  if (typeof item.key !== 'string' || !item.key) return null
  if (
    item.phase === 'SAVE' &&
    item.input?.payload &&
    Number.isInteger(item.input.expectedVersion) &&
    (item.defaultKey === null || typeof item.defaultKey === 'string')
  )
    return item
  if (
    item.phase === 'DEFAULT' &&
    typeof item.plan?.id === 'string' &&
    Number.isInteger(item.plan.version)
  )
    return item
  return null
}

/** Persist the next step before sending it, so response loss and restarts reuse the same keys. */
export async function submitPendingLineup(
  command: PendingLineupSubmission,
  api: {
    save: (input: SaveLineupPlan, key: string) => Promise<LineupPlanView>
    publish: (plan: LineupPlanView, key: string) => Promise<LineupPlanView>
  },
  checkpoint: (command: PendingLineupSubmission) => void,
): Promise<LineupPlanView> {
  if (command.phase === 'SAVE') {
    const saved = await api.save(command.input, command.key)
    if (!command.defaultKey) return saved
    command = { phase: 'DEFAULT', key: command.defaultKey, plan: saved }
    checkpoint(command)
  }
  return api.publish(command.plan, command.key)
}
