import assert from 'node:assert/strict'
import test from 'node:test'
import { resolveSubmissionAttempt } from './submission-attempt.ts'

test('lost-response feedback retry keeps its key, changed content requires an explicit new submission', async () => {
  let keys = 0,
    prompts = 0
  const create = () => `test-${++keys}`
  const first = await resolveSubmissionAttempt(null, { body: 'first' }, create, async () => false)
  assert(first)
  assert.equal(
    await resolveSubmissionAttempt(first, { body: 'first' }, create, async () => {
      prompts++
      return true
    }),
    first,
  )
  assert.equal(prompts, 0)
  assert.equal(
    await resolveSubmissionAttempt(first, { body: 'edited' }, create, async () => false),
    null,
  )
  assert.equal(keys, 1)
  const changed = await resolveSubmissionAttempt(
    first,
    { body: 'edited' },
    create,
    async () => true,
  )
  assert.notEqual(changed!.key, first.key)
  assert.equal(first.fingerprint, JSON.stringify({ body: 'first' }))
})
