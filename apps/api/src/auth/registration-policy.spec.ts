import assert from 'node:assert/strict'
import test from 'node:test'
import { ApiHttpException } from '../common/api-http.exception'
import {
  assertRegistrationOpen,
  REGISTRATION_CLOSED_MESSAGE,
  registrationEnabled,
} from './registration-policy'

test('registration switch defaults: open in dev, closed in production, env overrides both', () => {
  assert.equal(registrationEnabled({}), true)
  assert.equal(registrationEnabled({ NODE_ENV: 'production' }), false)
  assert.equal(registrationEnabled({ NODE_ENV: 'production', REGISTRATION_ENABLED: 'true' }), true)
  assert.equal(registrationEnabled({ REGISTRATION_ENABLED: 'false' }), false)
  assert.equal(registrationEnabled({ REGISTRATION_ENABLED: '0' }), false)
})

test('closed registration is a 403 business error with a readable message', () => {
  assert.doesNotThrow(() => assertRegistrationOpen({}))
  try {
    assertRegistrationOpen({ REGISTRATION_ENABLED: 'false' })
    assert.fail('expected rejection')
  } catch (error) {
    assert.ok(error instanceof ApiHttpException)
    assert.equal(error.getStatus(), 403)
    const body = error.getResponse() as { message: string; details: { reason: string } }
    assert.equal(body.message, REGISTRATION_CLOSED_MESSAGE)
    assert.equal(body.details.reason, 'REGISTRATION_CLOSED')
  }
})
