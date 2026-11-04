import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import test from 'node:test'
import { NestFactory } from '@nestjs/core'
import { AppModule } from '../app.module'
import { configureApp } from '../app.setup'
import { PrismaClient } from '../generated/prisma/client'

test('registration, scoped staff approval, persistent team names and actionable audit on PostgreSQL', { timeout: 60000 }, async t => {
  const url = process.env.DATABASE_URL
  assert(url && new URL(url).pathname === '/xiaoqiu_admin_test_20261028', 'Dedicated empty test database required')
  const p = new PrismaClient()
  const suffix = randomUUID().slice(0, 8)
  const org = await p.organization.create({ data: { slug: `admin-regression-${suffix}`, name: '虚构管理测试组织' } })
  const other = await p.organization.create({ data: { slug: `admin-foreign-${suffix}`, name: '虚构其他组织' } })
  const user = async (name: string, admin = false) => {
    const row = await p.user.create({ data: { loginNameNormalized: `test-${suffix}-${name}`, displayName: name, realName: name,
      memberships: { create: { organizationId: org.id, status: 'ACTIVE' } },
    } })
    if (admin) await p.roleAssignment.create({ data: { userId: row.id, role: 'PLATFORM_ADMIN', scopeType: 'PLATFORM', scopeId: 'platform' } })
    const token = randomUUID()
    await p.userSession.create({ data: { userId: row.id, organizationId: org.id,
      refreshTokenHash: createHash('sha256').update(token).digest('hex'), expiresAt: new Date(Date.now() + 600000) } })
    return { ...row, token }
  }
  const owner = await user('虚构总管理员', true), applicant = await user('虚构申请人')
  const season = await p.season.create({ data: { organizationId: org.id, seasonCode: String(new Date().getUTCFullYear()), name: '2026' } })
  const tournament = await p.tournament.create({ data: { organizationId: org.id, seasonId: season.id, tournamentCode: 'TEST', name: '虚构测试赛事', status: 'PUBLISHED' } })
  const foreignSeason = await p.season.create({ data: { organizationId: other.id, seasonCode: '2026', name: '2026' } })
  const foreignTournament = await p.tournament.create({ data: { organizationId: other.id, seasonId: foreignSeason.id, tournamentCode: 'FOREIGN', name: '虚构其他赛事' } })
  const team = await p.team.create({ data: { organizationId: org.id, teamCode: 'TEST', name: '旧球队名', shortName: '旧名' } })
  const registration = await p.teamRegistration.create({ data: { organizationId: org.id, teamId: team.id, tournamentId: tournament.id, teamProfileSnapshot: { name: '旧球队名', shortName: '旧名', crestUrl: '/api/media/defaults/team-crest-v1.webp' } } })
  const app = await NestFactory.create(AppModule, { logger: false })
  configureApp(app)
  await app.listen(0, '127.0.0.1')
  const base = await app.getUrl()
  async function api(path: string, token: string = owner.token, body?: unknown, method = body ? 'POST' : 'GET') {
    const response = await fetch(`${base}/api/${path}`, { method, headers: {
      'x-organization-id': org.id, authorization: `Bearer ${token}`, 'content-type': 'application/json', 'idempotency-key': randomUUID(),
    }, ...(body ? { body: JSON.stringify(body) } : {}) })
    const data = await response.json() as any
    return { status: response.status, data }
  }
  try {
    await t.test('name-only registration automatically persists a valid number and audit, without review or player association', async () => {
      const student = await p.studentRecord.create({ data: { organizationId: org.id, realName: '虚构注册学生' } })
      const response = await api('auth/register', '', { realName: student.realName, studentId: '2026888881', password: 'Test2026!' })
      assert.equal(response.status, 201, JSON.stringify(response.data))
      const saved = await p.studentRecord.findUniqueOrThrow({ where: { id: student.id }, include: { user: true } })
      assert.equal(saved.studentNumber, '2026888881'); assert.equal(saved.academicYear, '2026')
      assert.equal(saved.user?.verificationLevel, 'STUDENT_VERIFIED'); assert.equal(saved.user?.playerProfileId, null)
      assert.equal(await p.identityApplication.count({ where: { userId: saved.user!.id } }), 0)
      assert.equal(await p.auditLog.count({ where: { targetId: student.id, action: 'STUDENT_NUMBER_AUTO_RECORDED' } }), 1)
      const duplicate = await api('auth/register', '', { realName: student.realName, studentId: '2026888881', password: 'Test2026!' })
      assert.equal(duplicate.status, 409)
    })
    await t.test('staff approval selects a real scope, grants usable permissions, and rejects foreign scopes', async () => {
      await p.user.update({ where: { id: applicant.id }, data: { verificationLevel: 'STUDENT_VERIFIED' } })
      const pending = await p.identityApplication.create({ data: { organizationId: org.id, userId: applicant.id, kind: 'MATCH_REPORTER', message: '申请信息管理员' } })
      const foreign = await api(`admin/identity/applications/${pending.id}/review`, owner.token,
        { decision: 'APPROVED', expectedVersion: 1, scopeType: 'TOURNAMENT', scopeId: foreignTournament.id })
      assert.equal(foreign.status, 404)
      assert.equal((await p.identityApplication.findUniqueOrThrow({ where: { id: pending.id } })).status, 'PENDING')
      const response = await api(`admin/identity/applications/${pending.id}/review`, owner.token,
        { decision: 'APPROVED', expectedVersion: 1, scopeType: 'TOURNAMENT', scopeId: tournament.id })
      assert.equal(response.status, 201, JSON.stringify(response.data))
      const roles = await p.roleAssignment.findMany({ where: { userId: applicant.id, role: 'MATCH_REPORTER', revokedAt: null } })
      assert.equal(roles.length, 1); assert.equal(roles[0]!.scopeId, tournament.id)
      const me = await api('auth/me', applicant.token)
      assert(me.data.roles.some((role: any) => role.role === 'MATCH_REPORTER' && role.scopeId === tournament.id))
      const replay = await api(`admin/identity/applications/${pending.id}/review`, owner.token,
        { decision: 'APPROVED', expectedVersion: 1, scopeType: 'TOURNAMENT', scopeId: tournament.id })
      assert.equal(replay.status, 409)
    })
    await t.test('team edits survive rereads across directory and season projections, preserve media, and expose reversible changes', async () => {
      const response = await api(`admin/campus/team-seasons/${registration.id}`, owner.token,
        { name: '新的球队', shortName: '新队', reason: '核对名称', expectedUpdatedAt: registration.updatedAt.toISOString() }, 'PATCH')
      assert.equal(response.status, 200, JSON.stringify(response.data))
      assert.equal((await p.team.findUniqueOrThrow({ where: { id: team.id } })).name, '新的球队')
      const reread = await api(`admin/campus/team-seasons?tournamentId=${tournament.id}`)
      assert.equal(reread.data.items[0].seasonTeam.name, '新的球队')
      assert.equal(reread.data.items[0].seasonTeam.crestUrl, '/api/media/defaults/team-crest-v1.webp')
      const audit = await api('admin/center/audit?activity=IMPORTANT&pageSize=100')
      const change = audit.data.items.find((entry: any) => entry.action === 'TEAM_SEASON_PROFILE_UPDATED')
      assert.equal(change.before.name, '旧球队名'); assert.equal(change.after.name, '新的球队')
      assert.equal(change.actorUserId, owner.id); assert(change.teamChange)
      const restored = await api(change.teamChange.path.replace(/^\/api\//, '').replace(/^\//, ''), owner.token,
        { ...change.teamChange.body, reason: '恢复原名称' }, 'PATCH')
      assert.equal(restored.status, 200, JSON.stringify(restored.data))
      assert.equal((await p.team.findUniqueOrThrow({ where: { id: team.id } })).name, '旧球队名')
      const current = await p.team.findUniqueOrThrow({ where: { id: team.id } })
      const direct = await api(`admin/center/teams/${team.id}`, owner.token,
        { patch: { name: '目录改名', shortName: '目录' }, reason: '核对资料', expectedUpdatedAt: current.updatedAt.toISOString() }, 'PATCH')
      assert.equal(direct.status, 200, JSON.stringify(direct.data))
      const next = await api(`admin/campus/team-seasons?tournamentId=${tournament.id}`)
      assert.equal(next.data.items[0].seasonTeam.name, '目录改名')
    })
    await t.test('ordinary read history stays separate and normal members cannot access audit', async () => {
      await p.auditLog.create({ data: { organizationId: org.id, actorType: 'ADMIN', actorUserId: owner.id,
        action: 'USER_DIRECTORY_VIEWED', targetType: 'Organization', targetId: org.id, reason: '查看目录', requestId: randomUUID(), source: 'TEST' } })
      const ordinary = await api('admin/center/audit?activity=ORDINARY')
      assert(ordinary.data.items.some((entry: any) => entry.action === 'USER_DIRECTORY_VIEWED'))
      const important = await api('admin/center/audit?activity=IMPORTANT&pageSize=100')
      assert(!important.data.items.some((entry: any) => entry.action === 'USER_DIRECTORY_VIEWED'))
      assert.equal((await api('admin/center/audit', applicant.token)).status, 403)
    })
  } finally { await app.close(); await p.$disconnect() }
})
