import 'reflect-metadata'
import assert from 'node:assert/strict'
import test from 'node:test'
import { plainToInstance } from 'class-transformer'
import { validate } from 'class-validator'
import { policies,chatCompatibility } from './ai-policy'
import { AiModerationService } from './ai-moderation.service'
import { AiModerationDecisionDto } from './ai-moderation.dto'
import { AdminCenterCreatePostDto, AdminContentDecisionDto } from '../admin-center/admin-center.dto'
import type { PrismaService } from '../database/prisma.service'

test('Qwen synchronous JSON calls disable thinking without sending provider options elsewhere',()=>{
  assert.deepEqual(chatCompatibility('https://dashscope.aliyuncs.com/compatible-mode/v1'),{enable_thinking:false})
  assert.deepEqual(chatCompatibility('https://workspace.cn-beijing.maas.aliyuncs.com/compatible-mode/v1'),{enable_thinking:false})
  assert.deepEqual(chatCompatibility('https://api.deepseek.com/v1'),{})
  assert.deepEqual(chatCompatibility('https://dashscope.aliyuncs.com.attacker.test/v1'),{})
})

test('publication order retains existing defaults and permits either order per content kind', async () => {
  assert.equal(policies({}).POST.publication, 'AI_FIRST')
  assert.equal(policies({}).USER_AVATAR.publication, 'PUBLIC_FIRST')
  let value: unknown = {
    USER_AVATAR: { publication: 'AI_FIRST' },
    POST: { publication: 'PUBLIC_FIRST' },
  }
  const db = {
      aiModerationSetting: { findUnique: async () => ({ enabled: true, policies: value }) },
    } as unknown as PrismaService,
    service = new AiModerationService(db)
  assert.equal(await service.requiresPreReview(db, 'org', 'USER_AVATAR'), true)
  assert.equal(await service.requiresPreReview(db, 'org', 'POST'), false)
  value = { USER_AVATAR: { publication: 'AI_FIRST', enabled: false } }
  assert.equal(await service.requiresPreReview(db, 'org', 'USER_AVATAR'), false)
})
test('routine approvals and content creation accept omitted notes; blocking still requires a reason', async () => {
  assert.deepEqual(
    await validate(plainToInstance(AiModerationDecisionDto, { decision: 'ALLOW' })),
    [],
  )
  assert.deepEqual(
    await validate(
      plainToInstance(AdminContentDecisionDto, {
        action: 'APPROVE',
        expectedUpdatedAt: '2026-10-24T00:00:00.000Z',
      }),
    ),
    [],
  )
  assert.deepEqual(
    await validate(
      plainToInstance(AdminCenterCreatePostDto, {
        tournamentId: '00000000-0000-4000-8000-000000000001',
        title: '官方公告',
        body: '新增公告',
      }),
    ),
    [],
  )
  await assert.rejects(
    new AiModerationService({} as PrismaService).human('org', 'user', 'job', 'BLOCK'),
    /请说明原因/,
  )
})
