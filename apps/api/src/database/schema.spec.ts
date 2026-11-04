import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import test from 'node:test'

const migrationPath = resolve(
  process.cwd(),
  '../../prisma/migrations/20260610150000_initial_api_foundation/migration.sql',
)
const scheduleMigrationPath = resolve(
  process.cwd(),
  '../../prisma/migrations/20260624110000_p1_schedule_slice/migration.sql',
)
const identityMigrationPath = resolve(
  process.cwd(),
  '../../prisma/migrations/20260901110000_identity_login/migration.sql',
)
const matchReviewMigrationPath = resolve(
  process.cwd(),
  '../../prisma/migrations/20260901143000_match_reviews/migration.sql',
)
const apiSourcePath = resolve(process.cwd(), 'src')

test('initial migration enforces organization and idempotency uniqueness', async () => {
  const migration = await readFile(migrationPath, 'utf8')

  assert.match(
    migration,
    /CREATE UNIQUE INDEX "organization_memberships_organization_id_user_id_key"/,
  )
  assert.match(
    migration,
    /CREATE UNIQUE INDEX "idempotency_records_user_id_route_idempotency_key_key"/,
  )
  assert.match(migration, /CREATE UNIQUE INDEX "outbox_jobs_deduplication_key_key"/)
  assert.match(migration, /FOREIGN KEY \("organization_id"\) REFERENCES "organizations"\("id"\)/)
})

test('initial migration matches the Outbox V0.2 persistence contract', async () => {
  const migration = await readFile(migrationPath, 'utf8')

  for (const status of [
    'PENDING',
    'PROCESSING',
    'SUCCEEDED',
    'FAILED_RETRYABLE',
    'FAILED_PERMANENT',
    'CANCELLED',
  ]) {
    assert.match(migration, new RegExp(`'${status}'`))
  }

  assert.doesNotMatch(migration, /'RETRYABLE'|'COMPLETED'/)
  assert.match(migration, /"last_error_code" VARCHAR\(120\)/)
  assert.match(migration, /"last_error" TEXT/)
  assert.match(migration, /"correlation_id" VARCHAR\(128\)/)
  assert.match(migration, /CREATE INDEX "outbox_jobs_status_available_at_idx"/)
  assert.match(migration, /CREATE INDEX "outbox_jobs_locked_until_idx"/)
  assert.match(migration, /CREATE INDEX "outbox_jobs_correlation_id_idx"/)
})

test('API logging and error codes use the approved single sources', async () => {
  const requestLogger = await readFile(
    resolve(apiSourcePath, 'common/request-logging.interceptor.ts'),
    'utf8',
  )
  const exceptionFilter = await readFile(
    resolve(apiSourcePath, 'common/api-exception.filter.ts'),
    'utf8',
  )

  assert.doesNotMatch(requestLogger, /originalUrl|request\.url/)
  assert.doesNotMatch(exceptionFilter, /originalUrl|request\.url/)
  assert.match(requestLogger, /getSafeRequestPath/)
  assert.match(exceptionFilter, /getSafeRequestPath/)
  assert.match(exceptionFilter, /ERROR_CODES/)
})

test('P1 schedule migration creates required tables and uniqueness constraints', async () => {
  const migration = await readFile(scheduleMigrationPath, 'utf8')

  for (const table of [
    'seasons',
    'tournaments',
    'competition_rule_versions',
    'tournament_stages',
    'tournament_groups',
    'competition_rounds',
    'teams',
    'player_profiles',
    'venues',
    'matches',
    'schedule_plans',
    'schedule_revisions',
  ]) {
    assert.match(migration, new RegExp(`CREATE TABLE "${table}"`))
  }

  for (const index of [
    'seasons_organization_id_season_code_key',
    'tournaments_organization_id_tournament_code_key',
    'competition_rule_versions_tournament_id_version_key',
    'teams_organization_id_team_code_key',
    'venues_organization_id_venue_code_key',
    'schedule_revisions_schedule_plan_id_version_key',
  ]) {
    assert.match(migration, new RegExp(`CREATE UNIQUE INDEX "${index}"`))
  }

  assert.match(migration, /FOREIGN KEY \("organization_id"\) REFERENCES "organizations"\("id"\)/)
  assert.match(migration, /CREATE INDEX "matches_organization_id_scheduled_start_at_idx"/)
  assert.match(migration, /CREATE INDEX "matches_tournament_id_status_scheduled_start_at_idx"/)
})

test('identity migration keeps full student IDs restricted and uniquely addressable', async () => {
  const migration = await readFile(identityMigrationPath, 'utf8')

  assert.match(migration, /ADD COLUMN "real_name" VARCHAR\(120\)/)
  assert.match(migration, /ADD COLUMN "student_id" VARCHAR\(32\)/)
  assert.match(migration, /ADD COLUMN "email_normalized" VARCHAR\(254\)/)
  assert.match(migration, /CREATE UNIQUE INDEX "app_users_student_id_key"/)
  assert.match(migration, /CREATE UNIQUE INDEX "app_users_email_normalized_key"/)
  assert.match(migration, /CREATE UNIQUE INDEX "player_profiles_organization_id_student_id_key"/)
})

test('match review migration enforces one bounded rating per user and match', async () => {
  const migration = await readFile(matchReviewMigrationPath, 'utf8')

  assert.match(migration, /CREATE TABLE "match_reviews"/)
  assert.match(migration, /CHECK \("rating" BETWEEN 1 AND 5\)/)
  assert.match(migration, /CREATE UNIQUE INDEX "match_reviews_match_id_user_id_key"/)
  assert.match(migration, /FOREIGN KEY \("organization_id"\) REFERENCES "organizations"\("id"\)/)
  assert.match(migration, /FOREIGN KEY \("match_id"\) REFERENCES "matches"\("id"\)/)
  assert.match(migration, /FOREIGN KEY \("user_id"\) REFERENCES "app_users"\("id"\)/)
})
