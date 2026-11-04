import assert from 'node:assert/strict'
import test from 'node:test'
import { createFormation, assignPlayer, restoreDraft } from './lineup.logic.ts'
import {
  compactNativeFormation,
  nativeLineupBackupKey,
  readNativeLineupBackup,
  nativeLineupName,
} from './lineup-native.logic.weapp.ts'

test('automatic lineup labels are concise while custom names remain intact', () => {
  assert.equal(nativeLineupName('默认阵容（可调整）'), '默认阵容')
  assert.equal(nativeLineupName('默认阵容'), '默认阵容')
  assert.equal(nativeLineupName('四官表初始首发（站位暂定）'), '默认阵容')
  assert.equal(nativeLineupName('决赛首发'), '决赛首发')
})

test('native 3-2-2 rows stay symmetric and move in from both sidelines', () => {
  const draft = compactNativeFormation(createFormation('3-2-2'))
  for (const [y, xs] of [
    [18, [34, 66]],
    [42, [34, 66]],
    [68, [25, 50, 75]],
    [88, [50]],
  ] as const) {
    assert.deepEqual(
      draft.slots.filter((s) => s.y === y).map((s) => s.x),
      xs,
    )
  }
  assert.deepEqual(compactNativeFormation(draft), draft)
})

test('compact layout retains assigned players and does not move custom tactics', () => {
  const initial = assignPlayer(createFormation('3-2-2'), 'p-1', 'LS')
  assert.equal(compactNativeFormation(initial).slots.find((s) => s.id === 'LS')!.playerId, 'p-1')
  const custom = { ...initial, custom: true }
  assert.equal(compactNativeFormation(custom), custom)
  const positioned = {
    ...initial,
    slots: initial.slots.map((s) => (s.id === 'LS' ? { ...s, x: 30 } : s)),
  }
  assert.equal(compactNativeFormation(positioned).slots.find((s) => s.id === 'LS')!.x, 30)
  assert.equal(compactNativeFormation(positioned).slots.find((s) => s.id === 'RS')!.x, 88)
})

test('local lineup backup round trips identities, name and base version; scope never crosses accounts or events', () => {
  const draft = compactNativeFormation(assignPlayer(createFormation('3-2-2'), 'p-1', 'LS'))
  const value = JSON.parse(
    JSON.stringify({ schemaVersion: 1, planId: 'plan-1', baseVersion: 4, name: '战术草稿', draft }),
  )
  const recovered = readNativeLineupBackup(value)!
  assert.equal(recovered.name, '战术草稿')
  assert.equal(recovered.baseVersion, 4)
  assert.equal(
    restoreDraft(recovered.draft, [
      {
        id: 'p-1',
        displayName: 'DEMO_FIXTURE 球员',
        shirtNumber: '7',
        avatarUrl: null,
        position: null,
      },
    ])!.slots[0]!.playerId,
    'p-1',
  )
  const base = nativeLineupBackupKey('o', 'u', 't', 'cup')
  for (const ids of [
    ['o2', 'u', 't', 'cup'],
    ['o', 'u2', 't', 'cup'],
    ['o', 'u', 't2', 'cup'],
    ['o', 'u', 't', 'cup2'],
  ]) {
    assert.notEqual(nativeLineupBackupKey(ids[0]!, ids[1]!, ids[2]!, ids[3]!), base)
  }
  assert.equal(readNativeLineupBackup({ ...value, baseVersion: '4' }), null)
  assert.equal(readNativeLineupBackup({ ...value, schemaVersion: 2 }), null)
})
