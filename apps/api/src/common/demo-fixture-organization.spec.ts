import assert from 'node:assert/strict'
import test from 'node:test'

import { isDemoFixtureOrganization } from './demo-fixture-organization'

test('seed facts require the seed organization or an explicit valid isolated organization opt-in', () => {
  const previous = process.env.DEMO_FIXTURE_ORGANIZATION_ID
  const trial = '99999999-0000-4000-8000-000000000001'
  const other = '99999999-0000-4000-8000-000000000002'
  try {
    for (const invalid of ['', '   ', '*', 'DEMO_FIXTURE', 'not-a-uuid']) {
      process.env.DEMO_FIXTURE_ORGANIZATION_ID = invalid
      assert.equal(isDemoFixtureOrganization(trial), false)
      assert.equal(isDemoFixtureOrganization(other), false)
    }
    process.env.DEMO_FIXTURE_ORGANIZATION_ID = ` ${trial} `
    assert.equal(isDemoFixtureOrganization(trial), true)
    assert.equal(isDemoFixtureOrganization(other), false)
    assert.equal(isDemoFixtureOrganization('00000000-0000-4000-8000-000000000001'), true)
  } finally {
    if (previous === undefined) delete process.env.DEMO_FIXTURE_ORGANIZATION_ID
    else process.env.DEMO_FIXTURE_ORGANIZATION_ID = previous
  }
})
