export const NATIVE_FRESH_GET_MS = 8_000
export const NATIVE_PREVIEW_GET_MS = 2 * 60_000

export function nativeReadKey(
  path: string,
  organization: string,
  user: string | undefined,
  tokenDigest: string,
) {
  return `native:${organization}:${user || 'guest'}:${tokenDigest} ${path}`
}
export function nativePersistedPath(path: string) {
  return /^\/public\/(?:home|posts|players|people|teams|matches|tournaments)(?:[/?]|$)/.test(path)
}
