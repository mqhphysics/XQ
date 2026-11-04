import type { ProductConfiguration } from '../../../../../packages/contracts/src/product-config'
import type { AuthSession } from '../product/product.types'
/** WeChat keeps its existing account/guest behavior; H5 replaces this module. */
export async function getConfiguration(): Promise<ProductConfiguration> {
  throw new Error('功能配置暂未开放')
}
export function readAccountPresence(): {
  session: AuthSession | null
  hasSession: boolean
  needsAccount: boolean
} {
  return { session: null, hasSession: false, needsAccount: true }
}
export function markAccountInvalid(): void {}
export function clearAccountByUser(): void {}
