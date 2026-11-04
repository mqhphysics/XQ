import assert from 'node:assert/strict'
import test from 'node:test'
import {
  emailCooldownDeadline,
  emailCooldownKey,
  emailCooldownRemaining,
} from './countdown.logic.weapp.ts'

test('email resend countdown lasts sixty actual seconds, including time spent in the background', () => {
  const deadline = emailCooldownDeadline(60, 10_000)
  assert.equal(emailCooldownRemaining(deadline, 10_000), 60)
  assert.equal(emailCooldownRemaining(deadline, 10_700), 60)
  assert.equal(emailCooldownRemaining(deadline, 45_000), 25)
  assert.equal(emailCooldownRemaining(deadline, 70_000), 0)
  assert.equal(emailCooldownRemaining(deadline, 170_000), 0)
})
test('email scopes ignore letter case and whitespace and retain longer server cooldowns', () => {
  assert.equal(emailCooldownKey(' Test@Example.COM '), 'test@example.com')
  assert.equal(emailCooldownDeadline(90, 0), 90_000)
  assert.equal(emailCooldownDeadline(15, 0), 15_000)
  assert.equal(emailCooldownDeadline(undefined, 0), 60_000)
  assert.equal(emailCooldownDeadline(Number.NaN, 0), 60_000)
})
