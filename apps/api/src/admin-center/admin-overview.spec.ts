import assert from 'node:assert/strict'
import test from 'node:test'
import { AdminCenterService } from './admin-center.service'
import { AccessPolicyService } from '../auth/access-policy.service'
import type { PrismaService } from '../database/prisma.service'
import type { AuthService, AuthenticatedSession } from '../auth/auth.service'
import type { MediaService } from '../media/media.service'
import { centerError } from './admin-center.policy'

const org = '00000000-0000-4000-8000-000000000091'
const other = '00000000-0000-4000-8000-000000000099'
type RecordData = Record<string, unknown>
function matches(row: RecordData, where: RecordData): boolean {
  return Object.entries(where).every(([key, condition]) => {
    if (key === 'OR') return (condition as RecordData[]).some((entry) => matches(row, entry))
    if (key === 'NOT') return !(condition as RecordData[]).some((entry) => matches(row, entry))
    const value = row[key]
    if (condition && typeof condition === 'object') {
      const filter = condition as RecordData
      if ('not' in filter) return value !== filter.not
      if ('endsWith' in filter) return String(value).endsWith(String(filter.endsWith))
      if ('contains' in filter) return String(value).includes(String(filter.contains))
      throw new Error('Unhandled fixture filter')
    }
    return value === condition
  })
}
function fixture() {
  const role = { role: 'ORGANIZATION_ADMIN', scopeType: 'ORGANIZATION', scopeId: org }
  const actor = {
    organizationId: org,
    userId: 'fixture-user',
    sessionId: 'fixture-session',
    user: { roles: [role] },
  } as unknown as AuthenticatedSession
  let active = true
  const queries: string[] = []
  const count = (name: string, rows: RecordData[]) => ({
    count: async ({ where }: { where: RecordData }) => {
      assert.equal(where.organizationId, org)
      queries.push(name)
      return rows.filter((row) => matches(row, where)).length
    },
  })
  const tx = {
    userSession: { findFirst: async () => ({ id: 'fixture-session' }) },
    organizationMembership: {
      findFirst: async () => ({ id: 'fixture-member' }),
      count: async ({ where }: { where: RecordData }) => {
        assert.equal(where.organizationId, org)
        return 4
      },
    },
    roleAssignment: { findMany: async () => (active ? [role] : []) },
    organization: {
      findUniqueOrThrow: async ({ where }: { where: RecordData }) => {
        assert.equal(where.id, org)
        return { id: org, name: 'FICTIONAL_TEST Organization' }
      },
    },
    team: {
      count: async ({ where }: { where: RecordData }) => {
        assert.equal(where.organizationId, org)
        return 2
      },
    },
    playerProfile: {
      count: async ({ where }: { where: RecordData }) => {
        assert.equal(where.organizationId, org)
        return 3
      },
    },
    contentReport: {
      count: async ({ where }: { where: RecordData }) => {
        assert.equal(where.organizationId, org)
        return 0
      },
    },
    registrationHelpRequest: { count: async () => 0 },
    managedMediaAsset: count('media', [
      { organizationId: org, visibility:'ACTIVE',status:'APPROVED',reviewedAt:null },
      { organizationId: org, visibility:'ACTIVE',status:'PENDING',reviewedAt:null },
      { organizationId: org, visibility:'ACTIVE',status:'APPROVED',reviewedAt:new Date() },
      { organizationId: org, visibility:'HIDDEN',status:'PENDING',reviewedAt:null },
      { organizationId: other, visibility:'ACTIVE',status:'PENDING',reviewedAt:null },
    ]),
    directMessage: count('messages',[
      {organizationId:org,moderationStatus:'PENDING'},
      {organizationId:org,moderationStatus:'APPROVED'},
      {organizationId:other,moderationStatus:'PENDING'},
    ]),
    studentRecord: count('students', [{ organizationId: org }, { organizationId: other }]),
    identityApplication: count('identities', [
      { organizationId: org, status: 'PENDING' },
      { organizationId: org, status: 'APPROVED' },
      { organizationId: org, status: 'PENDING', kind:'STUDENT_REGISTRATION' },
      { organizationId: other, status: 'PENDING' },
    ]),
    post: count('posts', [
      { organizationId: org, status: 'DRAFT' },
      { organizationId: org, status: 'PUBLISHED' },
      { organizationId: other, status: 'DRAFT' },
    ]),
    reporterCorrectionCase: count('corrections', [
      { organizationId: org, status: 'OPEN', appeal: null },
      { organizationId: org, status: 'CONFIRMED', appeal: '核实申诉' },
      { organizationId: org, status: 'CONFIRMED', appeal: null },
      { organizationId: org, status: 'OVERTURNED', appeal: '已处理' },
      { organizationId: other, status: 'OPEN', appeal: null },
    ]),
    reporterReinstatement: count('reinstatements', [
      { organizationId: org, status: 'SUBMITTED' },
      { organizationId: org, status: 'APPROVED' },
      { organizationId: other, status: 'SUBMITTED' },
    ]),
    $queryRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => {
      assert(values.every((value) => value === org))
      return [{ count: strings.join('').includes('roster_submissions') ? 2n : 3n }]
    },
    auditLog: {
      findMany: async ({
        where,
        select,
      }: {
        where: RecordData
        select: Record<string, boolean>
      }) => {
        assert.equal(where.organizationId, org)
        assert.deepEqual(Object.keys(select).sort(), [
          'action',
          'createdAt',
          'id',
          'reason',
          'targetType',
        ])
        return [
          {
            id: 'allowed',
            organizationId: org,
            action: 'STUDENT_RECORD_UPDATED',
            targetType: 'StudentRecord',
            reason: '资料更正',
            createdAt: new Date('2026-10-20T00:00:00Z'),
          },
          {
            id: 'foreign',
            organizationId: other,
            action: 'STUDENT_RECORD_UPDATED',
            reason: 'FOREIGN_PRIVATE',
          },
          {
            id: 'password',
            organizationId: org,
            action: 'ADMIN_LOGIN_PASSWORD_VIEWED',
            reason: 'PASSWORD_PRIVATE',
          },
          {
            id: 'view',
            organizationId: org,
            action: 'STUDENT_DIRECTORY_VIEWED',
            reason: 'VIEW_PRIVATE',
          },
          {
            id: 'session',
            organizationId: org,
            action: 'LOCAL_OWNER_SESSION_STARTED',
            reason: 'SESSION_PRIVATE',
          },
        ]
          .filter((row) => matches(row, where))
          .map((row) => ({
            id: row.id,
            action: row.action,
            targetType: row.targetType,
            reason: row.reason,
            createdAt: row.createdAt,
          }))
      },
    },
  }
  const prisma = {
    $transaction: async (run: (transaction: typeof tx) => Promise<unknown>) => run(tx),
  } as unknown as PrismaService
  const auth = {
    requireSession: async (authorization: string | undefined) => {
      if (!authorization) throw centerError(401, '请登录')
      return actor
    },
  } as unknown as AuthService
  return {
    service: new AdminCenterService(
      prisma,
      auth,
      new AccessPolicyService(prisma),
      {} as MediaService,
    ),
    queries,
    revoke: () => {
      active = false
    },
  }
}
test('workspace overview counts current organization tasks with actual pending status values', async () => {
  const result = await fixture().service.overview('Bearer fictional-token')
  assert.deepEqual(result.counts, {
    users: 4,
    students: 1,
    teams: 2,
    players: 3,
    openFeedback: 0,
    pendingRosters: 2,
    pendingReports: 3,
    pendingIdentities: 1,
    pendingPosts: 1,
    pendingStudentRegistrations: 1,
    pendingMedia: 2,
    pendingMessages: 1,
    openCorrections: 2,
    pendingReinstatements: 1,
  })
  assert.equal(result.recentAudit.length, 1)
  assert.equal(result.recentAudit[0]!.reason, '资料更正')
  assert.equal(result.recentAudit[0]!.createdAt, '2026-10-20T00:00:00.000Z')
  assert(!JSON.stringify(result).includes('PRIVATE'))
})
test('overview refuses anonymous access and rechecks current administrator grants before querying tasks', async () => {
  const current = fixture()
  await assert.rejects(
    current.service.overview(undefined),
    (error: unknown) => (error as { getStatus(): number }).getStatus() === 401,
  )
  current.revoke()
  await assert.rejects(
    current.service.overview('Bearer fictional-token'),
    (error: unknown) => (error as { getStatus(): number }).getStatus() === 403,
  )
  assert.deepEqual(current.queries, [])
})
