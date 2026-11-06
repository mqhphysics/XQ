export function dialogBodyHeight(
  viewport: number,
  options: {
    bodyHeight?: number | undefined
    compact: boolean
    contentHeight: number | null
    minBodyHeight: number
    loading: boolean
  },
) {
  const maximum = Math.max(100, Math.min(460, viewport - 160))
  return options.bodyHeight !== undefined
    ? Math.min(options.bodyHeight, maximum)
    : options.compact
      ? Math.min(
          Math.max(options.loading ? 280 : options.minBodyHeight, options.contentHeight ?? 240),
          maximum,
        )
      : Math.min(maximum, viewport * 0.57)
}
