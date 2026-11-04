import assert from 'node:assert/strict'
import test from 'node:test'
import {
  initialSheetLineup,
  initializeSheetLineups,
} from '../src/features/adminWorkflows/sheet-lineup.logic.ts'
import type { ReportWorkspace } from '../src/features/adminWorkflows/types.ts'

const players = Array.from({ length: 12 }, (_, i) => ({
  id: `player-${i}`,
  displayName: `示例${i}`,
  shirtNumber: String(i + 1),
}))
test('initial tactics use exactly the checked players and leave missing starting places empty', () => {
  const ids = players.slice(0, 6).map((p) => p.id)
  const result = initialSheetLineup(players, ids, 'team-a')
  assert.equal(result.slots.length, 8)
  assert.deepEqual(
    result.slots.flatMap((s) => (s.playerId ? [s.playerId] : [])).sort(),
    [...ids].sort(),
  )
  assert.equal(result.slots.filter((s) => !s.playerId).length, 2)
  assert.equal(result.slots[0]?.playerId, 'player-0')
  assert.equal(
    new Set([
      ...result.slots.flatMap((s) => (s.playerId ? [s.playerId] : [])),
      ...result.benchPlayerIds,
    ]).size,
    12,
  )
  assert.deepEqual(result, initialSheetLineup(players, ids, 'team-a'))
  assert.throws(() => initialSheetLineup(players, ['outside'], 'team-a'), /本队名单/)
})
test('sheet initialization preserves an existing default and creates a tactic only for a team without one', async () => {
  const workspace = {
    matchId: 'match-one',
    homeTeam: { id: 'home', name: '主队', players },
    awayTeam: { id: 'away', name: '客队', players },
  } as ReportWorkspace
  const calls: { path: string; body?: unknown }[] = []
  await initializeSheetLineups(
    workspace,
    { HOME: ['player-0'], AWAY: ['player-1'] },
    async (path, options) => {
      calls.push({ path, ...(options?.body ? { body: options.body } : {}) })
      if (!options?.method) return { items: path.includes('/home/') ? [{ isDefault: true }] : [] }
      return { id: 'created', version: 1 }
    },
  )
  assert.equal(calls.filter((c) => c.path.includes('/home/')).length, 1)
  const saved = calls.find((c) => c.path === '/captain/teams/away/lineup-plans' && c.body)
    ?.body as { kind: string; payload: ReturnType<typeof initialSheetLineup> }
  assert.equal(saved.kind, 'TACTIC')
  assert.equal(saved.payload.slots.filter((s) => s.playerId).length, 1)
  assert.equal(calls.at(-1)?.path, '/captain/teams/away/lineup-plans/created/default')
})
