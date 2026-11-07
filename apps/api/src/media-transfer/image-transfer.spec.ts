import assert from 'node:assert/strict'
import test from 'node:test'
import { randomUUID } from 'node:crypto'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { ERROR_CODES } from '@xiaoqiu/contracts'
import type { AuthService } from '../auth/auth.service'
import { ApiHttpException } from '../common/api-http.exception'
import { ImageTransferService } from './image-transfer.service'
import { IMAGE_PART_CHARACTERS } from './image-transfer.dto'

const status = (code: number) => (error: unknown) =>
  error instanceof ApiHttpException && error.getStatus() === code
async function fixture() {
  const work = process.platform === 'win32' ? 'D:/MuDevSpace/XQ-work' : tmpdir()
  const folder = await mkdtemp(join(work, 'xq-image-transfer-test-'))
  const previous = process.env.IMAGE_TRANSFER_DIRECTORY
  process.env.IMAGE_TRANSFER_DIRECTORY = folder
  const owner = { userId: randomUUID(), organizationId: randomUUID() }
  const other = { ...owner, userId: randomUUID() },
    foreign = { ...owner, organizationId: randomUUID() }
  const service = new ImageTransferService({
    requireSession: async (token: string) => {
      if (token === 'owner') return owner
      if (token === 'other') return other
      if (token === 'foreign') return foreign
      throw new ApiHttpException(401, {
        code: ERROR_CODES.UNAUTHORIZED,
        message: 'test session expired',
      })
    },
  } as unknown as AuthService)
  return {
    folder,
    service,
    owner,
    other,
    foreign,
    close: async () => {
      if (previous === undefined) delete process.env.IMAGE_TRANSFER_DIRECTORY
      else process.env.IMAGE_TRANSFER_DIRECTORY = previous
      assert.equal(dirname(resolve(folder)), resolve(work))
      await rm(folder, { recursive: true, force: true })
    },
  }
}

test('image chunks resume idempotently, refuse replacement and cannot cross account or organization', async () => {
  const f = await fixture()
  try {
    const id = randomUUID(),
      source = 'data:image/png;base64,' + Buffer.alloc(900000, 7).toString('base64')
    const start = await f.service.begin('owner', id, source.length)
    assert.equal(start.parts, 3)
    assert.equal(start.partCharacters, IMAGE_PART_CHARACTERS)
    assert.deepEqual(start.received, [])
    await assert.rejects(f.service.begin(undefined, id, source.length), status(401))
    await assert.rejects(f.service.begin('owner', '../escape', source.length), status(400))
    await assert.rejects(f.service.begin('owner', id, source.length + 1), status(409))
    const first = source.slice(0, IMAGE_PART_CHARACTERS)
    await f.service.part('owner', id, 0, first)
    assert.deepEqual((await f.service.part('owner', id, 0, first)).received, [0])
    await assert.rejects(f.service.part('owner', id, 0, 'X' + first.slice(1)), status(409))
    await assert.rejects(f.service.part('other', id, 0, first), status(404))
    await assert.rejects(f.service.part('foreign', id, 0, first), status(404))
    await assert.rejects(f.service.resolveImages(f.other, [id], 9), status(404))
    await assert.rejects(f.service.resolveImages(f.foreign, [id], 9), status(404))
    await assert.rejects(f.service.resolveImages(f.owner, [id], 9), status(409))
    for (let index = 1; index < start.parts; index++)
      await f.service.part(
        'owner',
        id,
        index,
        source.slice(index * IMAGE_PART_CHARACTERS, (index + 1) * IMAGE_PART_CHARACTERS),
      )
    assert.deepEqual(await f.service.resolveImages(f.owner, [id], 9), [source])
    assert.deepEqual((await f.service.begin('owner', id, source.length)).received, [0, 1, 2])
    await assert.rejects(f.service.resolveImages(f.owner, [id, id], 9), status(400))
    await assert.rejects(f.service.part('owner', id, 3, 'invalid'), status(400))
  } finally {
    await f.close()
  }
})

