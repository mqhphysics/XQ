import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import test from 'node:test'

const migrationPath = resolve(
  process.cwd(),
  '../../prisma/migrations/20260830090000_p2_roster_data_slice/migration.sql',
)
const scheduleMigrationPath = resolve(
  process.cwd(),
  '../../prisma/migrations/20260624110000_p1_schedule_slice/migration.sql',
)
const schemaPath = resolve(process.cwd(), '../../prisma/schema.prisma')
const cliPath = resolve(process.cwd(), 'src/roster/import-registration.cli.ts')

test('P2 roster migration creates required tables, uniqueness and organization constraints', async () => {
  const migration = await readFile(migrationPath, 'utf8')

  for (const table of [
    'team_registrations',
    'roster_submissions',
    'roster_entries',
    'roster_snapshots',
    'roster_snapshot_entries',
    'import_batches',
  ]) {
    assert.match(migration, new RegExp(`CREATE TABLE "${table}"`))
  }

  for (const index of [
    'team_registrations_tournament_id_team_id_key',
    'roster_submissions_registration_id_version_key',
    'roster_entries_submission_id_player_profile_id_key',
    'roster_snapshots_tournament_id_team_id_version_key',
    'import_batches_org_tournament_type_source_hash_key',
  ]) {
    assert.match(migration, new RegExp(`CREATE UNIQUE INDEX "${index}"`))
  }

  assert.match(migration, /FOREIGN KEY \("tournament_id", "organization_id"\)/)
  assert.match(migration, /FOREIGN KEY \("player_profile_id", "organization_id"\)/)
  assert.match(migration, /CREATE TRIGGER "roster_snapshots_immutable"/)
  assert.match(migration, /CREATE TRIGGER "roster_snapshot_entries_immutable"/)
  assert.match(migration, /BEFORE INSERT OR UPDATE OR DELETE ON "roster_snapshot_entries"/)
})

test('Prisma roster schema keeps shirt numbers as nullable strings and stable source uniqueness', async () => {
  const schema = await readFile(schemaPath, 'utf8')
  const scheduleMigration = await readFile(scheduleMigrationPath, 'utf8')

  assert.match(schema, /shirtNumber\s+String\?\s+@map\("shirt_number"\)/)
  assert.match(
    scheduleMigration,
    /CREATE UNIQUE INDEX "player_profiles_organization_id_source_type_source_key_key"[\s\S]+WHERE "source_key" IS NOT NULL/,
  )
  assert.doesNotMatch(schema, /@@unique\(\[organizationId, displayName\]/)
})

test('registration CLI refuses production and emits only a safe result envelope', async () => {
  const cli = await readFile(cliPath, 'utf8')

  assert.match(cli, /process\.env\.NODE_ENV === 'production'/)
  assert.doesNotMatch(cli, /console\.(?:log|error)\([^)]*(?:args\.file|source|document)/s)
  assert.match(cli, /batchId: result\.batchId/)
  assert.match(cli, /warningCount: result\.warningCount/)
})
