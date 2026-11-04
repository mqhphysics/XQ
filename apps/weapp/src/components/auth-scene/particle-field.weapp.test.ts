import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createNativeParticleField,
  readSceneImagePixels,
  type SceneCanvas,
  type SceneImage,
  type SceneStats,
} from './particle-field.weapp.ts'

function sceneFixture(opaque: boolean) {
  const image: SceneImage = { width: 12, height: 12, src: '/pitch.png', onload() {}, onerror() {} }
  const data = new Uint8ClampedArray(12 * 12 * 4)
  if (opaque) for (let index = 3; index < data.length; index += 4) data[index] = 255
  let draws = 0
  let failDraw = false
  let frame: (() => void) | null = null
  const canvas: SceneCanvas = {
    width: 80,
    height: 60,
    createImage: () => image,
    getContext: () => ({
      setTransform() {},
      clearRect() {},
      drawImage(source) {
        assert.equal(
          source,
          image,
          'native drawing must use its loaded Image, never OffscreenCanvas',
        )
        if (failDraw) throw new Error('native drawing unavailable')
        draws++
      },
      getImageData: () => ({ width: 12, height: 12, data }),
    }),
    requestAnimationFrame(callback) {
      frame = () => callback(0)
      return 1
    },
    cancelAnimationFrame() {},
  }
  return {
    canvas,
    image,
    draws: () => draws,
    fail: () => {
      failDraw = true
    },
    tick: () => {
      const next = frame
      frame = null
      next?.()
    },
  }
}

test('Android pitch sampling, initial painting and touch animation use the canvas-owned image', () => {
  const fixture = sceneFixture(true)
  const pixels = readSceneImagePixels(fixture.canvas, fixture.image)
  const states: SceneStats[] = []
  const engine = createNativeParticleField(
    fixture.canvas,
    fixture.image,
    pixels,
    80,
    60,
    2,
    (state) => states.push(state),
  )
  assert.equal(fixture.canvas.width, 160)
  assert.equal(fixture.canvas.height, 120)
  assert.equal(states.at(-1)?.state, 'idle')
  assert.ok(states.at(-1)!.particles > 0)
  engine.setPointer(40, 30, true)
  fixture.tick()
  assert.ok(fixture.draws() > 2)
  assert.equal(states.at(-1)?.state, 'moving')
  engine.destroy()
})

test('empty native image pixels never mark a blank pitch as ready', () => {
  const fixture = sceneFixture(false)
  const pixels = readSceneImagePixels(fixture.canvas, fixture.image)
  assert.throws(
    () => createNativeParticleField(fixture.canvas, fixture.image, pixels, 80, 60, 1, () => {}),
    /保留静态图/,
  )
})

test('a native draw failure returns to the static pitch instead of leaving an empty canvas', () => {
  const fixture = sceneFixture(true)
  const pixels = readSceneImagePixels(fixture.canvas, fixture.image)
  const states: SceneStats[] = []
  const engine = createNativeParticleField(
    fixture.canvas,
    fixture.image,
    pixels,
    80,
    60,
    1,
    (state) => states.push(state),
  )
  fixture.fail()
  engine.setPointer(40, 30, true)
  assert.doesNotThrow(() => fixture.tick())
  assert.equal(states.at(-1)?.state, 'fallback')
  engine.destroy()
})
