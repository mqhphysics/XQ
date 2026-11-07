import assert from 'node:assert/strict'
import test from 'node:test'
import { nativeTechnicalUrl, redirectedTechnicalUrl } from './technical-route.logic.weapp.ts'

test('technical workbench legacy and package links resolve to the same physical page', () => {
  assert.equal(
    redirectedTechnicalUrl('/pages/readonly-match-detail/index?matchId=match-1&technical=1'),
    '/recording/technical/index?matchId=match-1',
  )
  assert.equal(
    redirectedTechnicalUrl(nativeTechnicalUrl('match-1')),
    '/recording/technical/index?matchId=match-1',
  )
})
test('ordinary match details keep their existing gesture route and invalid links are not redirected', () => {
  assert.equal(redirectedTechnicalUrl('/pages/readonly-match-detail/index?matchId=match-1'), null)
  assert.equal(redirectedTechnicalUrl('/pages/readonly-match-detail/index?technical=1'), null)
  assert.equal(redirectedTechnicalUrl('/pages/post-detail/index?matchId=x&technical=1'), null)
  assert.equal(redirectedTechnicalUrl('/recording/technical/index?matchId=%xx'), null)
})
