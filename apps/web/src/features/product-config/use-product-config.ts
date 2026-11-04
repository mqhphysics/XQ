import type { ProductConfiguration } from '../../../../../packages/contracts/src/product-config'
/** Platform fallback deliberately makes no requests and does not change WeChat navigation. */
export function useProductConfiguration(): {
  configuration: ProductConfiguration | null
  error: string | null
  phase: 'unknown'
} {
  return { configuration: null, error: null, phase: 'unknown' }
}
