import 'reflect-metadata'
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, unlink, rmdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import sharp from 'sharp'
import { sealKey } from '../ai-moderation/ai-vault'
import { SheetRecognitionService, parseSheetAnswer } from './sheet-recognition.service'
import type { PrismaService } from '../database/prisma.service'
import type { AuthService } from '../auth/auth.service'
import type { MatchReportService } from './match-report.service'

const sheet = {
  homeTeam: '甲队',
  awayTeam: '乙队',
  homeScore: 2,
  awayScore: 1,
  events: [],
  starters: { HOME: [], AWAY: [] },
  notes: '',
  warnings: [],
}
test('recognition accepts a fenced object, preserves missing scores, rejects malformed fields', () => {
  assert.equal(parseSheetAnswer('```json\n' + JSON.stringify(sheet) + '\n```').homeScore, 2)
  assert.equal(parseSheetAnswer(JSON.stringify({ ...sheet, homeScore: null })).homeScore, null)
  for (const value of [
    'bad',
    '[]',
    '{}',
    JSON.stringify({ ...sheet, homeScore: -1 }),
    JSON.stringify({ ...sheet, events: [{ kind: 'FAKE', side: 'HOME' }] }),
  ])
    assert.throws(() => parseSheetAnswer(value))
  assert.throws(() => parseSheetAnswer('x'.repeat(100001)))
})

test('recognition reuses authorization, private key, limits, timeout and returns a draft without writes', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'xiaoqiu-sheet-')),
    oldKeyFile = process.env.AI_REVIEW_KEY_FILE,
    oldFetch = globalThis.fetch
  process.env.AI_REVIEW_KEY_FILE = join(dir, 'key')
  const encryptedKey = await sealKey('FICTIONAL_SHEET_KEY', 'org')
  let editable = true,
    setting: { baseUrl: string; model: string; protocol: string; encryptedKey: string } | null = {
      baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
      model: 'vision-test',
      protocol: 'CHAT_COMPLETIONS',
      encryptedKey,
    }
  const db = {
    aiModerationSetting: { findUnique: async () => setting },
  } as unknown as PrismaService
  const auth = {
    requireSession: async (authorization: string) => {
      if (authorization !== 'valid') throw Error('Unauthorized')
      return { organizationId: 'org', userId: 'user' }
    },
  } as unknown as AuthService
  const reports = {
    get: async () => ({
      permissions: { canEdit: editable },
      homeTeam: { name: '甲队' },
      awayTeam: { name: '乙队' },
    }),
  } as unknown as MatchReportService
  const service = new SheetRecognitionService(db, auth, reports)
  const image =
    'data:image/png;base64,' +
    (
      await sharp({ create: { width: 16, height: 16, channels: 3, background: '#fff' } })
        .png()
        .toBuffer()
    ).toString('base64')
  let calls = 0,
    response = () =>
      new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(sheet) } }] }), {
        status: 200,
      })
  globalThis.fetch = async (_url, options) => {
    calls++
    const body = JSON.parse(String(options?.body))
    assert.equal(
      (options!.headers as Record<string, string>).authorization,
      'Bearer FICTIONAL_SHEET_KEY',
    )
    assert.equal(body.model, 'vision-test')
    assert.equal(body.enable_thinking, false)
    assert.equal(body.messages[1].content[1].type, 'image_url')
    assert(options?.signal)
    return response()
  }
  try {
    await t.test('requires a real session before contacting provider', async () => {
      await assert.rejects(
        service.recognize(undefined, 'match', { images: [image] }),
        /Unauthorized/,
      )
      assert.equal(calls, 0)
    })
    await t.test('enforces current match editing permission', async () => {
      editable = false
      await assert.rejects(service.recognize('valid', 'match', { images: [image] }), /不可编辑/)
      assert.equal(calls, 0)
      editable = true
    })
    await t.test('reports missing configuration and incompatible gateways', async () => {
      const original = setting!
      setting = null
      await assert.rejects(service.recognize('valid', 'match', { images: [image] }), /尚未配置/)
      setting = { ...original, protocol: 'REVIEW_GATEWAY' }
      await assert.rejects(service.recognize('valid', 'match', { images: [image] }), /审核网关/)
      setting = original
    })
    await t.test(
      'rejects excessive count, size and malformed images without a provider call',
      async () => {
        await assert.rejects(
          service.recognize('valid', 'match', { images: [image, image, image, image] }),
          /1至3/,
        )
        await assert.rejects(
          service.recognize('valid', 'match', { images: ['data:image/jpeg;base64,aGVsbG8='] }),
          /无法读取/,
        )
        await assert.rejects(
          service.recognize('valid', 'match', { images: ['https://example.test/a.png'] }),
          /仅支持/,
        )
        await assert.rejects(
          service.recognize('valid', 'match', {
            images: [
              'data:image/png;base64,' + Buffer.alloc(4 * 1024 * 1024 + 1).toString('base64'),
            ],
          }),
          /最多4MB/,
        )
        assert.equal(calls, 0)
      },
    )
    await t.test(
      'uses the organization key and returns fields without publishing or saving',
      async () => {
        const result = await service.recognize('valid', 'match', { images: [image], notes: '背面' })
        assert.equal(result.sheet.homeScore, 2)
        assert(!JSON.stringify(result).includes('FICTIONAL'))
        assert.equal(calls, 1)
      },
    )
    await t.test('blocks duplicate concurrent recognition and releases the slot', async () => {
      const original = globalThis.fetch
      let release!: () => void
      globalThis.fetch = async () => {
        await new Promise<void>((r) => {
          release = r
        })
        return response()
      }
      const first = service.recognize('valid', 'match', { images: [image] })
      while (!release) await new Promise((r) => setTimeout(r, 1))
      await assert.rejects(service.recognize('valid', 'match', { images: [image] }), /正在进行/)
      release()
      await first
      globalThis.fetch = original
      await service.recognize('valid', 'match', { images: [image] })
    })
    await t.test(
      'handles provider vision, credential, quota and server failures without leaking body',
      async () => {
        for (const status of [400, 401, 429, 500]) {
          response = () => new Response('secret upstream details', { status })
          await assert.rejects(
            service.recognize('valid', 'match', { images: [image] }),
            (error) => error instanceof Error && !error.message.includes('secret'),
          )
        }
      },
    )
    await t.test('handles invalid JSON and timeout with retryable errors', async () => {
      response = () =>
        new Response(JSON.stringify({ choices: [{ message: { content: '{incomplete' } }] }), {
          status: 200,
        })
      await assert.rejects(service.recognize('valid', 'match', { images: [image] }), /JSON不完整/)
      globalThis.fetch = async () => {
        throw new DOMException('timeout', 'TimeoutError')
      }
      await assert.rejects(service.recognize('valid', 'match', { images: [image] }), /识别超时/)
    })
  } finally {
    globalThis.fetch = oldFetch
    if (oldKeyFile === undefined) delete process.env.AI_REVIEW_KEY_FILE
    else process.env.AI_REVIEW_KEY_FILE = oldKeyFile
    await unlink(join(dir, 'key'))
    await rmdir(dir)
  }
})
