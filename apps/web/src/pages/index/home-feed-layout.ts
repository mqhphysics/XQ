/**
 * Masonry columns for the desktop 首页 feed. Each column alternates image and text posts
 * (columns start on opposite kinds) so text-only posts don't pile up beside image posts.
 * Order within each kind stays newest-first; when one kind runs out the other fills in.
 */
export function alternatingColumns<T>(
  items: readonly T[],
  columnCount: number,
  hasImage: (item: T) => boolean,
): T[][] {
  const images = items.filter(hasImage)
  const texts = items.filter((item) => !hasImage(item))
  const columns: T[][] = Array.from({ length: Math.max(1, columnCount) }, () => [])
  let row = 0
  while (images.length || texts.length) {
    for (let column = 0; column < columns.length; column += 1) {
      const wantImage = (row + column) % 2 === 0
      const next = (wantImage ? images : texts).shift() ?? (wantImage ? texts : images).shift()
      if (next === undefined) break
      columns[column]!.push(next)
    }
    row += 1
  }
  return columns
}
