import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
async function key() {
  const file =
    process.env.AI_REVIEW_KEY_FILE ||
    resolve(
      process.env.MEDIA_ASSETS_DIRECTORY ||
        process.env.POST_MEDIA_DIRECTORY ||
        'private-data/media/managed',
      '../.ai-review.key',
    )
  await mkdir(dirname(file), { recursive: true })
  try {
    await writeFile(file, randomBytes(32), { flag: 'wx', mode: 0o600 })
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
  }
  const value = await readFile(file)
  if (value.length !== 32) throw Error('AI配置加密密钥损坏')
  return value
}
export async function sealKey(value: string, scope: string) {
  const iv = randomBytes(12),
    cipher = createCipheriv('aes-256-gcm', await key(), iv)
  cipher.setAAD(Buffer.from(scope))
  const body = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()])
  return JSON.stringify({
    body: body.toString('base64'),
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
  })
}
export async function openKey(value: string | null, scope: string) {
  if (!value) return ''
  const data = JSON.parse(value),
    cipher = createDecipheriv('aes-256-gcm', await key(), Buffer.from(data.iv, 'base64'))
  cipher.setAAD(Buffer.from(scope))
  cipher.setAuthTag(Buffer.from(data.tag, 'base64'))
  return Buffer.concat([cipher.update(Buffer.from(data.body, 'base64')), cipher.final()]).toString(
    'utf8',
  )
}
