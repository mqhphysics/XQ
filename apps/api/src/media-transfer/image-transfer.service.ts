import { Inject, Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common'
import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import type { Dirent } from 'node:fs'
import { resolve } from 'node:path'
import { AuthService, type AuthenticatedSession } from '../auth/auth.service'
import { ApiHttpException } from '../common/api-http.exception'
import { ERROR_CODES } from '@xiaoqiu/contracts'
import { IMAGE_PART_CHARACTERS } from './image-transfer.dto'

type Owner = Pick<AuthenticatedSession, 'organizationId' | 'userId'>
type Manifest = { characters: number; expiresAt: number; parts: number; completedAt?: number }
const lifetime = 24 * 60 * 60 * 1000
const bad = (message: string, status: 400 | 404 | 409 | 429 = 400) =>
  new ApiHttpException(status, {
    code: status === 404 ? ERROR_CODES.NOT_FOUND : ERROR_CODES.CONFLICT,
    message,
  })
const uuid = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i

@Injectable()
export class ImageTransferService implements OnModuleInit, OnModuleDestroy {
  private readonly pending = new Map<string, Promise<void>>()
  private readonly logger = new Logger(ImageTransferService.name)
  private cleanupTimer?: ReturnType<typeof setInterval>
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}
  onModuleInit() {
    const clean = () =>
      void this.cleanupExpired().catch(() =>
        this.logger.warn('Staged image cleanup could not finish'),
      )
    clean()
    this.cleanupTimer = setInterval(clean, 6 * 60 * 60 * 1000)
    this.cleanupTimer.unref()
  }
  onModuleDestroy() {
    if (this.cleanupTimer) clearInterval(this.cleanupTimer)
  }
  private root() {
    return (
      process.env.IMAGE_TRANSFER_DIRECTORY ||
      resolve(
        process.env.POST_MEDIA_DIRECTORY ||
          resolve(__dirname, '../../../../private-data/media/posts'),
        '..',
        'image-transfers',
      )
    )
  }
  async cleanupExpired() {
    const root = this.root()
    let organizations: Dirent[]
    try {
      organizations = await readdir(root, { withFileTypes: true })
    } catch (issue) {
      if ((issue as NodeJS.ErrnoException).code === 'ENOENT') return
      throw issue
    }
    for (const org of organizations) {
      if (!org.isDirectory() || !uuid.test(org.name)) continue
      for (const user of await readdir(resolve(root, org.name), { withFileTypes: true })) {
        if (!user.isDirectory() || !uuid.test(user.name)) continue
        const owner = { organizationId: org.name, userId: user.name }
        await this.exclusive(owner, async () => {
          const userRoot = this.directory(owner)
          for (const transfer of await readdir(userRoot, { withFileTypes: true })) {
            if (!transfer.isDirectory() || !uuid.test(transfer.name)) continue
            const folder = this.directory(owner, transfer.name)
            let manifest: Manifest
            try {
              manifest = JSON.parse(
                await readFile(resolve(folder, 'manifest.json'), 'utf8'),
              ) as Manifest
            } catch {
              // A stopped process may leave an unfinished initial manifest.
              if ((await stat(folder)).mtimeMs + lifetime <= Date.now())
                await rm(folder, { recursive: true, force: true })
              continue
            }
            if (manifest.expiresAt <= Date.now()) await rm(folder, { recursive: true, force: true })
          }
        })
      }
    }
  }
  private directory(owner: Owner, id?: string) {
    if (!uuid.test(owner.organizationId) || !uuid.test(owner.userId) || (id && !uuid.test(id)))
      throw bad('图片上传标识无效')
    return resolve(
      this.root(),
      owner.organizationId,
      owner.userId,
      ...(id ? [id.toLowerCase()] : []),
    )
  }
  private async exclusive<T>(owner: Owner, action: () => Promise<T>): Promise<T> {
    const key = `${owner.organizationId}:${owner.userId}`
    const previous = this.pending.get(key) || Promise.resolve()
    let release!: () => void
    const current = new Promise<void>((resolve) => {
      release = resolve
    })
    const tail = previous.then(() => current)
    this.pending.set(key, tail)
    await previous
    try {
      return await action()
    } finally {
      release()
      if (this.pending.get(key) === tail) this.pending.delete(key)
    }
  }
  private async manifest(owner: Owner, id: string): Promise<Manifest> {
    let value: Manifest
    try {
      value = JSON.parse(
        await readFile(resolve(this.directory(owner, id), 'manifest.json'), 'utf8'),
      ) as Manifest
    } catch {
      throw bad('图片上传不存在，请重新上传', 404)
    }
    if (value.expiresAt <= Date.now()) throw bad('图片上传已过期，请重新上传', 409)
    return value
  }
  private async describe(owner: Owner, id: string, manifest: Manifest) {
    const files = await readdir(this.directory(owner, id))
    return {
      id,
      partCharacters: IMAGE_PART_CHARACTERS,
      parts: manifest.parts,
      expiresAt: new Date(manifest.expiresAt).toISOString(),
      received: files
        .filter((name) => /^\d+\.part$/.test(name))
        .map((name) => Number(name.split('.')[0]))
        .sort((a, b) => a - b),
    }
  }
  async begin(authorization: string | undefined, id: string, characters: number) {
    const owner = await this.auth.requireSession(authorization)
    if (!Number.isInteger(characters) || characters < 32 || characters > 5600000)
      throw bad('单张图片需小于4 MiB')
    return this.exclusive(owner, async () => {
      const root = this.directory(owner),
        target = this.directory(owner, id)
      await mkdir(root, { recursive: true })
      let allocated = 0,
        count = 0
      for (const file of await readdir(root, { withFileTypes: true })) {
        if (!file.isDirectory() || !uuid.test(file.name)) continue
        const folder = resolve(root, file.name)
        let existing: Manifest
        try {
          existing = JSON.parse(
            await readFile(resolve(folder, 'manifest.json'), 'utf8'),
          ) as Manifest
        } catch {
          // A retry of the same owned upload can recover an interrupted initial write.
          if (file.name === id.toLowerCase()) await rm(folder, { recursive: true, force: true })
          continue
        }
        if (existing.expiresAt <= Date.now()) {
          await rm(folder, { recursive: true, force: true })
          continue
        }
        if (file.name === id.toLowerCase()) {
          if (existing.characters !== characters) throw bad('同一图片上传编号不能替换文件', 409)
          return this.describe(owner, id, existing)
        }
        allocated += existing.characters
        if (!existing.completedAt) count++
      }
      if (count >= 36) throw bad('未完成的图片上传过多，请完成已有发布后重试', 429)
      if (allocated + characters > 64_000_000) throw bad('图片暂存空间已满，请稍后重试', 429)
      const manifest: Manifest = {
        characters,
        parts: Math.ceil(characters / IMAGE_PART_CHARACTERS),
        expiresAt: Date.now() + lifetime,
      }
      await mkdir(target, { recursive: true })
      await writeFile(resolve(target, 'manifest.json'), JSON.stringify(manifest), {
        flag: 'wx',
        mode: 0o600,
      })
      return this.describe(owner, id, manifest)
    })
  }
  async part(authorization: string | undefined, id: string, index: number, content: string) {
    const owner = await this.auth.requireSession(authorization)
    return this.exclusive(owner, async () => {
      const manifest = await this.manifest(owner, id)
      const expected = Math.min(
        IMAGE_PART_CHARACTERS,
        manifest.characters - index * IMAGE_PART_CHARACTERS,
      )
      if (
        !Number.isInteger(index) ||
        index < 0 ||
        index >= manifest.parts ||
        content.length !== expected ||
        !/^[\x20-\x7e]+$/.test(content)
      )
        throw bad('图片分片内容不完整，请重试')
      const target = resolve(this.directory(owner, id), `${index}.part`)
      try {
        await writeFile(target, content, { flag: 'wx', encoding: 'ascii', mode: 0o600 })
      } catch (issue) {
        if ((issue as NodeJS.ErrnoException).code !== 'EEXIST') throw issue
        if ((await readFile(target, 'ascii')) !== content)
          throw bad('同一图片分片编号不能替换内容', 409)
      }
      return this.describe(owner, id, manifest)
    })
  }
  async resolveImages(owner: Owner, ids: string[], maximum: number): Promise<string[]> {
    if (ids.length > maximum || new Set(ids).size !== ids.length)
      throw bad('图片数量或上传标识无效')
    return this.exclusive(owner, async () => {
      const values: string[] = []
      let total = 0
      for (const id of ids) {
        const manifest = await this.manifest(owner, id)
        total += manifest.characters
        if (total > 24_000_000) throw bad('图片合计过大，请减少图片后再发布')
        const parts: string[] = []
        for (let index = 0; index < manifest.parts; index++) {
          try {
            parts.push(await readFile(resolve(this.directory(owner, id), `${index}.part`), 'ascii'))
          } catch {
            throw bad('图片尚未上传完整，请重试', 409)
          }
        }
        const value = parts.join('')
        if (
          value.length !== manifest.characters ||
          !/^data:image\/(?:jpeg|png|webp|gif);base64,[a-zA-Z0-9+/]+={0,2}$/.test(value)
        )
          throw bad('图片内容无效，请重新选择')
        // The existing media pipeline still checks decoded size, signature, dimensions and moderation.
        values.push(value)
      }
      return values
    })
  }
  async completeImages(owner: Owner, ids: string[]) {
    if (!ids.length) return
    await this.exclusive(owner, async () => {
      for (const id of ids) {
        try {
          const manifest = await this.manifest(owner, id)
          manifest.completedAt ||= Date.now()
          // Keep a response-loss retry window; old retries can upload the same immutable ID again.
          manifest.expiresAt = Math.min(manifest.expiresAt, manifest.completedAt + 60 * 60 * 1000)
          const folder = this.directory(owner, id),
            temporary = resolve(folder, `manifest-${randomUUID()}.tmp`)
          try {
            await writeFile(temporary, JSON.stringify(manifest), { flag: 'wx', mode: 0o600 })
            await rename(temporary, resolve(folder, 'manifest.json'))
          } finally {
            await rm(temporary, { force: true })
          }
        } catch {
          this.logger.warn('Published image transfer cleanup deferred')
        }
      }
    })
  }
}
