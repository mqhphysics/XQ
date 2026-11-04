/**
 * Width at which the native shell swaps the bottom tab bar for the top navigation. It must match
 * the `@media (min-width: 520px)` block in styles/foldable.weapp.scss: CSS styles the wide window,
 * JavaScript only chooses which structure to render.
 */
export const nativeWideMinWidth = 520

export function nativeWideViewport(width: number) {
  return width >= nativeWideMinWidth
}
export function nativeWideWindow(info: { windowWidth: number }) {
  return nativeWideViewport(info.windowWidth)
}
