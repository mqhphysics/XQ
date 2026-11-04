import type { RequestWithId } from './request-context'

export function getSafeRequestPath(request: RequestWithId): string {
  // Route templates retain diagnostics without recording identifiers or search parameters.
  const route: unknown = request.route
  if (typeof route !== 'object' || route === null) return 'unknown'
  const path = (route as { path?: unknown }).path
  return typeof path === 'string' ? path : 'unknown'
}
