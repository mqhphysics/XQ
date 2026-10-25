import Taro from '@tarojs/taro'
export function nativeHeaderMetrics() {
  const menu = Taro.getMenuButtonBoundingClientRect()
  const status = Taro.getWindowInfo().statusBarHeight ?? 20
  const top = menu.top || status + 6
  const rowHeight = Math.max(32, menu.height || 32)
  return { top, rowHeight, height: top + rowHeight + 12 }
}
