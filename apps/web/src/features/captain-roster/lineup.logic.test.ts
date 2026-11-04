import assert from 'node:assert/strict'
import test from 'node:test'
import {
  assignPlayer,
  createFormation,
  clearStarters,
  draftStorageKey,
  fillByPosition,
  FORMATIONS,
  groupLineupPlayers,
  moveSlot,
  restoreDraft,
  selectSavedLineupPlan,
} from './lineup.logic.ts'

const players = Array.from({ length: 14 }, (_, i) => ({
  id: `player-${i}`,
  displayName: 'DEMO_FIXTURE 同名球员',
  shirtNumber: String(i + 1),
  avatarUrl: null,
  position: i === 0 ? 'GOALKEEPER' : i < 5 ? 'DEFENDER' : i < 10 ? 'MIDFIELDER' : 'FORWARD',
}))
test('every offered formation has eight positions and switching keeps starters and goalkeeper', () => {
  const initial = fillByPosition(createFormation(), players)
  assert.equal(initial.slots.length, 8)
  assert.ok(FORMATIONS.every((formation) => formation.format === 8))
  for (const formation of FORMATIONS) {
    const changed = createFormation(formation.name, initial)
    assert.deepEqual(
      changed.slots.flatMap((slot) => (slot.playerId ? [slot.playerId] : [])).sort(),
      initial.slots.flatMap((slot) => (slot.playerId ? [slot.playerId] : [])).sort(),
    )
    assert.equal(changed.slots.find((slot) => slot.label === 'GK')!.playerId, 'player-0')
    assert.equal(changed.slots.length, 8)
  }
  assert.equal(createFormation('4-3-3', initial).slots.length, 8)
})
test('occupied drops swap identities; bench replacement demotes the displaced player; removing never creates duplicates', () => {
  const initial = fillByPosition(createFormation(), players)
  const first = initial.slots[0]!,
    second = initial.slots[1]!
  const swapped = assignPlayer(initial, first.playerId!, second.id)
  assert.equal(swapped.slots[0]!.playerId, second.playerId)
  assert.equal(swapped.slots[1]!.playerId, first.playerId)
  const replaced = assignPlayer(swapped, 'player-13', second.id)
  assert.equal(replaced.slots[1]!.playerId, 'player-13')
  assert.equal(
    replaced.slots.some((slot) => slot.playerId === first.playerId),
    false,
  )
  const removed = assignPlayer(replaced, 'player-13', null)
  assert.equal(removed.slots[1]!.playerId, null)
  assert.equal(assignPlayer(initial, first.playerId!, 'missing'), initial)
  assert.equal(new Set(swapped.slots.map((slot) => slot.playerId)).size, 8)
})
test('draft restore removes departed players and duplicates, clamps coordinates and rejects malformed storage', () => {
  const initial = fillByPosition(createFormation(), players)
  initial.slots[0]!.x = -100
  initial.slots[1]!.playerId = initial.slots[0]!.playerId
  const restored = restoreDraft(initial, players.slice(1))!
  assert.equal(restored.slots[0]!.x, 8)
  assert.equal(restored.slots[1]!.playerId, null)
  assert.equal(
    restored.slots.some((slot) => slot.playerId === 'player-0'),
    false,
  )
  assert.equal(restoreDraft({ ...initial, slots: [initial.slots[0]] }, players), null)
  assert.equal(
    restoreDraft(
      { ...initial, slots: initial.slots.map((slot) => ({ ...slot, id: 'duplicate' })) },
      players,
    ),
    null,
  )
  assert.equal(restoreDraft(null, players), null)
  assert.notEqual(
    draftStorageKey('org', 'account-A', 'tournament', 'team'),
    draftStorageKey('org', 'account-B', 'tournament', 'team'),
  )
})
test('custom positioning remains in the pitch and rejects nonfinite gesture coordinates', () => {
  const draft = createFormation()
  const moved = moveSlot(draft, draft.slots[0]!.id, -20, 120)
  assert.equal(moved.custom, true)
  assert.equal(moved.slots[0]!.x, 8)
  assert.equal(moved.slots[0]!.y, 91)
  assert.equal(moveSlot(draft, draft.slots[0]!.id, NaN, 10), draft)
})

