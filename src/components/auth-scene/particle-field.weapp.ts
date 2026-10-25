import { advanceTouchParticle, touchRepulsion, type TouchParticle } from './touch-field.logic.ts'

export interface ScenePixels {
  width: number
  height: number
  data: Uint8ClampedArray
}
export interface SceneContext {
  setTransform(a: number, b: number, c: number, d: number, e: number, f: number): void
  clearRect(x: number, y: number, width: number, height: number): void
  drawImage(source: unknown, ...coordinates: number[]): void
  getImageData(x: number, y: number, width: number, height: number): ScenePixels
}
export interface SceneImage {
  width: number
  height: number
  src: string
  onload: () => void
  onerror: (error: unknown) => void
}
export interface SceneRaster {
  width: number
  height: number
  getContext(type: '2d'): SceneContext
}
export interface SceneCanvas extends SceneRaster {
  createImage(): SceneImage
  requestAnimationFrame(callback: (time: number) => void): number
  cancelAnimationFrame(id: number): void
}
export interface SceneStats {
  particles: number
  displacement: number
  state: string
}
interface Fragment extends TouchParticle {
  column: number
  row: number
}

/** Sample and draw through the same native canvas; Android need not draw another canvas. */
export function readSceneImagePixels(canvas: SceneCanvas, image: SceneImage): ScenePixels {
  canvas.width = image.width
  canvas.height = image.height
  const context = canvas.getContext('2d')
  context.setTransform(1, 0, 0, 1, 0, 0)
  context.drawImage(image, 0, 0, image.width, image.height)
  return {
    width: image.width,
    height: image.height,
    data: context.getImageData(0, 0, image.width, image.height).data,
  }
}

