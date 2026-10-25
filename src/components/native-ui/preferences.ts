export interface NativePreferences {
  reduceMotion: boolean
  largeText: boolean
  autoplayGif: boolean
}
export const defaultNativePreferences: NativePreferences = {
  reduceMotion: false,
  largeText: false,
  autoplayGif: false,
}
export function useNativePreferences(): NativePreferences {
  return defaultNativePreferences
}
