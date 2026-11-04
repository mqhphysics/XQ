import { existsSync } from 'node:fs'
import { lstat, mkdir, readFile, realpath, rmdir, unlink, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path'
import type { ValidatedMedia } from './media-image'
import { goalMediaEnabled } from './media-policy'

export class MediaStorage {
  readonly root: string
  constructor() {
    const configured = process.env.MEDIA_ASSETS_DIRECTORY
    if (configured && !isAbsolute(configured))
      throw new Error('MEDIA_ASSETS_DIRECTORY must be absolute')
    if (!configured && process.env.NODE_ENV === 'production' && goalMediaEnabled())
      throw new Error('Production requires a durable MEDIA_ASSETS_DIRECTORY')
    let repository = process.cwd()
    while (
      !existsSync(resolve(repository, 'pnpm-workspace.yaml')) &&
      dirname(repository) !== repository
    )
      repository = dirname(repository)
    this.root = configured || resolve(repository, 'private-data/media/managed')
  }

  async store(organizationId: string, id: string, media: ValidatedMedia) {
    const directory = await this.directory(organizationId, id, true)
    await writeFile(resolve(directory, 'content'), media.body, { flag: 'wx' })
    await writeFile(resolve(directory, 'poster'), media.poster, { flag: 'wx' })
  }

  async read(organizationId: string, id: string, poster: boolean) {
    const directory = await this.directory(organizationId, id, false)
    const file = resolve(directory, poster ? 'poster' : 'content')
    if (!(await lstat(file)).isFile() || (await lstat(file)).isSymbolicLink())
      throw new Error('Unsafe media file')
    return readFile(file)
  }

  // Only aborted uploads are removed. Moderation/deletion keeps bytes recoverable.
  async abort(organizationId: string, id: string) {
    try {
      const directory = await this.directory(organizationId, id, false)
      for (const name of ['content', 'poster'])
        await unlink(resolve(directory, name)).catch(() => {})
      await rmdir(directory).catch(() => {})
    } catch {
      /* Nothing was stored, or an unsafe path must not be touched. */
    }
  }

  private async directory(organizationId: string, id: string, create: boolean) {
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
    if (!uuid.test(organizationId) || !uuid.test(id)) throw new Error('Invalid media scope')
    if (create) await mkdir(this.root, { recursive: true })
    const canonicalRoot = await realpath(this.root)
    let directory = canonicalRoot
    for (const part of [organizationId, id]) {
      directory = resolve(directory, part)
      if (create)
        await mkdir(directory).catch((error: NodeJS.ErrnoException) => {
          if (error.code !== 'EEXIST') throw error
        })
      if ((await lstat(directory)).isSymbolicLink())
        throw new Error('Media directory cannot be a symlink')
      const canonical = await realpath(directory)
      const child = relative(canonicalRoot, canonical)
      if (!child || child === '..' || child.startsWith(`..${sep}`) || isAbsolute(child))
        throw new Error('Media path escapes storage')
    }
    return directory
  }
}
