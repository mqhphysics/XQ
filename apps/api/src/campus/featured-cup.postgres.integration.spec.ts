import 'reflect-metadata'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import test from 'node:test'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import { AppModule } from '../app.module'
import { configureApp } from '../app.setup'
import { hashPassword } from '../auth/password'
import { PrismaService } from '../database/prisma.service'
import { PrismaClient } from '../generated/prisma/client'

test(
  'cup catalog: drafts stay private and organization admins can switch the home selection after publication',
  { timeout: 60000 },
  async () => {
    const url = process.env.TEST_DATABASE_URL!
    assert.match(new URL(url).pathname, /_test_/)
    assert.notEqual(url, process.env.DATABASE_URL)
    const db = new PrismaClient({ datasources: { db: { url } } })
    const code = randomUUID().slice(0, 8)
    const org = await db.organization.create({
      data: { slug: 'test-cups-' + code, name: 'FICTIONAL_TEST' },
    })
    const foreign = await db.organization.create({
      data: { slug: 'test-cups-other-' + code, name: 'FICTIONAL_TEST' },
    })
    const season = await db.season.create({
      data: { organizationId: org.id, seasonCode: '2027', name: '2027' },
    })
    const prior = await db.tournament.create({
      data: {
        organizationId: org.id,
        seasonId: season.id,
        name: '虚构既有杯赛',
        tournamentCode: 'OLD',
        status: 'PUBLISHED',
      },
    })
    const password = `Fictional-${code}!`
    const credential = await hashPassword(password)
    const users = await Promise.all(
      [org, org, foreign].map((organization, index) =>
        db.user.create({
          data: {
            displayName: 'FICTIONAL_TEST',
            loginNameNormalized: `cup-${code}-${index}`,
            memberships: { create: { organizationId: organization.id, status: 'ACTIVE' } },
            passwordCredential: {
              create: { passwordHash: credential.hash, passwordSalt: credential.salt },
            },
            ...(index !== 1
              ? {
                  roleAssignments: {
                    create: {
                      organizationId: organization.id,
                      role: 'ORGANIZATION_ADMIN',
                      scopeType: 'ORGANIZATION',
                      scopeId: organization.id,
                    },
                  },
                }
              : {}),
          },
        }),
      ),
    )
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(db)
      .compile()
    const app = module.createNestApplication({ logger: false })
    configureApp(app)
    await app.init()
    try {
      const http = request(app.getHttpServer())
      const tokens = await Promise.all(
        users.map(async (user, index) => {
          const login = await http
            .post('/api/auth/login')
            .set('x-organization-id', index === 2 ? foreign.id : org.id)
            .send({ username: user.loginNameNormalized, password })
            .expect(200)
          return `Bearer ${login.body.accessToken}`
        }),
      )
      const command = (path: string, who: number, body: object, key = randomUUID()) =>
        http.post(path).set('Authorization', tokens[who]!).set('Idempotency-Key', key).send(body)
      const endpoint = '/api/admin/campus/competitions'
      const input = {
        seasonId: season.id,
        code: 'TECH_CUP_TEST',
        cupName: '技科杯',
        gender: 'UNSPECIFIED',
        reason: '虚构杯赛验收',
      }
      const key = randomUUID()
      await command(endpoint, 1, input).expect(403)
      const draft = (await command(endpoint, 0, input, key).expect(201)).body
      assert.equal(draft.status, 'DRAFT')
      assert.equal((await command(endpoint, 0, input, key).expect(201)).body.id, draft.id)
      const home = (id = '') =>
        http
          .get(`/api/public/home${id ? `?tournamentId=${id}` : ''}`)
          .set('x-organization-id', org.id)
      assert.equal((await home().expect(200)).body.tournament.id, prior.id)
      const feature = endpoint + '/' + draft.id + '/feature'
      await command(feature, 0, { reason: '赛事切换验收' }).expect(409)
      await db.tournament.update({ where: { id: draft.id }, data: { status: 'PUBLISHED' } })
      await command(feature, 2, { reason: '跨组织验收' }).expect(409)
      await command(feature, 0, { reason: '赛事切换验收' }).expect(201)
      const selected = (await home().expect(200)).body.tournament
      assert.equal(selected.id, draft.id)
      assert.equal(selected.cupName, '技科杯')
      assert.equal(selected.seasonName, '2027')
      assert.equal((await home(prior.id).expect(200)).body.tournament.id, prior.id)
    } finally {
      await app.close()
      await db.$disconnect()
    }
  },
)
