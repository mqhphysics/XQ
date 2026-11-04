export type NativeHeaderMetrics = {
  height: number
  top: number
  rowHeight: number
  wide: boolean
  capsule: { left: number; right: number; top: number; height: number }
  windowWidth: number
}
export function nativeHeaderMetrics(): NativeHeaderMetrics | null {
  return null
}
