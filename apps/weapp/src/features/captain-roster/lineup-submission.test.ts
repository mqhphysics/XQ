import assert from 'node:assert/strict'
import test from 'node:test'
import {
  readPendingLineup,
  submitPendingLineup,
  type PendingLineupSubmission,
} from './lineup-submission.ts'
import type { LineupPlanView, SaveLineupPlan } from './lineup-plan.repository'

const input = {
  name: 'TEST',
  expectedVersion: 0,
  payload: { slots: [] },
} as unknown as SaveLineupPlan
const saved = { id: 'fictional-plan', version: 1 } as LineupPlanView

test('a saved lineup whose response is lost uses the original command after restart', async () => {
  const command: PendingLineupSubmission = {
    phase: 'SAVE',
    key: 'save-original',
    input,
    defaultKey: null,
  }
  const rows = new Map<string, LineupPlanView>()
  let calls = 0
  const api = {
    save: async (_input: SaveLineupPlan, key: string) => {
      rows.set(key, rows.get(key) ?? saved)
      if (++calls === 1) throw new Error('response lost')
      return rows.get(key)!
    },
    publish: async () => {
      throw new Error('unexpected default publication')
    },
  }
  await assert.rejects(submitPendingLineup(command, api, () => {}))
  const restored = readPendingLineup(JSON.parse(JSON.stringify(command)))!
  assert.equal((await submitPendingLineup(restored, api, () => {})).id, saved.id)
  assert.equal(rows.size, 1)
  assert.equal(calls, 2)
})

test('default publication resumes its persisted second step without saving again', async () => {
  let current: PendingLineupSubmission = {
    phase: 'SAVE',
    key: 'save-original',
    input,
    defaultKey: 'default-original',
  }
  let saves = 0
  const defaults: string[] = []
  const api = {
    save: async () => {
      saves++
      return saved
    },
    publish: async (plan: LineupPlanView, key: string) => {
      assert.equal(plan.version, 1)
      defaults.push(key)
      if (defaults.length === 1) throw new Error('response lost')
      return { ...plan, isDefault: true }
    },
  }
  const checkpoint = (next: PendingLineupSubmission) => {
    current = JSON.parse(JSON.stringify(next))
  }
  await assert.rejects(submitPendingLineup(current, api, checkpoint))
  assert.equal(current.phase, 'DEFAULT')
  assert.equal((await submitPendingLineup(current, api, checkpoint)).isDefault, true)
  assert.equal(saves, 1)
  assert.deepEqual(defaults, ['default-original', 'default-original'])
})

test('failed local checkpoint prevents default publication, while replaying save remains safe', async () => {
  let publishes = 0
  await assert.rejects(
    submitPendingLineup(
      { phase: 'SAVE', key: 'save', input, defaultKey: 'publish' },
      {
        save: async () => saved,
        publish: async () => {
          publishes++
          return saved
        },
      },
      () => {
        throw new Error('storage full')
      },
    ),
    /storage full/,
  )
  assert.equal(publishes, 0)
  assert.equal(readPendingLineup({ phase: 'DEFAULT', key: 'key', plan: {} }), null)
})
