import type { ReportPlayer, ReportWorkspace } from './types'

const formations = [
  [3, 3, 1],
  [2, 3, 2],
  [3, 2, 2],
] as const
export function initialSheetLineup(players: ReportPlayer[], starters: string[], seed: string) {
  const selected = players.filter((p) => starters.includes(p.id))
  if (
    new Set(starters).size !== starters.length ||
    selected.length !== starters.length ||
    starters.length > 8
  )
    throw new Error('首发必须来自本队名单，且不能重复或超过8人。')
  const shape =
    formations[[...seed].reduce((sum, c) => sum + c.charCodeAt(0), 0) % formations.length]!
  const slots: { slotId: string; label: string; x: number; y: number; playerId: string | null }[] =
    [{ slotId: 'gk', label: 'GK', x: 50, y: 90, playerId: null }]
  for (const [line, count] of shape.entries())
    for (let i = 0; i < count; i++)
      slots.push({
        slotId: `line-${line}-${i}`,
        label: ['DF', 'MF', 'FW'][line]!,
        x: ((i + 1) * 100) / (count + 1),
        y: [68, 44, 20][line]!,
        playerId: null,
      })
  const preference = (p: ReportPlayer) =>
    ['0', '00', '1'].includes(p.shirtNumber || '')
      ? 'GK'
      : [2, 3, 4, 5].includes(Number(p.shirtNumber))
        ? 'DF'
        : [7, 9, 10, 11].includes(Number(p.shirtNumber))
          ? 'FW'
          : 'MF'
  const remaining = [...selected].sort(
    (a, b) => Number(preference(b) === 'GK') - Number(preference(a) === 'GK'),
  )
  for (const slot of slots) {
    if (!remaining.length) break
    const preferred = remaining.findIndex((p) => preference(p) === slot.label)
    slot.playerId = remaining.splice(preferred < 0 ? 0 : preferred, 1)[0]!.id
  }
  return {
    formation: shape.join('-'),
    format: 8 as const,
    slots,
    benchPlayerIds: players.filter((p) => !starters.includes(p.id)).map((p) => p.id),
  }
}

type Request = (
  path: string,
  options?: { method?: 'GET' | 'POST'; body?: unknown; headers?: Record<string, string> },
) => Promise<unknown>
type Plan = {
  id: string
  version: number
  kind: string
  name: string
  isDefault: boolean
  payload: ReturnType<typeof initialSheetLineup>
}
/** A paper's checked names initialize a reusable tactic only; estimated positions never become match appearances. */
export async function initializeSheetLineups(
  workspace: ReportWorkspace,
  starters: { HOME: string[]; AWAY: string[] },
  request: Request,
) {
  const messages: string[] = []
  for (const side of ['HOME', 'AWAY'] as const) {
    const ids = starters[side]
    if (!ids.length) continue
    const team = side === 'HOME' ? workspace.homeTeam : workspace.awayTeam
    const path = `/captain/teams/${team.id}/lineup-plans`
    const plans = (await request(path)) as { items: Plan[] }
    if (plans.items.some((p) => p.isDefault)) {
      messages.push(`${team.name}已有默认阵容，已保留`)
      continue
    }
    const name = '四官表初始首发（站位暂定）'
    const payload = initialSheetLineup(team.players, ids, team.id)
    const previous = plans.items.find(
      (p) =>
        p.kind === 'TACTIC' &&
        p.name === name &&
        JSON.stringify(p.payload) === JSON.stringify(payload),
    )
    const plan =
      previous ??
      ((await request(path, {
        method: 'POST',
        headers: { 'Idempotency-Key': `sheet-${workspace.matchId}-${side}-tactic` },
        body: { name, kind: 'TACTIC', expectedVersion: 0, payload },
      })) as Plan)
    await request(`${path}/${plan.id}/default`, {
      method: 'POST',
      headers: { 'Idempotency-Key': `sheet-${workspace.matchId}-${side}-default` },
      body: { expectedVersion: plan.version },
    })
    messages.push(`${team.name}默认阵容已保存${ids.length < 8 ? '（勾选缺项待核）' : ''}`)
  }
  return messages.join('；')
}