/** Fragments retain the loaded Image as their drawing source on Android and iOS. */
export function createNativeParticleField(
  canvas: SceneCanvas,
  image: SceneImage,
  atlas: ScenePixels,
  initialWidth: number,
  initialHeight: number,
  pixelRatio: number,
  onStats: (stats: SceneStats) => void,
) {
  const context = canvas.getContext('2d')
  const pixels = atlas.data
  const tile = Math.max(3, Math.ceil(Math.sqrt((atlas.width * atlas.height) / 6500)))
  const columns = Math.ceil(atlas.width / tile)
  const rows = Math.ceil(atlas.height / tile)
  const cells = new Int32Array(columns * rows).fill(-1)
  const fragments: Fragment[] = []
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      const left = column * tile,
        top = row * tile
      let visible = false
      for (let y = top; y < Math.min(top + tile, atlas.height) && !visible; y++) {
        for (let x = left; x < Math.min(left + tile, atlas.width); x++) {
          if (pixels[(y * atlas.width + x) * 4 + 3]! > 8) {
            visible = true
            break
          }
        }
      }
      if (visible) {
        cells[row * columns + column] = fragments.length
        fragments.push({ column, row, x: 0, y: 0, vx: 0, vy: 0 })
      }
    }
  }
  if (!fragments.length) throw new Error('球场图片尚未绘制，保留静态图')
  let width = initialWidth,
    height = initialHeight,
    scale = 1,
    left = 0,
    top = 0
  let frame: number | null = null,
    lastTime = 0,
    lastReport = 0,
    destroyed = false,
    visible = true
  let pointer: { x: number; y: number } | null = null
  let displacement = 0
  const dpr = Math.min(2, Math.max(1, pixelRatio))
  const stats = (state: string) =>
    onStats({
      particles: fragments.length,
      displacement: Math.round(displacement * 100) / 100,
      state,
    })
  function prepare() {
    context.setTransform(dpr, 0, 0, dpr, 0, 0)
    context.clearRect(0, 0, width, height)
  }
  function settled() {
    prepare()
    context.drawImage(image, left, top, atlas.width * scale, atlas.height * scale)
  }
  function moving() {
    prepare()
    for (let row = 0; row < rows; row++) {
      const sy = row * tile,
        sh = Math.min(tile, atlas.height - sy)
      let spanStart = 0
      for (let column = 0; column <= columns; column++) {
        const index = column < columns ? cells[row * columns + column]! : -1
        const fragment = index < 0 ? undefined : fragments[index]
        if (column < columns && (!fragment || Math.abs(fragment.x) + Math.abs(fragment.y) < 0.025))
          continue
        if (column > spanStart) {
          const sx = spanStart * tile,
            sw = Math.min(column * tile, atlas.width) - sx
          context.drawImage(
            image,
            sx,
            sy,
            sw,
            sh,
            left + sx * scale,
            top + sy * scale,
            sw * scale,
            sh * scale,
          )
        }
        if (fragment) {
          const sx = column * tile,
            sw = Math.min(tile, atlas.width - sx)
          context.drawImage(
            image,
            sx,
            sy,
            sw,
            sh,
            left + sx * scale + fragment.x,
            top + sy * scale + fragment.y,
            sw * scale,
            sh * scale,
          )
        }
        spanStart = column + 1
      }
    }
  }
  function tick() {
    const time = Date.now()
    frame = null
    if (destroyed || !visible) return
    const dt = Math.min(0.04, Math.max(0.001, lastTime ? (time - lastTime) / 1000 : 1 / 60))
    lastTime = time
    const radius = Math.min(110, Math.max(72, width * 0.23))
    let movingNow = false
    displacement = 0
    fragments.forEach((fragment, index) => {
      let targetX = 0,
        targetY = 0
      if (pointer) {
        const dx = left + (fragment.column + 0.5) * tile * scale - pointer.x
        const dy = top + (fragment.row + 0.5) * tile * scale - pointer.y
        ;[targetX, targetY] = touchRepulsion(dx, dy, radius, index)
      }
      advanceTouchParticle(fragment, targetX, targetY, dt)
      const distance = Math.hypot(fragment.x, fragment.y)
      displacement = Math.max(displacement, distance)
      if (distance > 0 || fragment.vx !== 0 || fragment.vy !== 0) movingNow = true
    })
    try {
      if (movingNow) moving()
      else settled()
    } catch {
      destroyed = true
      stats('fallback')
      return
    }
    if (time - lastReport > 180 || !movingNow) {
      stats(movingNow ? 'moving' : 'idle')
      lastReport = time
    }
    // Holding a finger in place needs no continuous redraw once the field settles.
    const settling = fragments.some(
      (fragment) =>
        Math.abs(fragment.vx) + Math.abs(fragment.vy) > 0 ||
        (!pointer && (fragment.x !== 0 || fragment.y !== 0)),
    )
    if (settling) frame = canvas.requestAnimationFrame(tick)
    else {
      lastTime = 0
      stats(pointer ? 'held' : 'idle')
    }
  }
  function wake() {
    if (!destroyed && visible && frame === null) {
      lastTime = 0
      frame = canvas.requestAnimationFrame(tick)
    }
  }
  function resize(nextWidth: number, nextHeight: number) {
    if (destroyed || nextWidth <= 0 || nextHeight <= 0) return
    width = nextWidth
    height = nextHeight
    canvas.width = Math.round(width * dpr)
    canvas.height = Math.round(height * dpr)
    // Crop the artwork's airy top so the pitch fills the phone width.
    top = -width * 0.06
    scale = Math.min(width / atlas.width, (height - top) / atlas.height)
    left = (width - atlas.width * scale) / 2
    fragments.forEach((fragment) => {
      fragment.x = fragment.y = fragment.vx = fragment.vy = 0
    })
    displacement = 0
    settled()
    stats('idle')
  }
  resize(width, height)
  return {
    resize,
    setPointer(x: number, y: number, active: boolean) {
      pointer = active ? { x, y } : null
      wake()
    },
    setVisible(next: boolean) {
      visible = next
      pointer = null
      if (!next && frame !== null) {
        canvas.cancelAnimationFrame(frame)
        frame = null
      }
      if (next) wake()
    },
    destroy() {
      destroyed = true
      if (frame !== null) canvas.cancelAnimationFrame(frame)
      frame = null
    },
  }
}
