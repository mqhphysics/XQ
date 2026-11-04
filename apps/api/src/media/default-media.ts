import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

export const DEFAULT_COVERS = {
  user: '/api/media/defaults/user-cover-v1.webp',
  player: '/api/media/defaults/player-cover-v1.webp',
  team: '/api/media/defaults/team-cover-v2.webp',
} as const
export const DEFAULT_AVATAR_COUNT = 16
type PersonKind = 'user' | 'player'
const files = new Map<string, string>([
  ['user-cover-v1.webp', 'user-cover-v1.webp'],
  ['player-cover-v1.webp', 'player-cover-v1.webp'],
  ['team-cover-v1.webp', 'team-cover-v1.webp'],
  ['team-cover-v2.webp', 'team-cover-v2.webp'],
])
for (let index = 1; index <= DEFAULT_AVATAR_COUNT; index++) {
  const number = String(index).padStart(2, '0')
  for (const kind of ['user', 'player'])
    files.set(`${kind}-avatar-${number}-v1.webp`, `avatar-${number}-v1.webp`)
}

export function defaultCover(kind: keyof typeof DEFAULT_COVERS, value?: string | null) {
  return value?.trim() || DEFAULT_COVERS[kind]
}
export function defaultAvatar(kind: 'user', id: string, value?: string | null): string
export function defaultAvatar(kind: PersonKind, id: string, value?: string | null): string | null
export function defaultAvatar(kind: PersonKind, id: string, value?: string | null) {
  const stored = value?.trim()
  // Player initials are rendered from the current name by each client. Older
  // illustrated defaults must not be mistaken for an uploaded player photo.
  if (stored && !(kind === 'player' && isIllustratedDefaultAvatar(stored))) return stored
  if (kind === 'player') return null
  let hash = 2166136261
  for (const char of `${kind}:${id}`) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619) >>> 0
  return `/api/media/defaults/${kind}-avatar-${String((hash % DEFAULT_AVATAR_COUNT) + 1).padStart(2, '0')}-v1.webp`
}
function isIllustratedDefaultAvatar(value: string) {
  try {
    return /^\/api\/media\/defaults\/(?:user|player)-avatar-\d{2}-v1\.webp$/.test(
      new URL(value, 'https://default-media.invalid').pathname,
    )
  } catch {
    return false
  }
}
export function withDefaultPersonMedia<
  T extends { id: string; avatarUrl?: string | null; coverUrl?: string | null },
>(kind: PersonKind, source: T) {
  return {
    ...source,
    avatarUrl: defaultAvatar(kind, source.id, source.avatarUrl),
    coverUrl: defaultCover(kind, source.coverUrl),
  }
}
export function defaultMediaName(value: string) {
  try {
    const path = new URL(value, 'https://default-media.invalid').pathname
    const name = path.startsWith('/api/media/defaults/')
      ? path.slice('/api/media/defaults/'.length)
      : ''
    return files.has(name) ? name : null
  } catch {
    return null
  }
}
export async function readDefaultMedia(name: string) {
  const file = files.get(name)
  if (!file) return null
  for (const directory of [
    resolve(__dirname, '../../default-media'),
    resolve(__dirname, '../../../default-media'),
  ]) {
    try {
      return { body: await readFile(resolve(directory, file)), mimeType: 'image/webp' as const }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
  }
  return null
}
