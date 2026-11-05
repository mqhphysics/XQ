import assert from 'node:assert/strict'
import test from 'node:test'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import { ManagedMediaController } from './managed-media.controller'
import { ManagedMediaService } from './managed-media.service'
import { compressResponse } from '../common/http-performance'

test('GIF byte ranges preserve the complete file and stay within the WeChat response limit', async () => {
  const gif = Buffer.alloc(2 * 1024 * 1024 + 37)
  for (let i = 0; i < gif.length; i++) gif[i] = i % 251
  const module = await Test.createTestingModule({
    controllers: [ManagedMediaController],
    providers: [
      {
        provide: ManagedMediaService,
        useValue: {
          content: async (_auth: unknown, _id: unknown, poster: boolean) => ({
            body: gif,
            mimeType: poster ? 'image/webp' : 'image/gif',
          }),
        },
      },
    ],
  }).compile()
  const app = module.createNestApplication({ logger: false })
  app.setGlobalPrefix('api')
  app.use(compressResponse)
  await app.init()
  try {
    const server = app.getHttpServer(),
      url = '/api/media-assets/test-gif/content',
      chunks: Buffer[] = []
    const full = await request(server).get(url).expect(200)
    assert.deepEqual(full.body, gif)
    for (let start = 0; start < gif.length; start += 512 * 1024) {
      const end = Math.min(start + 512 * 1024, gif.length) - 1
      const r = await request(server).get(url).set('Range', `bytes=${start}-${end}`).expect(206)
      assert.equal(r.headers['content-range'], `bytes ${start}-${end}/${gif.length}`)
      assert.equal(r.headers['content-length'], String(end - start + 1))
      assert.equal(r.headers['content-type'], 'image/gif')
      chunks.push(r.body as Buffer)
    }
    assert.deepEqual(Buffer.concat(chunks), gif)
    await request(server).get(url).set('Range', `bytes=${gif.length}-`).expect(416)
    const poster = await request(server)
      .get('/api/media-assets/test-gif/poster')
      .set('Range', 'bytes=0-5')
      .expect(200)
    assert.deepEqual(poster.body, gif)
  } finally {
    await app.close()
  }
})
