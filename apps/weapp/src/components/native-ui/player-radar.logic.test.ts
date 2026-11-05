import assert from 'node:assert/strict'
import test from 'node:test'
import { radarGeometry, radarValues } from './player-radar.logic.ts'

test('radar requires three actual abilities, counts zero, and leaves unknown or invalid values out', () => {
  assert.equal(radarGeometry({}, 320, 208), null)
  assert.equal(radarGeometry({ shooting: 80, speed: 75, defending: null }, 320, 208), null)
  assert.deepEqual(
    radarValues({ shooting: 0, speed: 75, dribbling: NaN, passing: 60, defending: 101 }).map(
      (a) => a.key,
    ),
    ['shooting', 'speed', 'passing'],
  )
  assert.equal(radarGeometry({ shooting: 0, speed: 75, passing: 60 }, 320, 208)?.axes.length, 3)
})

test('three, four and five radar axes stay centered and proportional across narrow and wide layouts', () => {
  for (const width of [220, 320, 390, 600])
    for (const count of [3, 4, 5]) {
      const values = Object.fromEntries(
        ['shooting', 'speed', 'dribbling', 'passing', 'defending']
          .slice(0, count)
          .map((key, index) => [key, index ? 50 : 100]),
      )
      const shape = radarGeometry(values, width, 208)!
      assert.equal(shape.axes.length, count)
      assert.ok(Math.abs(shape.axes[0]!.end.x - width / 2) < 0.001)
      for (const axis of shape.axes) {
        assert.ok(
          Math.abs(
            Math.hypot(axis.end.x - shape.center.x, axis.end.y - shape.center.y) - shape.radius,
          ) < 0.001,
        )
        assert.ok(
          Math.abs(
            Math.hypot(axis.point.x - shape.center.x, axis.point.y - shape.center.y) -
              (shape.radius * axis.value) / 100,
          ) < 0.001,
        )
        assert.ok(axis.labelPoint.x >= 8 && axis.labelPoint.x <= width - 8)
        assert.ok(axis.labelPoint.y >= 8 && axis.labelPoint.y <= 200)
      }
    }
  const zero = radarGeometry({ shooting: 0, speed: 0, passing: 0 }, 320, 208)!
  assert.ok(zero.axes.every((a) => a.point.x === zero.center.x && a.point.y === zero.center.y))
})
