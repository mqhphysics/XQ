import Taro from '@tarojs/taro'
import { ProductApiError, request } from '../../features/product/product.repository'
import { readSession } from '../../features/product/session'
import { parseHubOrder, parseHubOrderText, type HubOrderKey } from './hub-order.logic'

/* Same server order as the H5 hub (/me/hub-strip-order); local storage is the offline copy. */
const STORAGE_PREFIX = 'xiaoqiu.hub-strip-order.v1'
let remoteOrderEnabled: boolean | null = null

const storageKey = () => `${STORAGE_PREFIX}:${readSession()?.user.id ?? 'guest'}`

function readLocalOrder(): HubOrderKey[] {
  try {
    return parseHubOrderText(Taro.getStorageSync<string>(storageKey()) || null)
  } catch {
    return []
  }
}

function writeLocalOrder(order: HubOrderKey[]) {
  try {
    Taro.setStorageSync(storageKey(), JSON.stringify(order))
  } catch {
    /* storage is best effort */
  }
}

export async function loadNativeHubOrder(): Promise<HubOrderKey[]> {
  const local = readLocalOrder()
  if (!readSession() || remoteOrderEnabled === false) return local
  try {
    const remote = await request<{ items?: unknown }>('/me/hub-strip-order')
    remoteOrderEnabled = true
    const parsed = parseHubOrder(remote.items)
    if (parsed.length) {
      writeLocalOrder(parsed)
      return parsed
    }
  } catch (error) {
    if (error instanceof ProductApiError && error.statusCode === 404) remoteOrderEnabled = false
  }
  return local
}

export async function saveNativeHubOrder(order: HubOrderKey[]): Promise<void> {
  writeLocalOrder(order)
  if (!readSession() || remoteOrderEnabled === false) return
  try {
    await request('/me/hub-strip-order', { method: 'PUT', data: { items: order } })
    remoteOrderEnabled = true
  } catch (error) {
    if (error instanceof ProductApiError && error.statusCode === 404) remoteOrderEnabled = false
  }
}
