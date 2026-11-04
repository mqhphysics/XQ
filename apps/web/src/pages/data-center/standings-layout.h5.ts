export function standingsRowHeight(height: number, groupSizes: number[], columns = 2) {
  const bands = Math.ceil(groupSizes.length / columns)
  const rows = Math.max(
    1,
    ...Array.from({ length: columns }, (_, column) =>
      groupSizes.reduce((total, size, index) => total + (index % columns === column ? size : 0), 0),
    ),
  )
  const headers = bands * (groupSizes.length > 1 ? 46 : 24) + Math.max(0, bands - 1) * 10
  return Math.max(24, Math.min(44, Math.floor((height - headers) / rows)))
}
