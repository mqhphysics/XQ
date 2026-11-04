export type ParticleFieldOptions = {
  backgroundColor?: string
  maxParticles?: number
  onReady?: () => void
  onError?: (error: unknown) => void
}
export type ParticleFieldStats = {
  particleCount: number
  active: boolean
  maxDisplacement: number
  fps: number
  state: string
}
export type ParticleField = {
  resize: (width: number, height: number) => void
  setPointer: (x: number, y: number, active: boolean) => void
  destroy: () => void
  getStats: () => ParticleFieldStats
}
/**
 * Tiny source-image fragments preserve the drawing's original stipple and linework.
 * Every visible fragment can move; there is no stationary image underneath them.
 * Settled neighbours are drawn as contiguous spans to avoid tens of thousands of
 * drawImage calls, and the completely settled artwork needs just one draw call.
 * All geometry and pointer positions use local CSS pixels, independent of DPR.
 */
export function createParticleField(
  canvas: HTMLCanvasElement,
  image: HTMLImageElement,
  options: ParticleFieldOptions = {},
): ParticleField {
  const context = canvas.getContext('2d', { alpha: true })
  const atlas = document.createElement('canvas')
  let cells = new Int32Array(0)
  let sourceColumns = new Uint16Array(0)
  let sourceRows = new Uint16Array(0)
  let originX = new Float32Array(0)
  let originY = new Float32Array(0)
  let offsetX = new Float32Array(0)
  let offsetY = new Float32Array(0)
  let velocityX = new Float32Array(0)
  let velocityY = new Float32Array(0)
  let sourceX = new Uint16Array(0)
  let sourceY = new Uint16Array(0)
  let columns = 0
  let rows = 0
  let count = 0
  let width = Math.max(1, canvas.clientWidth)
  let height = Math.max(1, canvas.clientHeight)
  let scale = 1
  let imageLeft = 0
  let imageTop = 0
  let dpr = 1
  let frame: number | null = null
  let lastFrameTime = 0
  let fps = 0
  let maxDisplacement = 0
  let state = 'initializing'
  let initialized = false
  let destroyed = false
  let pointerX = 0
  let pointerY = 0
  let pointerActive = false
  const cancelFrame = () => {
    if (frame !== null) window.cancelAnimationFrame(frame)
    frame = null
    lastFrameTime = 0
  }
  const reportError = (error: unknown) => {
    cancelFrame()
    state = 'error'
    options.onError?.(error)
  }
  const prepareFrame = () => {
    if (!context) return
    context.setTransform(dpr, 0, 0, dpr, 0, 0)
    context.clearRect(0, 0, width, height)
    if (options.backgroundColor) {
      context.fillStyle = options.backgroundColor
      context.fillRect(0, 0, width, height)
    }
  }
  const drawSettled = () => {
    if (!context || !initialized || destroyed) return
    prepareFrame()
    context.drawImage(atlas, imageLeft, imageTop, atlas.width * scale, atlas.height * scale)
  }
  const isDisplaced = (index: number) =>
    index >= 0 && (Math.abs(offsetX[index]!) > 0.025 || Math.abs(offsetY[index]!) > 0.025)
  const drawMoving = () => {
    if (!context) return
    prepareFrame()
    for (let row = 0; row < rows; row += 1) {
      const top = sourceY[row]!
      const tileHeight = sourceY[row + 1]! - top
      let stationaryStart = 0
      for (let column = 0; column <= columns; column += 1) {
        const index = column < columns ? cells[row * columns + column]! : -1
        if (column < columns && !isDisplaced(index)) continue
        if (column > stationaryStart) {
          const left = sourceX[stationaryStart]!
          const spanWidth = sourceX[column]! - left
          context.drawImage(
            atlas,
            left,
            top,
            spanWidth,
            tileHeight,
            imageLeft + left * scale,
            imageTop + top * scale,
            spanWidth * scale,
            tileHeight * scale,
          )
        }
        if (column < columns && index >= 0) {
          const left = sourceX[column]!
          const tileWidth = sourceX[column + 1]! - left
          context.drawImage(
            atlas,
            left,
            top,
            tileWidth,
            tileHeight,
            originX[index]! + offsetX[index]!,
            originY[index]! + offsetY[index]!,
            tileWidth * scale,
            tileHeight * scale,
          )
        }
        stationaryStart = column + 1
      }
    }
  }
  const animate = (time: number) => {
    frame = null
    if (destroyed || !initialized || document.hidden) return
    // Critical damping is solved analytically, including a capped background-tab step.
    const elapsed = Math.max(0.001, lastFrameTime ? (time - lastFrameTime) / 1000 : 1 / 60)
    const dt = Math.min(0.04, elapsed)
    if (lastFrameTime) fps = fps ? fps * 0.85 + (1 / elapsed) * 0.15 : 1 / elapsed
    lastFrameTime = time
    const radius = Math.min(145, Math.max(110, width * 0.145))
    const radiusSquared = radius * radius
    const omega = 18
    const decay = Math.exp(-omega * dt)
    let settling = false
    let largestDisplacementSquared = 0
    for (let index = 0; index < count; index += 1) {
      let targetX = 0
      let targetY = 0
      if (pointerActive) {
        const column = sourceColumns[index]!
        const row = sourceRows[index]!
        const dx =
          originX[index]! + (sourceX[column + 1]! - sourceX[column]!) * scale * 0.5 - pointerX
        const dy = originY[index]! + (sourceY[row + 1]! - sourceY[row]!) * scale * 0.5 - pointerY
        const distanceSquared = dx * dx + dy * dy
        if (distanceSquared < radiusSquared) {
          const distance = Math.sqrt(distanceSquared)
          const strength = radius * 0.82 * Math.pow(1 - distance / radius, 1.55)
          if (distance > 0.001) {
            targetX = (dx / distance) * strength
            targetY = (dy / distance) * strength
          } else {
            // A stable direction prevents NaN and flicker exactly at a particle centre.
            const angle = index * 2.399963229728653
            targetX = Math.cos(angle) * strength
            targetY = Math.sin(angle) * strength
          }
        }
      }
      const errorX = offsetX[index]! - targetX
      const errorY = offsetY[index]! - targetY
      if (
        Math.abs(errorX) < 0.025 &&
        Math.abs(errorY) < 0.025 &&
        Math.abs(velocityX[index]!) < 0.6 &&
        Math.abs(velocityY[index]!) < 0.6
      ) {
        offsetX[index] = targetX
        offsetY[index] = targetY
        velocityX[index] = 0
        velocityY[index] = 0
      } else {
        const auxiliaryX = velocityX[index]! + omega * errorX
        const auxiliaryY = velocityY[index]! + omega * errorY
        offsetX[index] = targetX + (errorX + auxiliaryX * dt) * decay
        offsetY[index] = targetY + (errorY + auxiliaryY * dt) * decay
        velocityX[index] = (velocityX[index]! - omega * auxiliaryX * dt) * decay
        velocityY[index] = (velocityY[index]! - omega * auxiliaryY * dt) * decay
        settling = true
      }
      const displacementSquared =
        offsetX[index]! * offsetX[index]! + offsetY[index]! * offsetY[index]!
      if (displacementSquared > largestDisplacementSquared)
        largestDisplacementSquared = displacementSquared
    }
    maxDisplacement = Math.sqrt(largestDisplacementSquared)
    if (maxDisplacement > 0.025) drawMoving()
    else drawSettled()
    if (settling) {
      state = 'running'
      frame = window.requestAnimationFrame(animate)
    } else {
      state = 'idle'
      lastFrameTime = 0
    }
  }
  const wake = () => {
    if (destroyed || !initialized || state === 'error' || document.hidden || frame !== null) return
    state = 'running'
    lastFrameTime = 0
    frame = window.requestAnimationFrame(animate)
  }
  const resize = (nextWidth: number, nextHeight: number) => {
    if (destroyed || !Number.isFinite(nextWidth) || !Number.isFinite(nextHeight)) return
    width = Math.max(1, nextWidth)
    height = Math.max(1, nextHeight)
    dpr = Math.min(1.5, Math.max(1, window.devicePixelRatio || 1))
    canvas.width = Math.max(1, Math.round(width * dpr))
    canvas.height = Math.max(1, Math.round(height * dpr))
    if (!initialized) return
    scale = Math.min(width / atlas.width, height / atlas.height)
    imageLeft = (width - atlas.width * scale) * 0.5
    imageTop = (height - atlas.height * scale) * 0.5
    for (let index = 0; index < count; index += 1) {
      originX[index] = imageLeft + sourceX[sourceColumns[index]!]! * scale
      originY[index] = imageTop + sourceY[sourceRows[index]!]! * scale
    }
    offsetX.fill(0)
    offsetY.fill(0)
    velocityX.fill(0)
    velocityY.fill(0)
    maxDisplacement = 0
    cancelFrame()
    drawSettled()
    state = document.hidden ? 'hidden' : 'idle'
    if (pointerActive) wake()
  }
  const initialize = () => {
    if (destroyed || initialized) return
    try {
      if (!context) throw new Error('The particle scene could not acquire a Canvas 2D context.')
      if (!image.naturalWidth || !image.naturalHeight)
        throw new Error('The particle artwork has no decoded pixels.')
      const sourceScale = Math.min(1, 1600 / Math.max(image.naturalWidth, image.naturalHeight))
      atlas.width = Math.max(1, Math.round(image.naturalWidth * sourceScale))
      atlas.height = Math.max(1, Math.round(image.naturalHeight * sourceScale))
      const atlasContext = atlas.getContext('2d', { willReadFrequently: true })
      if (!atlasContext)
        throw new Error('The particle artwork could not acquire a sampling context.')
      atlasContext.drawImage(image, 0, 0, atlas.width, atlas.height)
      const pixels = atlasContext.getImageData(0, 0, atlas.width, atlas.height)
      const data = pixels.data
      const integralWidth = atlas.width + 1
      const integral = new Uint32Array(integralWidth * (atlas.height + 1))
      // Transparent plates need no colour removal. For opaque paper images, infer
      // only the pale corner paper, retaining coloured ink and its original alpha.
      let cornerRed = 0
      let cornerGreen = 0
      let cornerBlue = 0
      let cornerCount = 0
      const corners = [
        [0, 0],
        [atlas.width - 1, 0],
        [0, atlas.height - 1],
        [atlas.width - 1, atlas.height - 1],
      ] as const
      for (const [x, y] of corners) {
        const at = (y * atlas.width + x) * 4
        if (data[at + 3]! > 245 && Math.min(data[at]!, data[at + 1]!, data[at + 2]!) > 225) {
          cornerRed += data[at]!
          cornerGreen += data[at + 1]!
          cornerBlue += data[at + 2]!
          cornerCount += 1
        }
      }
      const paperRed = cornerCount ? cornerRed / cornerCount : 255
      const paperGreen = cornerCount ? cornerGreen / cornerCount : 255
      const paperBlue = cornerCount ? cornerBlue / cornerCount : 255
      let visiblePixels = 0
      for (let y = 0; y < atlas.height; y += 1) {
        let rowVisible = 0
        for (let x = 0; x < atlas.width; x += 1) {
          const at = (y * atlas.width + x) * 4
          const paperDifference = Math.max(
            Math.abs(data[at]! - paperRed),
            Math.abs(data[at + 1]! - paperGreen),
            Math.abs(data[at + 2]! - paperBlue),
          )
          if (data[at + 3]! < 8 || (cornerCount && paperDifference < 5)) data[at + 3] = 0
          const visible = data[at + 3]! > 0 ? 1 : 0
          rowVisible += visible
          visiblePixels += visible
          integral[(y + 1) * integralWidth + x + 1] =
            integral[y * integralWidth + x + 1]! + rowVisible
        }
      }
      atlasContext.putImageData(pixels, 0, 0)
      if (!visiblePixels) throw new Error('The particle artwork contains no visible ink.')
      const visibleInTile = (left: number, top: number, right: number, bottom: number) =>
        integral[bottom * integralWidth + right]! -
        integral[top * integralWidth + right]! -
        integral[bottom * integralWidth + left]! +
        integral[top * integralWidth + left]!
      const suppliedBudget = options.maxParticles ?? 42000
      const budget = Number.isFinite(suppliedBudget)
        ? Math.min(65000, Math.max(1500, Math.floor(suppliedBudget)))
        : 42000
      let tileSize = Math.max(1, Math.sqrt(visiblePixels / budget))
      for (;;) {
        columns = Math.max(1, Math.ceil(atlas.width / tileSize))
        rows = Math.max(1, Math.ceil(atlas.height / tileSize))
        sourceX = Uint16Array.from({ length: columns + 1 }, (_, column) =>
          Math.floor((column * atlas.width) / columns),
        )
        sourceY = Uint16Array.from({ length: rows + 1 }, (_, row) =>
          Math.floor((row * atlas.height) / rows),
        )
        cells = new Int32Array(columns * rows).fill(-1)
        count = 0
        for (let row = 0; row < rows; row += 1) {
          for (let column = 0; column < columns; column += 1) {
            if (
              visibleInTile(
                sourceX[column]!,
                sourceY[row]!,
                sourceX[column + 1]!,
                sourceY[row + 1]!,
              )
            ) {
              cells[row * columns + column] = count
              count += 1
            }
          }
        }
        if (count <= budget) break
        tileSize *= Math.max(1.04, Math.sqrt(count / budget))
      }
      sourceColumns = new Uint16Array(count)
      sourceRows = new Uint16Array(count)
      for (let row = 0; row < rows; row += 1) {
        for (let column = 0; column < columns; column += 1) {
          const index = cells[row * columns + column]!
          if (index >= 0) {
            sourceColumns[index] = column
            sourceRows[index] = row
          }
        }
      }
      originX = new Float32Array(count)
      originY = new Float32Array(count)
      offsetX = new Float32Array(count)
      offsetY = new Float32Array(count)
      velocityX = new Float32Array(count)
      velocityY = new Float32Array(count)
      initialized = true
      resize(width, height)
      options.onReady?.()
    } catch (error) {
      reportError(error)
    }
  }
  const imageError = () => reportError(new Error('The particle artwork failed to load.'))
  const visibilityChanged = () => {
    if (destroyed || state === 'error') return
    if (document.hidden) {
      cancelFrame()
      state = 'hidden'
    } else if (initialized) {
      // A pointer from before tab switching must not leave a permanent empty area.
      pointerActive = false
      wake()
    }
  }
  document.addEventListener('visibilitychange', visibilityChanged)
  image.addEventListener('load', initialize)
  image.addEventListener('error', imageError)
  resize(width, height)
  if (image.complete) initialize()
  return {
    resize,
    setPointer(x, y, active) {
      if (destroyed || !Number.isFinite(x) || !Number.isFinite(y)) return
      if (pointerX === x && pointerY === y && pointerActive === active) return
      pointerX = x
      pointerY = y
      pointerActive = active
      wake()
    },
    destroy() {
      if (destroyed) return
      destroyed = true
      cancelFrame()
      document.removeEventListener('visibilitychange', visibilityChanged)
      image.removeEventListener('load', initialize)
      image.removeEventListener('error', imageError)
      cells = new Int32Array(0)
      sourceColumns = new Uint16Array(0)
      sourceRows = new Uint16Array(0)
      originX = new Float32Array(0)
      originY = new Float32Array(0)
      offsetX = new Float32Array(0)
      offsetY = new Float32Array(0)
      velocityX = new Float32Array(0)
      velocityY = new Float32Array(0)
      sourceX = new Uint16Array(0)
      sourceY = new Uint16Array(0)
      atlas.width = 0
      atlas.height = 0
      count = 0
      maxDisplacement = 0
      state = 'destroyed'
    },
    getStats() {
      return {
        particleCount: count,
        active: frame !== null && !document.hidden,
        maxDisplacement: Math.round(maxDisplacement * 100) / 100,
        fps: Math.round(fps * 10) / 10,
        state,
      }
    },
  }
}
