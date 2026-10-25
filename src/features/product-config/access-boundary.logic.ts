import type {
  ProductConfiguration,
  ProductModuleId,
} from '@/product-config'

export interface AccountPresence {
  hasSession: boolean
  needsAccount: boolean
}

const guestPages: Record<string, ProductModuleId> = {
  '/pages/index/index': 'home',
  '/pages/readonly-schedule/index': 'schedule',
  '/pages/data-center/index': 'data',
  '/pages/readonly-match-detail/index': 'schedule',
  '/pages/readonly-teams/index': 'teams',
  '/pages/readonly-team-detail/index': 'teams',
  '/pages/player-detail/index': 'teams',
  '/pages/readonly-tournaments/index': 'schedule',
  '/pages/readonly-tournament-detail/index': 'schedule',
  '/pages/post-detail/index': 'community',
}

export function configuredGuestAccess(config: ProductConfiguration | null): boolean {
  return (
    config?.guest.enabled === true &&
    config.serverGuestAccess === true &&
    config.accountRequired === false
  )
}

export function guestPageAllowed(
  route: string,
  config: ProductConfiguration | null,
  account: AccountPresence,
): boolean {
  if (account.hasSession || account.needsAccount || !configuredGuestAccess(config)) return false
  const path = route.replace(/^#/, '').split(/[?#]/)[0]?.replace(/\/+$/, '') ?? ''
  const module = guestPages[path]
  return Boolean(module && config?.modules[module]?.enabled === true)
}

export function publicReadModule(path: string, method = 'GET'): ProductModuleId | null {
  if (method !== 'GET') return null
  const pathname = path.split(/[?#]/)[0] ?? ''
  // IDs are one safe segment; encoded slash/backslash and dot traversal never enter the whitelist.
  const id = '[A-Za-z0-9_-]+'
  if (pathname === '/public/home') return 'home'
  if (pathname === '/public/competition-catalog') return 'schedule'
  if (pathname === '/public/search') return 'home'
  if (pathname === '/public/seasons' || pathname === '/public/tournaments') return 'schedule'
  if (
    new RegExp(`^/public/tournaments/${id}(?:/schedule)?$`).test(pathname) ||
    new RegExp(`^/public/matches/${id}(?:/experience)?$`).test(pathname)
  )
    return 'schedule'
  if (new RegExp(`^/public/tournaments/${id}/competition-data$`).test(pathname)) return 'data'
  if (
    new RegExp(`^/public/(?:teams|players)/${id}(?:/dashboard)?$`).test(pathname) ||
    new RegExp(`^/public/tournaments/${id}/teams(?:/${id})?$`).test(pathname)
  )
    return 'teams'
  if (
    pathname === '/public/posts' ||
    pathname === '/public/post-tags' ||
    new RegExp(`^/public/posts/${id}$`).test(pathname)
  )
    return 'community'
  return null
}

export function anonymousReadAllowed(
  path: string,
  method: string,
  config: ProductConfiguration | null,
  account: AccountPresence,
): boolean {
  if (account.hasSession || account.needsAccount || !configuredGuestAccess(config)) return false
  const module = publicReadModule(path, method)
  return Boolean(module && config?.modules[module]?.enabled === true)
}

export function explicitAnonymousAuthRequest(path: string, method: string): boolean {
  return (
    method === 'POST' &&
    [
      '/auth/login',
      '/auth/register',
      '/auth/registration-check',
      '/auth/registration-feedback',
      '/auth/password/reset-by-identity',
      '/auth/email/code',
      '/auth/email/login',
      '/auth/password/reset-by-email',
    ].includes(path)
  )
}
