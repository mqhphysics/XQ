const dimensions = [
  ['shooting', '射门'],
  ['speed', '速度'],
  ['dribbling', '盘带'],
  ['passing', '传球'],
  ['defending', '防守'],
] as const
export type PlayerAbilities = Partial<Record<(typeof dimensions)[number][0], number | null>>
export function radarValues(abilities: PlayerAbilities) {
  return dimensions.flatMap(([key, label]) => {
    const value = abilities[key]
    return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100
      ? [{ key, label, value }]
      : []
  })
}
export function radarGeometry(abilities: PlayerAbilities, width: number, height: number) {
  const values = radarValues(abilities)
  if (
    values.length < 3 ||
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width < 180 ||
    height < 120
  )
    return null
  const center = { x: width / 2, y: height / 2 }
  const radius = Math.max(1, Math.min(width / 2 - 80, height / 2 - 34))
  const axes = values.map((item, index) => {
    const angle = -Math.PI / 2 + (index * Math.PI * 2) / values.length
    const x = Math.cos(angle),
      y = Math.sin(angle)
    return {
      ...item,
      end: { x: center.x + x * radius, y: center.y + y * radius },
      point: {
        x: center.x + (x * radius * item.value) / 100,
        y: center.y + (y * radius * item.value) / 100,
      },
      labelPoint: { x: center.x + x * (radius + 20), y: center.y + y * (radius + 20) },
      align: x > 0.1 ? ('left' as const) : x < -0.1 ? ('right' as const) : ('center' as const),
    }
  })
  return { center, radius, axes }
}
