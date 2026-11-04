import assert from 'node:assert/strict'
import test from 'node:test'

import { Prisma, PrismaClient } from '../generated/prisma/client'

const databaseUrl = process.env.TEST_DATABASE_URL

test(
  'PostgreSQL rejects duplicate organization slugs',
  { skip: databaseUrl === undefined },
  async () => {
    assert.ok(databaseUrl)

    const prisma = new PrismaClient({
      datasources: {
        db: {
          url: databaseUrl,
        },
      },
    })
    const slug = `constraint-test-${crypto.randomUUID()}`

    try {
      await prisma.organization.create({
        data: {
          slug,
          name: 'Unique constraint test',
        },
      })

      await assert.rejects(
        prisma.organization.create({
          data: {
            slug,
            name: 'Duplicate organization',
          },
        }),
        (error: unknown) =>
          error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002',
      )
    } finally {
      await prisma.organization.deleteMany({ where: { slug } })
      await prisma.$disconnect()
    }
  },
)
