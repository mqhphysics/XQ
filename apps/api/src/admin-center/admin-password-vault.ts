import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'

type Credential = { passwordHash: string; passwordSalt: string }
export interface AssignedPassword {
  encrypted: string
  iv: string
  tag: string
  fingerprint: string
}

function keyPath() {
  return (
    process.env.ADMIN_PASSWORD_KEY_FILE ||
    resolve(
      process.env.POST_MEDIA_DIRECTORY ||
        resolve(__dirname, '../../../../private-data/media/posts'),
      '../../admin-secrets/login-password.key',
    )
  )
}
async function vaultKey(create: boolean): Promise<Buffer | null> {
  const file = keyPath()
  try {
    const key = await readFile(file)
    if (key.length !== 32) throw new Error('管理密码密钥格式不正确')
    return key
  } catch (error) {
    if (!error || typeof error !== 'object' || !('code' in error) || error.code !== 'ENOENT')
      throw error
    if (!create) return null
    await mkdir(dirname(file), { recursive: true })
    try {
      await writeFile(file, randomBytes(32), { flag: 'wx', mode: 0o600 })
    } catch (error) {
      if (!error || typeof error !== 'object' || !('code' in error) || error.code !== 'EEXIST')
        throw error
    }
    return vaultKey(false)
  }
}
export function credentialFingerprint(credential: Credential) {
  return createHash('sha256')
    .update(`${credential.passwordHash}:${credential.passwordSalt}`)
    .digest('hex')
}
export async function sealAssignedPassword(
  password: string,
  credential: Credential,
  scope: string,
): Promise<AssignedPassword> {
  const key = await vaultKey(true)
  if (!key) throw new Error('管理密码密钥未准备好')
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  cipher.setAAD(Buffer.from(scope))
  const encrypted = Buffer.concat([cipher.update(password, 'utf8'), cipher.final()])
  return {
    encrypted: encrypted.toString('base64'),
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    fingerprint: credentialFingerprint(credential),
  }
}
export async function openAssignedPassword(value: AssignedPassword, scope: string) {
  const key = await vaultKey(false)
  if (!key) return null
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(value.iv, 'base64'))
  decipher.setAAD(Buffer.from(scope))
  decipher.setAuthTag(Buffer.from(value.tag, 'base64'))
  return Buffer.concat([
    decipher.update(Buffer.from(value.encrypted, 'base64')),
    decipher.final(),
  ]).toString('utf8')
}
