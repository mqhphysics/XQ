import assert from 'node:assert/strict'
import test from 'node:test'

import { ApiHttpException } from '../common/api-http.exception'
import type { RequestWithId } from '../common/request-context'
import { DEMO_ORGANIZATION_ID } from '../database/demo-fixture'
import { resolveOrganizationSelector } from './auth-context.guard'

const ORGANIZATION_ID = '00000000-0000-4000-8000-000000000091'
const requestWithHeaders = (headers: Record<string, string> = {}) => ({ headers }) as RequestWithId
const badRequest = (error: unknown) =>
  error instanceof ApiHttpException && error.getStatus() === 400

test('optional organization environment values normalize emptiness without weakening request selectors', () => {
  const previousMode = process.env.NODE_ENV
  const previousOrganization = process.env.DEFAULT_ORGANIZATION_ID
  try {
    process.env.NODE_ENV = 'development'
    for (const empty of ['', '   ']) {
      process.env.DEFAULT_ORGANIZATION_ID = empty
      assert.equal(resolveOrganizationSelector(requestWithHeaders()), DEMO_ORGANIZATION_ID)
    }
    process.env.DEFAULT_ORGANIZATION_ID = ` ${ORGANIZATION_ID} `
    assert.equal(resolveOrganizationSelector(requestWithHeaders()), ORGANIZATION_ID)
    for (const header of ['x-organization-id', 'x-dev-organization-id']) {
      for (const empty of ['', '   ']) {
        assert.throws(
          () => resolveOrganizationSelector(requestWithHeaders({ [header]: empty })),
          badRequest,
        )
      }
    }
    process.env.NODE_ENV = 'production'
    process.env.DEFAULT_ORGANIZATION_ID = ''
    assert.throws(() => resolveOrganizationSelector(requestWithHeaders()), badRequest)
    assert.equal(
      resolveOrganizationSelector(requestWithHeaders(), ORGANIZATION_ID),
      ORGANIZATION_ID,
    )
    assert.throws(
      () =>
        resolveOrganizationSelector(
          requestWithHeaders({ 'x-dev-organization-id': ORGANIZATION_ID }),
          ORGANIZATION_ID,
        ),
      badRequest,
    )
  } finally {
    if (previousMode === undefined) delete process.env.NODE_ENV
    else process.env.NODE_ENV = previousMode
    if (previousOrganization === undefined) delete process.env.DEFAULT_ORGANIZATION_ID
    else process.env.DEFAULT_ORGANIZATION_ID = previousOrganization
  }
})
