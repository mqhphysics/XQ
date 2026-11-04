import Taro from '@tarojs/taro'
import { readNativeViewport } from '../../features/native-navigation/viewport.weapp'
import { nativeWideWindow } from '../../features/native-navigation/viewport.logic.weapp'

/** Wide windows use one website-style bar (logo · five sections · account) centred on the capsule. */
const wideRowHeight = 56
export function nativeHeaderMetrics() {
  const menu = Taro.getMenuButtonBoundingClientRect()
  const viewport = readNativeViewport(),
    status = viewport.statusBarHeight ?? 20
  const menuTop = menu.top || status + 6,
    menuHeight = menu.height || 32
  const capsule = {
    left: menu.left || viewport.windowWidth - 95,
    right: menu.right || viewport.windowWidth - 7,
    top: menuTop,
    height: menuHeight,
  }
  if (nativeWideWindow(viewport)) {
    const top = Math.max(4, Math.round(menuTop + menuHeight / 2 - wideRowHeight / 2))
    return {
      top,
      rowHeight: wideRowHeight,
      height: top + wideRowHeight + 6,
      wide: true,
      capsule,
      windowWidth: viewport.windowWidth,
    }
  }
  const top = menuTop
  const rowHeight = Math.max(32, menuHeight)
  return {
    top,
    rowHeight,
    height: top + rowHeight + 12,
    wide: false,
    capsule,
    windowWidth: viewport.windowWidth,
  }
}
