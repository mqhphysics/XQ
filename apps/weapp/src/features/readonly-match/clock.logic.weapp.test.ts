import assert from 'node:assert/strict'
import test from 'node:test'
import { clockDigits, projectMatchClock, type MatchClockSnapshot } from './clock.logic.weapp.ts'

const clock: MatchClockSnapshot = {
  serverNow: '2026-11-07T04:35:00Z',
  scheduledStartAt: '2026-11-07T04:20:00Z',
  autoStartsAt: '2026-11-07T04:30:00Z',
  startedAt: '2026-11-07T04:25:00Z',
  startSource: 'AUTO',
  phase: 'FIRST_HALF',
  periodMinutes: 20,
  intervalMinutes: 10,
  periods: 2,
  elapsedSeconds: 600,
  phaseElapsedSeconds: 600,
  expectedEndAt: '2026-11-07T05:15:00Z',
  halfTimeStartsAt: '2026-11-07T04:45:00Z',
  secondHalfStartsAt: '2026-11-07T04:55:00Z',
  endedAt: null,
  canStart: false,
}
test('clock ticks from the server anchor, pauses playing time during interval, then resumes cumulatively', () => {
  assert.equal(
    projectMatchClock({ ...clock, serverNow: '2026-11-07T04:30:00Z' }, 0).elapsedSeconds,
    300,
  )
  assert.deepEqual(projectMatchClock(clock, 2000), {
    phase: 'FIRST_HALF',
    elapsedSeconds: 602,
    phaseElapsedSeconds: 602,
  })
  assert.deepEqual(projectMatchClock(clock, 10 * 60000), {
    phase: 'HALF_TIME',
    elapsedSeconds: 1200,
    phaseElapsedSeconds: 0,
  })
  assert.deepEqual(projectMatchClock(clock, 20 * 60000), {
    phase: 'SECOND_HALF',
    elapsedSeconds: 1200,
    phaseElapsedSeconds: 0,
  })
  assert.deepEqual(projectMatchClock(clock, 40 * 60000), {
    phase: 'FINISHED',
    elapsedSeconds: 2400,
    phaseElapsedSeconds: 1200,
  })
})
test('a pending or unavailable match never auto-starts locally, and a finished clock stays fixed', () => {
  assert.deepEqual(
    projectMatchClock(
      {
        ...clock,
        phase: 'PENDING',
        startSource: 'PENDING',
        startedAt: null,
        elapsedSeconds: 0,
        phaseElapsedSeconds: 0,
      },
      3600000,
    ),
    { phase: 'PENDING', elapsedSeconds: 0, phaseElapsedSeconds: 0 },
  )
  assert.equal(projectMatchClock({ ...clock, phase: 'UNAVAILABLE' }, 3600000).phase, 'UNAVAILABLE')
  assert.equal(
    projectMatchClock({ ...clock, phase: 'FINISHED', elapsedSeconds: 2400 }, 3600000)
      .elapsedSeconds,
    2400,
  )
})
test('manual starts use the saved start time and display a stable minutes:seconds value', () => {
  assert.equal(
    projectMatchClock(
      {
        ...clock,
        startSource: 'MANUAL',
        startedAt: '2026-11-07T04:25:00Z',
        expectedEndAt: '2026-11-07T05:15:00Z',
      },
      1000,
    ).elapsedSeconds,
    601,
  )
  assert.equal(clockDigits(601), '10:01')
  assert.equal(clockDigits(3601), '60:01')
  assert.equal(clockDigits(-2), '00:00')
})
