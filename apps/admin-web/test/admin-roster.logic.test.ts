import assert from 'node:assert/strict'
import test from 'node:test'

import {
  filterRosterRegistrations,
  hasDataQualityWarning,
  mapRosterRegistrationDetailResponse,
  mapRosterRegistrationListResponse,
} from '../src/features/adminRoster/admin-roster.logic.ts'
import type { RosterRegistrationReview } from '../src/features/adminRoster/types.ts'

const registrations: RosterRegistrationReview[] = [
  createRegistration({
    registrationId: 'registration-a',
    teamCode: 'PHYSICS-A',
    teamName: '星河一队',
    rosterStatus: 'LOCKED',
  }),
  createRegistration({
    registrationId: 'registration-b',
    teamCode: 'PHYSICS-B',
    teamName: '青岚二队',
    rosterStatus: 'APPROVED',
    dataQualityStatus: 'WARNING',
    warningCodes: ['DUPLICATE_SHIRT_NUMBER'],
  }),
  createRegistration({
    registrationId: 'registration-c',
    teamCode: 'PHYSICS-C',
    teamName: '未提交测试队',
    rosterStatus: null,
    rosterSubmissionVersion: null,
    rosterSnapshotVersion: null,
    dataQualityStatus: null,
  }),
]

test('filterRosterRegistrations searches team name and code without mutating input', () => {
  assert.deepEqual(
    filterRosterRegistrations(registrations, ' physics-a ', 'all').map(
      (item) => item.registrationId,
    ),
    ['registration-a'],
  )
  assert.deepEqual(
    filterRosterRegistrations(registrations, '青岚', 'all').map((item) => item.registrationId),
    ['registration-b'],
  )
  assert.equal(registrations.length, 3)
})

test('filterRosterRegistrations applies warning and snapshot filters', () => {
  assert.deepEqual(
    filterRosterRegistrations(registrations, '', 'warnings').map((item) => item.registrationId),
    ['registration-b'],
  )
  assert.deepEqual(
    filterRosterRegistrations(registrations, '', 'locked').map((item) => item.registrationId),
    ['registration-a'],
  )
  assert.deepEqual(
    filterRosterRegistrations(registrations, '', 'unlocked').map((item) => item.registrationId),
    ['registration-b', 'registration-c'],
  )
  assert.equal(hasDataQualityWarning(registrations[0]!), false)
  assert.equal(hasDataQualityWarning(registrations[1]!), true)
})

test('mapRosterRegistrationListResponse keeps only frozen review fields', () => {
  const result = mapRosterRegistrationListResponse({
    items: [
      {
        registrationId: 'registration-a',
        teamId: 'team-a',
        teamCode: 'PHYSICS-A',
        teamName: '星河一队',
        registrationStatus: 'APPROVED',
        rosterStatus: 'LOCKED',
        rosterSubmissionVersion: 2,
        rosterSnapshotVersion: 2,
        playerCount: 18,
        dataQualityStatus: 'CLEAN',
        warningCodes: [],
        contactName: '测试联系人甲',
        contactPhoneMasked: '138****0001',
        contactPhone: 'should-not-be-mapped',
        studentId: 'should-not-be-mapped',
      },
    ],
  })

  assert.equal(result[0]?.contactPhoneMasked, '138****0001')
  assert.equal('contactPhone' in result[0]!, false)
  assert.equal('studentId' in result[0]!, false)
})

test('mapRosterRegistrationListResponse accepts pre-submission nullable states', () => {
  const result = mapRosterRegistrationListResponse({
    items: [
      {
        ...apiRegistration(),
        rosterStatus: null,
        rosterSubmissionVersion: null,
        rosterSnapshotVersion: null,
        dataQualityStatus: null,
      },
    ],
  })

  assert.equal(result[0]?.rosterStatus, null)
  assert.equal(result[0]?.rosterSubmissionVersion, null)
  assert.equal(result[0]?.dataQualityStatus, null)
})

test('mapRosterRegistrationDetailResponse maps public player fields and masked student id', () => {
  const detail = mapRosterRegistrationDetailResponse({
    ...apiRegistration(),
    leaderDisplayName: '测试领队甲',
    coachDisplayName: null,
    importBatchId: 'batch-a',
    importedAt: '2026-08-20T02:00:00.000Z',
    players: [
      {
        id: 'player-a',
        displayName: '测试球员甲',
        studentIdMasked: '2026****01',
        shirtNumber: '01',
        phone: 'should-not-be-mapped',
      },
    ],
  })

  assert.deepEqual(detail.players, [
    {
      id: 'player-a',
      displayName: '测试球员甲',
      studentIdMasked: '2026****01',
      shirtNumber: '01',
    },
  ])
  assert.equal(detail.importBatchId, 'batch-a')
  assert.equal(detail.coachDisplayName, null)
})

test('mapping rejects responses that drift from the frozen contract', () => {
  assert.throws(
    () => mapRosterRegistrationListResponse([]),
    /名单 API 契约错误：名单列表响应不是对象/,
  )
  assert.throws(
    () => mapRosterRegistrationDetailResponse({ ...apiRegistration(), players: null }),
    /名单详情响应缺少 players 数组/,
  )
})

function createRegistration(
  overrides: Partial<RosterRegistrationReview>,
): RosterRegistrationReview {
  return {
    registrationId: 'registration-default',
    teamId: 'team-default',
    teamCode: 'TEAM-DEFAULT',
    teamName: '测试球队',
    registrationStatus: 'APPROVED',
    rosterStatus: 'LOCKED',
    rosterSubmissionVersion: 1,
    rosterSnapshotVersion: 1,
    playerCount: 18,
    dataQualityStatus: 'CLEAN',
    warningCodes: [],
    contactName: '测试联系人',
    contactPhoneMasked: '138****0000',
    ...overrides,
  }
}

function apiRegistration(): Record<string, unknown> {
  return {
    registrationId: 'registration-a',
    teamId: 'team-a',
    teamCode: 'PHYSICS-A',
    teamName: '星河一队',
    registrationStatus: 'APPROVED',
    rosterStatus: 'LOCKED',
    rosterSubmissionVersion: 1,
    rosterSnapshotVersion: 1,
    playerCount: 1,
    dataQualityStatus: 'CLEAN',
    warningCodes: [],
    contactName: '测试联系人甲',
    contactPhoneMasked: '138****0001',
  }
}
