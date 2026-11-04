import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createMatchOverlayHistory,
  matchRequestFromUrl,
  readMatchRequest,
  type MatchRequest,
} from './navigation.logic.ts'

test('only valid match URLs and requests open a match', () => {
  assert.deepEqual(
    matchRequestFromUrl('/pages/readonly-match-detail/index?matchId=a%2Fb&tournamentId=t'),
    { matchId: 'a/b', tournamentId: 't' },
  )
  assert.equal(matchRequestFromUrl('/pages/player-detail/index?matchId=a'), null)
  assert.equal(readMatchRequest({ matchId: '' }), null)
  assert.equal(readMatchRequest({ matchId: 'a', tournamentId: {} }), null)
  assert.equal(readMatchRequest({ matchId: 'a'.repeat(151) }), null)
})

test('close and browser Back restore the source entry; reopen and switching matches remain bounded', () => {
  const entries: unknown[] = [{ router: 'source' }]
  let index = 0
  let changes = 0
  let current: MatchRequest | null = null
  const history = {
    get state() {
      return entries[index]
    },
    pushState(data: unknown) {
      entries.splice(++index)
      entries[index] = data
    },
    replaceState(data: unknown) {
      entries[index] = data
    },
    back() {
      index--
    },
  }
  const overlay = createMatchOverlayHistory(history, 'test', (next) => {
    changes++
    current = next
  })
  const first = { matchId: 'one', tournamentId: 't' }
  overlay.open(first)
  overlay.open(first)
  assert.equal(entries.length, 2)
  assert.equal(changes, 1)
  overlay.open({ matchId: 'two', tournamentId: 't' })
  assert.equal(entries.length, 2)
  assert.deepEqual(current, { matchId: 'two', tournamentId: 't' })
  overlay.close()
  overlay.pop()
  assert.equal(current, null)
  assert.deepEqual(history.state, { router: 'source' })
  overlay.open(first)
  assert.equal(entries.length, 2)
  history.back()
  overlay.pop()
  assert.equal(current, null)
  overlay.open(first)
  overlay.routeChanged()
  assert.equal(current, null)
  assert.deepEqual(history.state, { router: 'source' })
})

test('rapid close and reopen wait for the asynchronous browser history acknowledgement', () => {
  let state: unknown = { router: 'source' }
  let queuedBack = 0
  let pushes = 0
  let current: MatchRequest | null = null
  const history = {
    get state() {
      return state
    },
    pushState(data: unknown) {
      state = data
      pushes++
    },
    replaceState(data: unknown) {
      state = data
    },
    back() {
      queuedBack++
    },
  }
  const overlay = createMatchOverlayHistory(history, 'test', (request) => {
    current = request
  })
  const first = { matchId: 'one', tournamentId: '' }
  overlay.open(first)
  overlay.close()
  overlay.close()
  overlay.open({ matchId: 'two', tournamentId: '' })
  assert.equal(queuedBack, 1)
  assert.equal(pushes, 1)
  assert.deepEqual(current, first)
  state = { router: 'source' }
  overlay.pop()
  assert.equal(current, null)
  overlay.open(first)
  assert.equal(pushes, 2)
  assert.deepEqual(current, first)
})

test('resource capture releases the history marker while preserving the clicked button until navigation', () => {
  let state: unknown = { router: 'source' }
  let current: MatchRequest | null = null
  let back = 0
  const history = {
    get state() {
      return state
    },
    pushState(value: unknown) {
      state = value
    },
    replaceState(value: unknown) {
      state = value
    },
    back() {
      back++
    },
  }
  const overlay = createMatchOverlayHistory(history, 'test', (next) => {
    current = next
  })
  const request = { matchId: 'one', tournamentId: 't' }
  overlay.open(request)
  overlay.prepareResourceNavigation()
  assert.deepEqual(state, { router: 'source' })
  assert.deepEqual(current, request)
  assert.equal(back, 0)
  overlay.routeChanged()
  assert.equal(current, null)
  assert.equal(back, 0)
})
