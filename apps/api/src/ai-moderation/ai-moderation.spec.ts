import 'reflect-metadata'
import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { mkdtemp, unlink, rmdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { policies, humanReviewRequired, endpoint } from './ai-policy'
import { sealKey, openKey } from './ai-vault'
import { AiModerationService } from './ai-moderation.service'
import type { PrismaService } from '../database/prisma.service'
import type { AiModerationSetting } from '../generated/prisma/client'
test('review policies preserve abnormal-content review and a bounded sampling rate', () => {
  const p = policies({ POST: { enabled: true, human: 'SAMPLE', sampleRate: 20 } })
  assert.equal(humanReviewRequired(p.POST, 'ALLOW', 0.19), true)
  assert.equal(humanReviewRequired(p.POST, 'ALLOW', 0.21), false)
  assert.equal(humanReviewRequired(p.POST, 'BLOCK', 0.99), true)
  assert.equal(p.USER_AVATAR.human, 'ALL')
  assert.equal(policies({ POST: { sampleRate: 999 } }).POST.sampleRate, 100)
  assert.throws(() => endpoint('https://secret:password@example.test/v1'))
  assert.throws(() => endpoint('https://example.test/v1?api_key=secret'))
})
test('AI service never reads or queues private-message resources', async () => {
  const db = new Proxy(
    {},
    {
      get() {
        throw Error('Private data must not be read')
      },
    },
  ) as PrismaService
  const service = new AiModerationService(db)
  assert.equal(await service.source(db, 'org', 'DIRECT_MESSAGE', 'id'), null)
  await service.enqueue(db, 'org', 'DIRECT_MESSAGE' as 'POST', 'id')
})
test('provider keys stay encrypted and are bound to the organization', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'xiaoqiu-ai-')),
    file = join(directory, 'key'),
    old = process.env.AI_REVIEW_KEY_FILE
  process.env.AI_REVIEW_KEY_FILE = file
  try {
    const value = await sealKey('FICTIONAL_TEST_KEY', 'org-a')
    assert(!value.includes('FICTIONAL_TEST_KEY'))
    assert.equal(await openKey(value, 'org-a'), 'FICTIONAL_TEST_KEY')
    await assert.rejects(openKey(value, 'org-b'))
  } finally {
    if (old === undefined) delete process.env.AI_REVIEW_KEY_FILE
    else process.env.AI_REVIEW_KEY_FILE = old
    await unlink(file)
    await rmdir(directory)
  }
})
test('OpenAI-compatible provider contract validates its result and fails closed on malformed output', async () => {
  let malformed = false,
    received: Record<string, any> | null = null
  const server = createServer(async (req, res) => {
    let raw = ''
    for await (const chunk of req) raw += String(chunk)
    received = JSON.parse(raw)
    assert.equal(req.url, '/v1/chat/completions')
    res.setHeader('content-type', 'application/json')
    res.end(
      JSON.stringify({
        choices: [
          {
            message: {
              content: malformed
                ? 'not-json'
                : JSON.stringify({ decision: 'ALLOW', summary: '模拟服务测试通过' }),
            },
          },
        ],
      }),
    )
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  try {
    const address = server.address()
    assert(address && typeof address !== 'string')
    const setting = {
        organizationId: 'test',
        baseUrl: `http://127.0.0.1:${address.port}/v1`,
        protocol: 'CHAT_COMPLETIONS',
        model: 'fixture-model',
        encryptedKey: null,
      } as AiModerationSetting,
      service = new AiModerationService({} as PrismaService)
    assert.equal(
      (await service.ask(setting, 'FICTIONAL_PUBLIC_TEXT', ['data:image/webp;base64,Zg==']))
        .decision,
      'ALLOW',
    )
    assert(received)
    assert.equal((received as Record<string, any>).model, 'fixture-model')
    assert.equal((received as Record<string, any>).messages[1].content[1].type, 'image_url')
    malformed = true
    await assert.rejects(service.ask(setting, 'FICTIONAL_PUBLIC_TEXT', []), /JSON/)
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    )
  }
})
