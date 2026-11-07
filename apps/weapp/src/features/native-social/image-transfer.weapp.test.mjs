import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'

function harness({
  values,
  changeDuringRead = false,
  changeAfterLastPart = false,
  loseFirstPartReply = false,
  existingUploads,
}) {
  let token = 'first-account',
    lost = false
  const calls = [],
    uploads = existingUploads || new Map()
  const module = { exports: {} }
  const code = ts.transpileModule(
    readFileSync(new URL('./image-transfer.weapp.ts', import.meta.url), 'utf8'),
    {
      compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS },
    },
  ).outputText
  vm.runInNewContext(code, {
    module,
    exports: module.exports,
    require(name) {
      if (name.endsWith('/session')) return { readSession: () => ({ accessToken: token }) }
      if (name === './images.weapp')
        return {
          nativeImageData: async (image) => {
            if (changeDuringRead) token = 'second-account'
            return values[image.path]
          },
        }
      if (name.endsWith('/product.repository'))
        return {
          productRequest: async (path, options) => {
            calls.push({ path, body: options.data })
            const id = path.split('/')[3]
            if (!path.includes('/parts/')) {
              if (!uploads.has(id))
                uploads.set(id, {
                  parts: Math.ceil(options.data.characters / 524288),
                  characters: options.data.characters,
                  received: new Set(),
                })
              const row = uploads.get(id)
              return { id, parts: row.parts, partCharacters: 524288, received: [...row.received] }
            }
            const index = Number(path.split('/').at(-1)),
              row = uploads.get(id)
            row.received.add(index)
            if (loseFirstPartReply && !lost) {
              lost = true
              throw new Error('response lost after storage')
            }
            if (changeAfterLastPart && index === row.parts - 1) token = 'second-account'
            return {}
          },
        }
      throw new Error('Unexpected import ' + name)
    },
  })
  return { submit: module.exports.nativeImageSubmission, calls, uploads }
}

test('small native images keep the compatible inline path without starting a transfer', async () => {
  const h = harness({ values: { small: 'data:image/png;base64,AAAA' } })
  const result = await h.submit([{ path: 'small', mime: 'image/png' }])
  assert.deepEqual(JSON.parse(JSON.stringify(result)), {
    imageDataUrls: ['data:image/png;base64,AAAA'],
  })
  assert.equal(h.calls.length, 0)
})
test('multiple native images use sub-megabyte parts and resume a stored chunk after a lost response', async () => {
  const h = harness({
    values: {
      first: 'data:image/png;base64,' + 'A'.repeat(900000),
      second: 'data:image/png;base64,' + 'B'.repeat(400000),
    },
    loseFirstPartReply: true,
  })
  const images = [
    { path: 'first', mime: 'image/png' },
    { path: 'second', mime: 'image/png' },
  ]
  await assert.rejects(h.submit(images), /response lost/)
  const retained = images[0].transferId
  const progress = []
  const result = await h.submit(images, (value) => progress.push(value))
  assert.equal(result.imageUploadIds[0], retained)
  assert.equal(result.imageUploadIds.length, 2)
  assert.equal(progress.at(-1), 100)
  assert(h.calls.every((call) => Buffer.byteLength(JSON.stringify(call.body)) < 950000))
  assert.equal(h.calls.filter((call) => call.path.endsWith(retained + '/parts/0')).length, 1)
  const count = h.calls.filter((call) => call.path.includes('/parts/')).length
  await h.submit(images)
  assert.equal(h.calls.filter((call) => call.path.includes('/parts/')).length, count)
})
test('account changes during file reading or after the last chunk never return another account submission', async () => {
  const small = harness({ values: { small: 'data:image/png;base64,AAAA' }, changeDuringRead: true })
  await assert.rejects(small.submit([{ path: 'small', mime: 'image/png' }]), /账号已切换/)
  assert.equal(small.calls.length, 0)
  const large = harness({
    values: { large: 'data:image/png;base64,' + 'A'.repeat(900000) },
    changeAfterLastPart: true,
  })
  await assert.rejects(large.submit([{ path: 'large', mime: 'image/png' }]), /账号已切换/)
})

test('a reconstructed page resumes persisted upload IDs after a failed chunk response', async () => {
  const values = { photo: 'data:image/png;base64,' + 'A'.repeat(900000) }
  const first = harness({ values, loseFirstPartReply: true })
  const images = [{ path: 'photo', mime: 'image/png' }]
  let persisted
  await assert.rejects(
    first.submit(
      images,
      () => {},
      () => {
        persisted = JSON.parse(JSON.stringify(images))
      },
    ),
    /response lost/,
  )
  assert(persisted[0].transferId)
  const next = harness({ values, existingUploads: first.uploads })
  const result = await next.submit(persisted)
  assert.equal(result.imageUploadIds[0], persisted[0].transferId)
  assert.equal(next.calls.filter((call) => call.path.endsWith('/parts/0')).length, 0)
  assert.equal(next.calls.filter((call) => call.path.endsWith('/parts/1')).length, 1)
})
