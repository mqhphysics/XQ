type Point = readonly [number, number]
type Segment = readonly [Point, Point, Point]

// Same outline as default-32.svg, relative to its (2, 2) click hotspot.
const arrow: readonly Point[] = [
  [0, 0],
  [18.5, 18],
  [8.3, 18.7],
  [8.3, 27.4],
  [6.7, 28.1],
  [4.3, 21.7],
  [0, 25.4],
]

function interpolate(a: Point, b: Point, amount: number): Point {
  return [a[0] + (b[0] - a[0]) * amount, a[1] + (b[1] - a[1]) * amount]
}

const arrowSegments: Segment[] = arrow.map((start, index) => {
  const end = arrow[(index + 1) % arrow.length]!
  return [interpolate(start, end, 1 / 3), interpolate(start, end, 2 / 3), end]
})

const startAngle = (-3 * Math.PI) / 4
const step = (2 * Math.PI) / arrow.length
const radius = 10.5
const handle = (4 / 3) * Math.tan(step / 4) * radius
function circlePoint(angle: number): Point {
  return [radius * Math.cos(angle), radius * Math.sin(angle)]
}
const ballStart = circlePoint(startAngle)
const ballSegments: Segment[] = arrow.map((_, index) => {
  const a = startAngle + index * step
  const b = a + step
  const start = circlePoint(a)
  const end = circlePoint(b)
  return [
    [start[0] - handle * Math.sin(a), start[1] + handle * Math.cos(a)],
    [end[0] + handle * Math.sin(b), end[1] - handle * Math.cos(b)],
    end,
  ]
})

function coordinates(point: Point): string {
  return `${point[0].toFixed(3)} ${point[1].toFixed(3)}`
}

/** 0 = filled arrow; 1 = fine football. Only runs during a boundary crossing. */
export function cursorMorphPath(amount: number): string {
  const p = Math.max(0, Math.min(1, amount))
  const start = interpolate(arrow[0]!, ballStart, p)
  const segments = arrowSegments.map((segment, index) => {
    const ball = ballSegments[index]!
    return `C${segment.map((point, part) => coordinates(interpolate(point, ball[part]!, p))).join(' ')}`
  })
  return `M${coordinates(start)}${segments.join('')}Z`
}
