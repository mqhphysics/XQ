import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'

import { PgSqlClient, type PgPool } from './pg-sql-client'

interface PrismaSql {
  $queryRawUnsafe<T>(sql: string, ...parameters: unknown[]): Promise<T>
  $executeRawUnsafe(sql: string, ...parameters: unknown[]): Promise<number>
}
interface TestPrismaClient extends PrismaSql {
  $transaction<T>(
    work: (tx: PrismaSql) => Promise<T>,
    options: { timeout: number; maxWait: number },
  ): Promise<T>
  $disconnect(): Promise<void>
}

const databaseUrl = process.env.TEST_DATABASE_URL
assert.ok(databaseUrl, 'TEST_DATABASE_URL must identify a disposable results-worker database')
const parsed = new URL(databaseUrl)
const databaseName = decodeURIComponent(parsed.pathname.slice(1))
assert.match(databaseName, /(?:^|_)(?:test|ci)(?:_|$)/)
if (process.env.DATABASE_URL) {
  const daily = new URL(process.env.DATABASE_URL)
  assert.ok(
    parsed.hostname !== daily.hostname ||
      (parsed.port || '5432') !== (daily.port || '5432') ||
      parsed.pathname !== daily.pathname ||
      (process.env.CI === 'true' && databaseName === 'xiaoqiu_ci'),
    'Do not use the application database as TEST_DATABASE_URL',
  )
}
// Reuse the integrator-generated client only for tests; no Worker runtime dependency.
export const clientLoader = createRequire(resolve(process.cwd(), 'package.json'))
const clientModule =
  process.env.WORKER_TEST_PRISMA_CLIENT ??
  resolve(process.cwd(), '../api/dist/test/generated/prisma/client.js')
const { PrismaClient } = clientLoader(clientModule) as {
  PrismaClient: new (options: unknown) => TestPrismaClient
}
export const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } })
const pgModule = process.env.WORKER_TEST_PG_MODULE ?? 'pg'
const { Pool } = clientLoader(pgModule) as {
  Pool: new (config: unknown) => PgPool & { on(event: 'error', listener: () => void): void }
}
const pool = new Pool({ connectionString: databaseUrl, max: 20, connectionTimeoutMillis: 5000 })
pool.on('error', () => {}) // Tests inspect failures; never print driver errors or credentials.
export const db = new PgSqlClient(pool)
export async function closeTestDatabase(): Promise<void> {
  await db.close()
  await prisma.$disconnect()
}
