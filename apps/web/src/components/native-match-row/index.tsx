import type { MatchSummary } from '../../features/product/product.types'
export interface NativeMatchRowProps {
  match: MatchSummary
  onClick?: (() => void) | undefined
  showDate?: boolean
}
export function NativeMatchRow(_props: NativeMatchRowProps) {
  return null
}
