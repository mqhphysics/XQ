import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import test from 'node:test'

import { type ClaimedJob, type SqlExecutor } from '../outbox/outbox-store'
import {
  createMatchReportHandler,
  parseConfirmedEvent,
  type ConfirmedRevision,
  type ConfirmationHead,
  type ResultProjectionRepository,
} from './match-report-handler'

const organizationId = randomUUID()
const matchId = randomUUID()
const tournamentId = randomUUID()
const revisionId = randomUUID()
const ruleVersionId = randomUUID()
const tx: SqlExecutor = { query: async () => [] }
const head: ConfirmationHead = { organizationId, matchId, tournamentId, confirmedReportVersion: 2 }
const revision: ConfirmedRevision = {
  organizationId,
  matchId,
  tournamentId,
  version: 2,
  revisionId,
  ruleVersionId,
  status: 'CONFIRMED',
  fields: { source: 'FICTIONAL_TEST', homeScore: '2', awayScore: '1' },
}
const job: ClaimedJob = {
  id: randomUUID(),
  organizationId,
  topic: 'match.report',
  aggregateType: 'Match',
  aggregateId: matchId,
  eventType: 'MatchReportConfirmed',
  payload: { matchId, tournamentId, confirmedReportVersion: 2, revisionId, ruleVersionId },
  attemptCount: 1,
  maxAttempts: 3,
  lockedBy: randomUUID(),
}

class ControlledRepository implements ResultProjectionRepository {
  head: ConfirmationHead | null = head
  revision: ConfirmedRevision | null = revision
  reads = 0
  writes: ConfirmedRevision[] = []
  async lockConfirmationHead(
    actual: SqlExecutor,
    org: string,
    match: string,
  ): Promise<ConfirmationHead | null> {
    assert.equal(actual, tx)
    assert.equal(org, organizationId)
    assert.equal(match, matchId)
    return this.head
  }
  async getConfirmedRevision(
    actual: SqlExecutor,
    _org: string,
    _match: string,
    version: number,
  ): Promise<ConfirmedRevision | null> {
    assert.equal(actual, tx)
    assert.equal(version, 2)
    this.reads += 1
    return this.revision
  }
  async writeProjection(actual: SqlExecutor, result: ConfirmedRevision): Promise<void> {
    assert.equal(actual, tx)
    this.writes.push(result)
  }
}

test('latest event projects the locked confirmed revision using the same transaction', async () => {
  const repository = new ControlledRepository()
  await createMatchReportHandler(repository)(tx, job)
  assert.deepEqual(repository.writes, [revision])
})

test('different stale job succeeds without reading old facts or replacing the new projection', async () => {
  const repository = new ControlledRepository()
  await createMatchReportHandler(repository)(tx, {
    ...job,
    payload: { ...(job.payload as object), confirmedReportVersion: 1 },
  })
  assert.equal(repository.reads, 0)
  assert.equal(repository.writes.length, 0)
})

test('future event retries rather than inventing a confirmed result', async () => {
  const repository = new ControlledRepository()
  await assert.rejects(
    createMatchReportHandler(repository)(tx, {
      ...job,
      payload: { ...(job.payload as object), confirmedReportVersion: 3 },
    }),
    /CONFIRMED_RESULT_NOT_VISIBLE/,
  )
  assert.equal(repository.writes.length, 0)
  repository.head = { ...head, confirmedReportVersion: null }
  await assert.rejects(
    createMatchReportHandler(repository)(tx, job),
    /CONFIRMED_RESULT_NOT_VISIBLE/,
  )
  assert.equal(repository.writes.length, 0)
})

test('wrong organization, missing revision and mismatched immutable revision fail without writes', async () => {
  const cases: Array<[ConfirmationHead | null, ConfirmedRevision | null, string]> = [
    [{ ...head, organizationId: randomUUID() }, revision, 'RESULT_SCOPE_MISMATCH'],
    [head, null, 'CONFIRMED_RESULT_REVISION_MISSING'],
    [head, { ...revision, revisionId: randomUUID() }, 'CONFIRMED_RESULT_REVISION_MISMATCH'],
    [head, { ...revision, ruleVersionId: randomUUID() }, 'CONFIRMED_RESULT_REVISION_MISMATCH'],
  ]
  for (const [current, facts, code] of cases) {
    const repository = new ControlledRepository()
    repository.head = current
    repository.revision = facts
    await assert.rejects(createMatchReportHandler(repository)(tx, job), new RegExp(code))
    assert.equal(repository.writes.length, 0)
  }
})

test('invalid payload, version and aggregate mismatch are permanent validation errors', () => {
  assert.throws(() => parseConfirmedEvent({ ...job, payload: [] }), /INVALID_RESULT_EVENT_PAYLOAD/)
  assert.throws(
    () => parseConfirmedEvent({ ...job, aggregateId: randomUUID() }),
    /RESULT_AGGREGATE_MISMATCH/,
  )
  assert.throws(
    () =>
      parseConfirmedEvent({
        ...job,
        payload: { ...(job.payload as object), confirmedReportVersion: 2147483648 },
      }),
    /INVALID_RESULT_EVENT_VERSION/,
  )
  assert.throws(
    () => parseConfirmedEvent({ ...job, eventType: 'DraftSaved' }),
    /INVALID_RESULT_EVENT_ENVELOPE/,
  )
})
