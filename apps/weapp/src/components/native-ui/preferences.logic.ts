import type { NativePreferences } from './preferences'

export function normalizeNativePreferences(value: unknown): NativePreferences {
  const saved = value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
  return {
    reduceMotion: saved.reduceMotion === true,
    largeText: saved.largeText === true,
    autoplayGif: saved.playbackVersion === 2 ? saved.autoplayGif !== false : true,
  }
}
