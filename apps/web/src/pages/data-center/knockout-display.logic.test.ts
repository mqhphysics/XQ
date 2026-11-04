import assert from 'node:assert/strict'
import test from 'node:test'
import { knockoutMatchTime, matchWinnerId, knockoutRounds } from './knockout-display.logic.ts'
import type { CompetitionDataResponse, MatchSummary } from '../../features/product/product.types'

test('dates stay short and use the campus time zone including midnight boundaries', () => {
  assert.equal(knockoutMatchTime('2026-09-01T02:00:00Z'), '09/01 10:00')
  assert.equal(knockoutMatchTime('2026-09-01T02:00:00Z', true), '09/01')
  assert.equal(knockoutMatchTime('2026-08-31T16:00:00Z'), '09/01 00:00')
})

test('missing or invalid kickoff times remain explicitly pending', () => {
  assert.equal(knockoutMatchTime(null), '时间待定')
  assert.equal(knockoutMatchTime('invalid'), '时间待定')
})

test('Android can initialize the knockout module without Intl and retain UTC+8 dates', async () => {
  const intlProperty = Object.getOwnPropertyDescriptor(globalThis, 'Intl')!
  Object.defineProperty(globalThis, 'Intl', { configurable: true, value: undefined })
  try {
    const moduleUrl = new URL('./knockout-display.logic.ts', import.meta.url)
    moduleUrl.search = '?android-without-intl'
    const androidModule: { knockoutMatchTime: typeof knockoutMatchTime } = await import(
      moduleUrl.href
    )
    assert.equal(androidModule.knockoutMatchTime('2026-08-31T16:00:00Z'), '09/01 00:00')
    assert.equal(androidModule.knockoutMatchTime('2026-12-31T16:30:00Z'), '01/01 00:30')
  } finally {
    Object.defineProperty(globalThis, 'Intl', intlProperty)
  }
})

const match = {
  id: 'match',
  matchCode: 'FINAL',
  title: '决赛',
  homeTeam: { id: 'home' },
  awayTeam: { id: 'away' },
  status: 'FINISHED',
  homeScore: 1,
  awayScore: 1,
  homePenaltyScore: null,
  awayPenaltyScore: null,
} as MatchSummary
test('only completed decisive results fade an eliminated team, including shootouts', () => {
  assert.equal(matchWinnerId(match), null)
  assert.equal(matchWinnerId({ ...match, status: 'LIVE', homeScore: 3 }), null)
  assert.equal(matchWinnerId({ ...match, homeScore: 2 }), 'home')
  assert.equal(matchWinnerId({ ...match, homePenaltyScore: 3, awayPenaltyScore: 4 }), 'away')
})
test('the portrait layout requires exactly 4-2-1 matches and separates third place', () => {
  const data = {
    bracket: [
      {
        id: 'quarter',
        number: 2,
        matches: Array.from({ length: 4 }, (_, i) => ({
          ...match,
          id: `q${i}`,
          matchCode: `QF-${i}`,
        })),
      },
      {
        id: 'semi',
        number: 3,
        matches: Array.from({ length: 2 }, (_, i) => ({
          ...match,
          id: `s${i}`,
          matchCode: `SF-${i}`,
        })),
      },
      {
        id: 'final',
        number: 4,
        matches: [match, { ...match, id: 'third', matchCode: 'CUP-THIRD', title: '三四名赛' }],
      },
    ],
  } as CompetitionDataResponse
  assert.equal(knockoutRounds(data).eightTeam, true)
  assert.equal(knockoutRounds(data).thirdPlace?.id, 'third')
  assert.equal(
    knockoutRounds({ ...data, bracket: [{ ...data.bracket[0]!, matches: [match] }] }).eightTeam,
    false,
  )
})
