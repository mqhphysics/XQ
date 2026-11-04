import assert from 'node:assert/strict'
import test from 'node:test'

import { ApiHttpException } from '../common/api-http.exception'
import type { AuthService } from '../auth/auth.service'
import type { PrismaService } from '../database/prisma.service'
import { SocialService } from './social.service'

const organizationId = '00000000-0000-4000-8000-000000000091'
const reportId = '00000000-0000-4000-8000-000000000092'

function serviceFixture(targetType = 'FEEDBACK') {
  const report = {
    id: reportId,
    organizationId,
    reporterUserId: 'reporter',
    targetType,
    targetId: targetType === 'POST' ? 'post' : null,
    status: 'OPEN',
    resolution: null as string | null,
    actionTaken: null as string | null,
    updatedAt: new Date('2026-10-01T00:00:00Z'),
  }
  const notifications: Array<Record<string, unknown>> = []
  let audits = 0,
    hidden = false,
    failNotification = false
  const prisma = {
    contentReport: {
      findFirst: async () => ({ ...report }),
      updateMany: async ({
        where,
        data,
      }: {
        where: { updatedAt: Date }
        data: Record<string, unknown>
      }) => {
        if (where.updatedAt.getTime() !== report.updatedAt.getTime()) return { count: 0 }
        Object.assign(report, data, { updatedAt: new Date(report.updatedAt.getTime() + 1) })
        return { count: 1 }
      },
    },
    post: {
      updateMany: async () => {
        hidden = true
        return { count: 1 }
      },
    },
    userNotification: {
      upsert: async ({
        create,
        update,
      }: {
        create: Record<string, unknown>
        update: Record<string, unknown>
      }) => {
        if (failNotification) throw new Error('notification unavailable')
        const body = create.body as string
        if (Array.from(body).length > 500) throw new Error('varchar(500) limit')
        const existing = notifications.find((n) => n.deduplicationKey === create.deduplicationKey)
        if (existing) Object.assign(existing, update)
        else notifications.push({ ...create, readAt: null })
      },
    },
    auditLog: {
      create: async () => {
        audits++
        return {}
      },
    },
    $transaction: async <T>(callback: (tx: unknown) => Promise<T>): Promise<T> => {
      const original = { ...report },
        originalNotifications = structuredClone(notifications)
      const originalAudits = audits,
        originalHidden = hidden
      try {
        return await callback(prisma)
      } catch (error) {
        Object.assign(report, original)
        notifications.splice(0, notifications.length, ...originalNotifications)
        audits = originalAudits
        hidden = originalHidden
        throw error
      }
    },
  }
  const auth = {
    requireSession: async () => ({
      userId: 'admin',
      organizationId,
      user: {
        roles: [{ role: 'ORGANIZATION_ADMIN', scopeType: 'ORGANIZATION', scopeId: organizationId }],
      },
    }),
  }
  const service = new SocialService(
    prisma as unknown as PrismaService,
    auth as unknown as AuthService,
  )
  service.listAdminReports = async () => ({ items: [] })
  return {
    service,
    report,
    notifications,
    audits: () => audits,
    hidden: () => hidden,
    fail: () => {
      failNotification = true
    },
  }
}

test('long resolutions are stored completely and their notification summaries fit PostgreSQL', async () => {
  for (const resolution of ['字'.repeat(501), '字'.repeat(1000), '⚽'.repeat(750)]) {
    const fixture = serviceFixture()
    await fixture.service.reviewReport(
      'Bearer admin',
      reportId,
      { status: 'RESOLVED', resolution },
      'test',
    )
    assert.equal(fixture.report.resolution, resolution)
    assert.equal(Array.from(fixture.notifications[0]!.body as string).length, 500)
    assert.equal(fixture.audits(), 1)
  }
})

test("repeating a completed review preserves its first audit and the user's read state", async () => {
  const fixture = serviceFixture()
  const input = { status: 'RESOLVED' as const, resolution: '已核查并处理，请查看结果' }
  await fixture.service.reviewReport('Bearer admin', reportId, input, 'first')
  const readAt = new Date()
  fixture.notifications[0]!.readAt = readAt
  await fixture.service.reviewReport('Bearer admin', reportId, input, 'retry')
  assert.equal(fixture.audits(), 1)
  assert.equal(fixture.notifications.length, 1)
  assert.equal(fixture.notifications[0]!.readAt, readAt)
})

