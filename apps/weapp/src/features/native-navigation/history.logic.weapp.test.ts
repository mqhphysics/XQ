import assert from 'node:assert/strict'
import test from 'node:test'
import {
  appendDetail,
  moveDetail,
  swipeDirection,
  indicatorPosition,
  nextIndicatorMotion,
  type DetailHistory,
} from './history.logic.weapp.ts'
test('the indicator continues from its current position without resetting to a cached tab', () => {
  const first = nextIndicatorMotion({ from: 0, to: 0, at: 0, duration: 0 }, 3, 100)
  const current = indicatorPosition(first, 200)
  assert.ok(current > 0 && current < 3)
  const next = nextIndicatorMotion(first, 4, 200)
  assert.equal(next.from, current)
  const positions = [200, 240, 280, 360, 440].map((at) => indicatorPosition(next, at))
  assert.ok(positions.every((value, index) => !index || value >= positions[index - 1]!))
  assert.equal(positions.at(-1), 4)
})
test('detail back and forward retain order, tab state and scroll position', () => {
  let history: DetailHistory = { entries: [], cursor: -1 }
  history = appendDetail(history, { id: 1, url: 'team', scroll: 235, state: { tab: 2 } })
  history = appendDetail(history, { id: 2, url: 'player', scroll: 480, state: { tab: 1 } })
  history = moveDetail(history, -1)
  assert.equal(history.entries[history.cursor]?.url, 'team')
  assert.equal(history.entries[history.cursor]?.scroll, 235)
  history = moveDetail(history, 1)
  assert.equal(history.entries[history.cursor]?.url, 'player')
  assert.deepEqual(history.entries[history.cursor]?.state, { tab: 1 })
})
test('opening a different detail after going back discards the old forward branch', () => {
  const first = { id: 1, url: 'team', scroll: 0, state: {} }
  const before: DetailHistory = {
    entries: [first, { id: 2, url: 'old-player', scroll: 0, state: {} }],
    cursor: 0,
  }
  const next = appendDetail(before, { id: 3, url: 'new-match', scroll: 0, state: {} })
  assert.deepEqual(
    next.entries.map((entry) => entry.url),
    ['team', 'new-match'],
  )
  assert.equal(moveDetail(next, 1), next)
  assert.equal(moveDetail(moveDetail(next, -1), -1).cursor, -1)
})
test('vertical scrolling and taps stay put; deliberate horizontal drags also work when slow', () => {
  const start = { x: 180, y: 250, at: 0 }
  assert.equal(swipeDirection(start, { x: 230, y: 500, at: 400 }), 0)
  assert.equal(swipeDirection(start, { x: 184, y: 250, at: 100 }), 0)
  assert.equal(swipeDirection(start, { x: 280, y: 250, at: 1500 }), -1)
  assert.equal(swipeDirection(start, { x: 80, y: 255, at: 250 }), 1)
  assert.equal(swipeDirection(start, { x: 280, y: 255, at: 250 }), -1)
})
