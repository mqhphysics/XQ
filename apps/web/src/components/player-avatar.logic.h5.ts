export function playerAvatarInitial(name: string): string {
  return Array.from(name.trim()).at(-1) || '球'
}

export function playerAvatarPhoto(value?: string | null): string | null {
  const stored = value?.trim()
  if (!stored) return null
  try {
    const path = new URL(stored, 'https://default-media.invalid').pathname
    if (/^\/api\/media\/defaults\/(?:user|player)-avatar-\d{2}-v1\.webp$/.test(path)) return null
  } catch {
    return null
  }
  return stored
}
