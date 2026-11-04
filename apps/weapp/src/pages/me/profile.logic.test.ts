import assert from 'node:assert/strict'
import test from 'node:test'
import {
  calendarEvent,
  canRemind,
  emptyLibrary,
  libraryKey,
  managedTeamIds,
  parseLibrary,
} from './profile.logic.ts'
import type { AuthUser, MatchSummary } from '../../features/product/product.types'

const user = { id: 'user-1', organizationId: 'org-1', roles: [] } as unknown as AuthUser
const now = Date.parse('2026-10-02T08:00:00Z')
const match = {
  id: 'match-1',
  status: 'SCHEDULED',
  scheduledStartAt: '2026-10-04T11:00:00Z',
  title: '决赛',
  homeTeam: { name: '甲,队;一\\号\n测试' },
  awayTeam: { name: '乙队' },
  venue: { name: '东区球场' },
} as MatchSummary

test('browser libraries are isolated by both organization and account', () => {
  assert.notEqual(libraryKey(user), libraryKey({ ...user, id: 'user-2' }))
  assert.notEqual(libraryKey(user), libraryKey({ ...user, organizationId: 'org-2' }))
  assert.deepEqual(parseLibrary(null), emptyLibrary())
})
test('invalid library versions and corrupted IDs fail visibly instead of reporting successful saves', () => {
  assert.throws(() => parseLibrary('{broken'))
  assert.throws(() => parseLibrary(JSON.stringify({ ...emptyLibrary(), version: 2 })))
  assert.throws(() => parseLibrary(JSON.stringify({ ...emptyLibrary(), followedMatchIds: [3] })))
  assert.deepEqual(
    parseLibrary(JSON.stringify({ ...emptyLibrary(), bookmarkedPostIds: ['a', 'a'] }))
      .bookmarkedPostIds,
    ['a'],
  )
})
test('captain management uses role scope and works even if the preferred team differs or is absent from the featured tournament', () => {
  assert.deepEqual(
    managedTeamIds(
      { ...user, roles: [{ role: 'TEAM_CAPTAIN', scopeType: 'TEAM', scopeId: 'managed-team' }] },
      ['preferred-team'],
    ),
    ['managed-team'],
  )
  assert.deepEqual(
    managedTeamIds(
      { ...user, roles: [{ role: 'TEAM_CAPTAIN', scopeType: 'ORGANIZATION', scopeId: 'org-1' }] },
      ['preferred-team'],
    ),
    [],
  )
  assert.deepEqual(managedTeamIds(user, ['preferred-team']), [])
})
test('organization management requires the current organization scope', () => {
  const roles = [{ role: 'ORGANIZATION_ADMIN', scopeType: 'ORGANIZATION', scopeId: 'org-2' }]
  assert.deepEqual(managedTeamIds({ ...user, roles }, ['team']), [])
  assert.deepEqual(
    managedTeamIds({ ...user, roles: [{ ...roles[0]!, scopeId: 'org-1' }] }, ['team']),
    ['team'],
  )
})

test('coach management is team scoped and does not depend on linked player or displayed badge', () => {
  const coach = { ...user, roles: [{ role: 'TEAM_COACH', scopeType: 'TEAM', scopeId: 'own-team' }] }
  assert.deepEqual(managedTeamIds(coach, ['other-team']), ['own-team'])
  assert.deepEqual(
    managedTeamIds({ ...coach, roles: [{ ...coach.roles[0]!, scopeType: 'ORGANIZATION' }] }, [
      'other-team',
    ]),
    [],
  )
  assert.deepEqual(
    managedTeamIds({ ...user, verificationLevel: 'PLAYER_CONFIRMED' }, ['other-team']),
    [],
  )
})
test('calendar reminder exports UTC times, escapes content, and includes a 15 minute alarm', () => {
  const ics = calendarEvent(match, now)
  assert.match(ics, /DTSTART:20261004T110000Z\r\n/)
  assert.match(ics, /DTEND:20261004T130000Z\r\n/)
  assert.match(ics, /TRIGGER:-PT15M/)
  assert.ok(ics.includes('SUMMARY:甲\\,队\\;一\\\\号\\n测试 vs 乙队'))
  assert.ok(ics.endsWith('END:VCALENDAR\r\n'))
})
test('past, unscheduled, postponed and ended matches cannot produce a calendar reminder', () => {
  for (const invalid of [
    { ...match, scheduledStartAt: null },
    { ...match, scheduledStartAt: '2026-09-02T11:00:00Z' },
    { ...match, status: 'POSTPONED' as const },
    { ...match, status: 'FINISHED' as const },
    { ...match, scheduledStartAt: 'invalid' },
  ]) {
    assert.equal(canRemind(invalid, now), false)
    assert.throws(() => calendarEvent(invalid, now))
  }
})
