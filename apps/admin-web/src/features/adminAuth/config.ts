import { isUuid } from './types.ts'

export function configuredAdminApi(): string | null {
  const value = import.meta.env?.DEV ? '/api' : import.meta.env?.VITE_API_BASE_URL?.trim()
  if (!value) return null
  const base = value.replace(/\/+$/, '')
  if (!/^https?:\/\//i.test(base) && !/^\/(?!\/)/.test(base)) return null
  return base.endsWith('/api') ? base : `${base}/api`
}

export function configuredAdminOrganizationId(): string | null {
  const value = import.meta.env?.VITE_ORGANIZATION_ID?.trim()
  return value && isUuid(value) ? value.toLowerCase() : null
}

export function h5SessionBridgeEnabled(): boolean {
  return import.meta.env?.PROD === true && import.meta.env?.VITE_H5_SESSION_BRIDGE === '1'
}

export function publicWebsiteHref(): string {
  const configured = import.meta.env?.VITE_PUBLIC_WEBSITE_URL?.trim()
  if (configured && /^https?:\/\//i.test(configured)) return configured
  if (h5SessionBridgeEnabled()) return '/'
  return import.meta.env?.PROD ? 'https://xiaoqiu-beta.pages.dev/' : 'http://127.0.0.1:3000/'
}

export function requireAdminApi(): string {
  const api = configuredAdminApi()
  if (!api) throw new Error('管理服务尚未配置，请联系部署管理员。')
  return api
}
