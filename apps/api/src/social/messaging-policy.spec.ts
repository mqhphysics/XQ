import 'reflect-metadata'
import assert from 'node:assert/strict'
import test from 'node:test'
import { MessagingService, canSendDirectMessages, visibleMessageBody } from './messaging.service'
import type { AuthenticatedSession, AuthService } from '../auth/auth.service'
import type { PrismaService } from '../database/prisma.service'
import type { SocialService } from './social.service'
import { ApiHttpException } from '../common/api-http.exception'
import { ERROR_CODES } from '@xiaoqiu/contracts'

function session(role?: string, scopeType = 'ORGANIZATION') {
  return {
    userId: 'sender',
    organizationId: 'org',
    user: { roles: role ? [{ role, scopeType, scopeId: 'org' }] : [] },
  } as AuthenticatedSession
}
test('all authenticated organization members may send irrespective of role; authentication remains required', async () => {
  for (const role of [
    undefined,
    'ORGANIZATION_ADMIN',
    'TOURNAMENT_ADMIN',
    'MATCH_REPORTER',
    'TEAM_CAPTAIN',
  ]) {
    const current = session(role)
    assert.equal(canSendDirectMessages(current), true)
  }
  assert.equal(canSendDirectMessages(session('PLATFORM_ADMIN', 'PLATFORM')), true)
  assert.equal(canSendDirectMessages(session('PLATFORM_ADMIN', 'ORGANIZATION')), true)
  let writes = 0
  const unauthorized = new ApiHttpException(401, {
    code: ERROR_CODES.UNAUTHORIZED,
    message: '请先登录',
  })
  const service = new MessagingService(
    {
      $transaction: () => {
        writes++
        throw Error('must not write')
      },
    } as unknown as PrismaService,
    {
      requireSession: async () => {
        throw unauthorized
      },
    } as unknown as AuthService,
    {} as SocialService,
  )
  await assert.rejects(
    service.sendMessage(undefined, 'recipient', { body: '内容', clientMessageId: 'policy-test' }),
    (error) => error === unauthorized,
  )
  assert.equal(writes, 0)
})

test('hidden private messages never expose their original body in participant responses', () => {
  assert.equal(
    visibleMessageBody({ body: '私信原文', moderationStatus: 'HIDDEN' }),
    '该消息已由管理员隐藏',
  )
  for (const moderationStatus of ['PENDING', 'APPROVED'])
    assert.equal(visibleMessageBody({ body: '私信原文', moderationStatus }), '私信原文')
})