test('expired uploads restart empty and malformed or oversized payloads remain rejected', async () => {
  const f = await fixture()
  try {
    const id = randomUUID(),
      source = 'data:image/png;base64,' + Buffer.alloc(100, 3).toString('base64')
    await f.service.begin('owner', id, source.length)
    await assert.rejects(f.service.part('owner', id, 0, '短'.repeat(source.length)), status(400))
    await f.service.part('owner', id, 0, source)
    const file = join(f.folder, f.owner.organizationId, f.owner.userId, id, 'manifest.json')
    const manifest = JSON.parse(await readFile(file, 'utf8'))
    manifest.expiresAt = Date.now() - 1
    await writeFile(file, JSON.stringify(manifest))
    await assert.rejects(f.service.resolveImages(f.owner, [id], 9), status(409))
    assert.deepEqual((await f.service.begin('owner', id, source.length)).received, [])
    await assert.rejects(f.service.begin('owner', randomUUID(), 5600001), status(400))
    const invalid = randomUUID()
    await f.service.begin('owner', invalid, 40)
    await f.service.part('owner', invalid, 0, 'a'.repeat(40))
    await assert.rejects(f.service.resolveImages(f.owner, [invalid], 9), status(400))
  } finally {
    await f.close()
  }
})

test('completed uploads release the pending-count quota while retaining an hour for response-loss retries', async () => {
  const f = await fixture()
  try {
    const source = 'data:image/png;base64,' + Buffer.alloc(100, 3).toString('base64')
    const ids = Array.from({ length: 36 }, () => randomUUID())
    for (const id of ids) await f.service.begin('owner', id, source.length)
    await assert.rejects(f.service.begin('owner', randomUUID(), source.length), status(429))
    await f.service.part('owner', ids[0]!, 0, source)
    await f.service.completeImages(f.owner, [ids[0]!])
    assert.deepEqual(await f.service.resolveImages(f.owner, [ids[0]!], 9), [source])
    const file = join(f.folder, f.owner.organizationId, f.owner.userId, ids[0]!, 'manifest.json')
    const manifest = JSON.parse(await readFile(file, 'utf8'))
    assert(manifest.completedAt)
    assert(manifest.expiresAt <= Date.now() + 3600000)
    await f.service.begin('owner', randomUUID(), source.length)
    manifest.expiresAt = Date.now() - 1
    await writeFile(file, JSON.stringify(manifest))
    await f.service.cleanupExpired()
    await assert.rejects(f.service.resolveImages(f.owner, [ids[0]!], 9), status(404))
    // Finishing another item frees a slot; the same immutable upload ID can start again.
    await f.service.completeImages(f.owner, [ids[1]!])
    assert.deepEqual((await f.service.begin('owner', ids[0]!, source.length)).received, [])
    await f.service.part('owner', ids[0]!, 0, source)
    assert.deepEqual(await f.service.resolveImages(f.owner, [ids[0]!], 9), [source])
  } finally {
    await f.close()
  }
})

test('an interrupted manifest write can restart only the same owned upload', async () => {
  const f = await fixture()
  try {
    const id = randomUUID(),
      source = 'data:image/png;base64,' + Buffer.alloc(100, 3).toString('base64')
    await f.service.begin('owner', id, source.length)
    await f.service.part('owner', id, 0, source)
    await writeFile(
      join(f.folder, f.owner.organizationId, f.owner.userId, id, 'manifest.json'),
      '{',
    )
    await assert.rejects(f.service.resolveImages(f.owner, [id], 9), status(404))
    const state = await f.service.begin('owner', id, source.length)
    assert.deepEqual(state.received, [])
    await f.service.part('owner', id, 0, source)
    await f.service.completeImages(f.owner, [id])
    assert.deepEqual(await f.service.resolveImages(f.owner, [id], 9), [source])
  } finally {
    await f.close()
  }
})
