import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import test from 'node:test'

import { PrismaClient } from '../generated/prisma/client'

test('published and retired rule content stays fixed while new versions remain possible', async () => {
  const value = process.env.TEST_DATABASE_URL
  assert.ok(value, 'Rule integration test requires a disposable TEST_DATABASE_URL')
  const parsed = new URL(value)
  assert.match(decodeURIComponent(parsed.pathname.slice(1)), /(?:^|_)(?:test|ci)(?:_|$)/)
  if (process.env.DATABASE_URL) {
    const daily = new URL(process.env.DATABASE_URL)
    assert.ok(
      parsed.hostname !== daily.hostname ||
        (parsed.port || '5432') !== (daily.port || '5432') ||
        parsed.pathname !== daily.pathname,
    )
  }
  const prisma = new PrismaClient({ datasources: { db: { url: value } } })
  try {
    const suffix = randomUUID()
    const organization = await prisma.organization.create({
      data: { slug: `rule-test-${suffix}`, name: 'FICTIONAL_TEST rule organization' },
    })
    const season = await prisma.season.create({
      data: {
        organizationId: organization.id,
        seasonCode: suffix,
        name: 'FICTIONAL_TEST rule season',
      },
    })
    const tournament = await prisma.tournament.create({
      data: {
        organizationId: organization.id,
        seasonId: season.id,
        tournamentCode: suffix,
        name: 'FICTIONAL_TEST rule tournament',
      },
    })
    const rule = await prisma.competitionRuleVersion.create({
      data: {
        organizationId: organization.id,
        tournamentId: tournament.id,
        version: 1,
        name: 'FICTIONAL_TEST rule v1',
        rules: { sample: 1 },
      },
    })
    await assert.rejects(
      prisma.competitionRuleVersion.update({
        where: { id: rule.id },
        data: { rules: { sample: 2 } },
      }),
    )
    await assert.rejects(
      prisma.competitionRuleVersion.update({ where: { id: rule.id }, data: { version: 2 } }),
    )
    await prisma.competitionRuleVersion.update({
      where: { id: rule.id },
      data: { status: 'RETIRED' },
    })
    await assert.rejects(
      prisma.competitionRuleVersion.update({
        where: { id: rule.id },
        data: { rules: { sample: 2 } },
      }),
    )
    await prisma.competitionRuleVersion.update({
      where: { id: rule.id },
      data: { rules: { sample: 1 }, name: 'FICTIONAL_TEST clarified label' },
    })
    const next = await prisma.competitionRuleVersion.create({
      data: {
        organizationId: organization.id,
        tournamentId: tournament.id,
        version: 2,
        name: 'FICTIONAL_TEST rule v2',
        rules: { sample: 2 },
      },
    })
    assert.notEqual(next.id, rule.id)
    assert.deepEqual(
      (await prisma.competitionRuleVersion.findUniqueOrThrow({ where: { id: rule.id } })).rules,
      { sample: 1 },
    )
    // These fictional records are retained until the task-owned database is dropped.
  } finally {
    await prisma.$disconnect()
  }
})
