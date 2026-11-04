import { ProductApiError, request } from '../../features/product/product.repository'
import { readSession } from '../../features/product/session'
import { parseHubOrder, parseHubOrderText, type HubOrderKey } from './hub-order.logic'

const STORAGE_PREFIX = 'xiaoqiu.hub-strip-order.v1'
let remoteOrderEnabled: boolean | null = null

function storageKey(): string {
  return `${STORAGE_PREFIX}:${readSession()?.user.id ?? 'guest'}`
}

function readLocalOrder(): HubOrderKey[] {
  try {
    return parseHubOrderText(window.localStorage.getItem(storageKey()))
  } catch {
    return []
  }
}

function writeLocalOrder(order: HubOrderKey[]): void {
  try {
    window.localStorage.setItem(storageKey(), JSON.stringify(order))
  } catch {
    /* quota / private mode */
  }
}

export async function loadHubStripOrder(): Promise<HubOrderKey[]> {
  const local = readLocalOrder()
  if (!readSession()) return local
  try {
    const remote = await request<{ items?: unknown }>('/me/hub-strip-order')
    remoteOrderEnabled = true
    const parsed = parseHubOrder(remote.items)
    if (parsed.length) {
      writeLocalOrder(parsed)
      return parsed
    }
    if (local.length) {
      try {
        await request('/me/hub-strip-order', { method: 'PUT', data: { items: local } })
      } catch (error) {
        if (error instanceof ProductApiError && error.statusCode === 404) remoteOrderEnabled = false
      }
    }
  } catch (error) {
    if (error instanceof ProductApiError && error.statusCode === 404) remoteOrderEnabled = false
  }
  return local
}

export async function saveHubStripOrder(order: HubOrderKey[]): Promise<void> {
  writeLocalOrder(order)
  if (!readSession() || remoteOrderEnabled === false) return
  try {
    await request('/me/hub-strip-order', {
      method: 'PUT',
      data: { items: order },
    })
    remoteOrderEnabled = true
  } catch (error) {
    if (error instanceof ProductApiError && error.statusCode === 404) remoteOrderEnabled = false
  }
}
