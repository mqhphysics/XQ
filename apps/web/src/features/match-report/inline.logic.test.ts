import assert from 'node:assert/strict'
import test from 'node:test'
import { emptyFields } from './logic.ts'
import {
  changeInlineScore,
  resizeEventRows,
  orderedReportEvents,
  scoringSide,
  eventsByConfirmedClock,
} from './inline.logic.ts'
import type { ReportEvent } from './types.ts'

test('editing time does not move an event until its confirmed clock is updated', () => {
  const rows: ReportEvent[] = [12, 35].map((minute, index) => ({
    id: String(index),
    kind: 'GOAL',
    side: 'HOME',
    minute: String(minute),
    addedMinute: '',
    playerId: '',
    relatedPlayerId: '',
  }))
  const clocks = { '0': { minute: '12', addedMinute: '' }, '1': { minute: '35', addedMinute: '' } }
  rows[0]!.minute = '65'
  assert.deepEqual(
    eventsByConfirmedClock(rows, clocks).map((row) => row.id),
    ['0', '1'],
  )
  assert.deepEqual(
    eventsByConfirmedClock(rows, { ...clocks, '0': { minute: '65', addedMinute: '' } }).map(
      (row) => row.id,
    ),
    ['1', '0'],
  )
})

test('score and quantity changes generate exactly the required rows, keeping filled facts ahead of placeholders', () => {
  let sequence = 0
  const id = () => `new-${++sequence}`
  let fields = changeInlineScore(emptyFields(), 'HOME', '2', id)
  fields.events[0] = { ...fields.events[0]!, minute: '14', playerId: 'home-player' }
  fields = resizeEventRows(fields, 'YELLOW_CARD', 'AWAY', 1, id)
  fields = changeInlineScore(fields, 'HOME', '1', id)
  assert.equal(fields.events.filter((event) => event.kind === 'GOAL').length, 1)
  assert.equal(fields.events[0]!.minute, '14')
  assert.equal(fields.events.filter((event) => event.kind === 'YELLOW_CARD').length, 1)
  fields = changeInlineScore(fields, 'HOME', '', id)
  assert.equal(fields.events.filter((event) => event.kind === 'GOAL').length, 1)
})

test('own goals count for the other side and changing one team does not discard the other team events', () => {
  const own: ReportEvent = {
    id: 'own',
    kind: 'OWN_GOAL',
    side: 'AWAY',
    minute: '35',
    addedMinute: '',
    playerId: 'away',
    relatedPlayerId: '',
  }
  const fields = { ...emptyFields(), homeScore: '1', awayScore: '0', events: [own] }
  assert.equal(scoringSide(own), 'HOME')
  const grown = changeInlineScore(fields, 'HOME', '2', () => 'next')
  assert.equal(grown.events.length, 2)
  assert.equal(grown.events[0]!.kind, 'OWN_GOAL')
})

test('changing minutes reorders display by minute and stoppage time, without mutating input or replacing identities', () => {
  const rows: ReportEvent[] = ['65', '', '12', '12'].map((minute, index) => ({
    id: String(index),
    kind: 'GOAL',
    side: 'HOME',
    minute,
    addedMinute: index === 2 ? '2' : '',
    playerId: '',
    relatedPlayerId: '',
  }))
  const snapshot = JSON.stringify(rows)
  assert.deepEqual(
    orderedReportEvents(rows).map((event) => event.id),
    ['3', '2', '0', '1'],
  )
  assert.equal(JSON.stringify(rows), snapshot)
})