test('legacy non-eight drafts are not silently promoted to a new starting lineup', () => {
  const draft = createFormation()
  for (const size of [5, 7, 11]) {
    const slots = Array.from({ length: size }, (_, index) => ({
      ...draft.slots[index % 8]!,
      id: `legacy-${index}`,
    }))
    assert.equal(restoreDraft({ ...draft, slots }, players), null)
  }
})
test('eight starters, one substitute and one unassigned survive restore without silently adding bench players', () => {
  const squad = players.slice(0, 10)
  const draft = { ...createFormation('3-3-1'), benchPlayerIds: [squad[8]!.id] }
  draft.slots = draft.slots.map((slot, index) => ({ ...slot, playerId: squad[index]!.id }))
  draft.slots[0]!.x = 0
  draft.slots[0]!.y = 100
  const restored = restoreDraft(draft, squad)!
  // Restore always normalises the captain: missing or departed becomes null, a squad member survives.
  assert.deepEqual(restored, { ...draft, captainPlayerId: null })
  assert.equal(
    restoreDraft({ ...draft, captainPlayerId: squad[2]!.id }, squad)!.captainPlayerId,
    squad[2]!.id,
  )
  assert.equal(
    restoreDraft({ ...draft, captainPlayerId: 'departed' }, squad)!.captainPlayerId,
    null,
  )
  assert.equal(restored.benchPlayerIds!.includes(squad[9]!.id), false)
  const swapped = assignPlayer(restored, squad[8]!.id, restored.slots[0]!.id)
  assert.deepEqual(swapped.benchPlayerIds, [squad[0]!.id])
})

test('new and legacy eight-a-side plans do not select registered players implicitly', () => {
  const empty = createFormation('3-3-1')
  const groups = groupLineupPlayers(empty, players)
  assert.equal(empty.slots.length, 8)
  assert.equal(groups.starters.length, 0)
  assert.equal(groups.substitutes.length, 0)
  assert.equal(groups.unselected.length, 14)
  const { benchPlayerIds: _legacyBench, ...legacy } = empty
  const restored = restoreDraft(legacy, players)!
  assert.deepEqual(restored.benchPlayerIds, [])
  assert.equal(groupLineupPlayers(restored, players).unselected.length, 14)
})

test('clearing an eight-a-side starting lineup moves only selected starters to substitutes', () => {
  const lineup = fillByPosition(createFormation('3-3-1'), players)
  lineup.benchPlayerIds = ['player-13']
  const result = clearStarters(lineup)
  const groups = groupLineupPlayers(result, players)
  assert.equal(groups.starters.length, 0)
  assert.equal(groups.substitutes.length, 9)
  assert.equal(groups.unselected.length, 5)
  assert.equal(new Set(result.benchPlayerIds).size, 9)
  const restored = restoreDraft(result, players)!
  assert.deepEqual(groupLineupPlayers(restored, players), groups)
})

test('refresh chooses the selected server plan or the most recently saved relevant plan', () => {
  const plans = [
    { id: 'old', tournamentId: 'current', updatedAt: '2026-10-03T10:00:00Z' },
    { id: 'other', tournamentId: 'other', updatedAt: '2026-10-03T13:00:00Z' },
    { id: 'new', tournamentId: 'current', updatedAt: '2026-10-03T12:00:00Z' },
    { id: 'general', tournamentId: null, updatedAt: '2026-10-03T11:00:00Z' },
  ]
  assert.equal(selectSavedLineupPlan(plans, 'current', 'old')?.id, 'old')
  assert.equal(selectSavedLineupPlan(plans, 'current', 'missing')?.id, 'new')
  assert.equal(selectSavedLineupPlan(plans, 'current', 'other')?.id, 'new')
  assert.equal(selectSavedLineupPlan([], 'current', 'old'), undefined)
})

test('refresh opens the team default when no explicit saved plan was selected', () => {
  const plans = [
    { id: 'recent-match', tournamentId: 'current', updatedAt: '2026-10-04T12:00:00Z' },
    { id: 'team-default', tournamentId: null, updatedAt: '2026-10-03T12:00:00Z', isDefault: true },
  ]
  assert.equal(selectSavedLineupPlan(plans, 'current', '')?.id, 'team-default')
  assert.equal(selectSavedLineupPlan(plans, 'current', 'recent-match')?.id, 'recent-match')
})