test('hidden-content decisions survive retries and terminal reviews cannot be overwritten', async () => {
  const fixture = serviceFixture('POST')
  const input = { status: 'RESOLVED' as const, resolution: '经核查已隐藏该内容', hideContent: true }
  await fixture.service.reviewReport('Bearer admin', reportId, input, 'first')
  await fixture.service.reviewReport(
    'Bearer admin',
    reportId,
    { ...input, hideContent: false },
    'retry',
  )
  assert.equal(fixture.report.actionTaken, 'HIDDEN_POST')
  assert.equal(fixture.hidden(), true)
  assert.equal(fixture.audits(), 1)
  await assert.rejects(
    fixture.service.reviewReport(
      'Bearer admin',
      reportId,
      { status: 'IN_REVIEW', resolution: '重新处理' },
      'reopen',
    ),
    (error: unknown) => error instanceof ApiHttpException && error.getStatus() === 409,
  )
  assert.equal(fixture.report.status, 'RESOLVED')
  assert.equal(fixture.report.actionTaken, 'HIDDEN_POST')
})

test('a rejected or unfinished review cannot hide content', async () => {
  for (const status of ['IN_REVIEW', 'REJECTED'] as const) {
    const fixture = serviceFixture('POST')
    await assert.rejects(
      fixture.service.reviewReport(
        'Bearer admin',
        reportId,
        { status, resolution: '尚未确认违规', hideContent: true },
        'test',
      ),
      (error: unknown) => error instanceof ApiHttpException && error.getStatus() === 400,
    )
    assert.equal(fixture.hidden(), false)
    assert.equal(fixture.audits(), 0)
  }
})

test('notification failure rolls back the review, moderation and audit together', async () => {
  const fixture = serviceFixture('POST')
  fixture.fail()
  await assert.rejects(
    fixture.service.reviewReport(
      'Bearer admin',
      reportId,
      { status: 'RESOLVED', resolution: '已确认隐藏', hideContent: true },
      'test',
    ),
    /notification unavailable/,
  )
  assert.equal(fixture.report.status, 'OPEN')
  assert.equal(fixture.hidden(), false)
  assert.equal(fixture.audits(), 0)
})

test('editing an application cannot reset a concurrently approved application back to pending', async () => {
  const application = {
    id: 'application',
    status: 'PENDING',
    updatedAt: new Date(),
    playerProfileId: null,
    requestedPosition: null,
    message: '原申请',
  }
  let resets = 0,
    notifications = 0
  const prisma = {
    team: { findFirst: async () => ({ id: 'team', name: '虚构球队' }) },
    teamMembership: { findFirst: async () => null },
    teamJoinApplication: {
      findFirst: async () => ({ ...application }),
      updateMany: async ({ where }: { where: { status: string; updatedAt: Date } }) => {
        if (
          application.status !== where.status ||
          application.updatedAt.getTime() !== where.updatedAt.getTime()
        )
          return { count: 0 }
        resets++
        return { count: 1 }
      },
    },
    roleAssignment: {
      findMany: async () => {
        // A captain completes approval after the applicant has read the old version.
        application.status = 'APPROVED'
        application.updatedAt = new Date(application.updatedAt.getTime() + 1)
        return [{ userId: 'captain' }]
      },
    },
    userNotification: {
      upsert: async () => {
        notifications++
      },
    },
    $transaction: async <T>(callback: (tx: unknown) => Promise<T>) => callback(prisma),
  }
  const auth = {
    requireSession: async () => ({
      organizationId,
      userId: 'applicant',
      user: { linkedPlayer: null, displayName: '虚构申请人' },
    }),
  }
  const service = new SocialService(
    prisma as unknown as PrismaService,
    auth as unknown as AuthService,
  )
  await assert.rejects(
    service.applyToTeam('Bearer applicant', 'team', { message: '修改申请' }),
    (error: unknown) => error instanceof ApiHttpException && error.getStatus() === 409,
  )
  assert.equal(application.status, 'APPROVED')
  assert.equal(resets, 0)
  assert.equal(notifications, 0)
})
