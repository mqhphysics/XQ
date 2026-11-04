/** Pure helpers for vertical drag-to-reorder lists (shared by native drag-sort). */
export interface DragRowRect {
  top: number
  bottom: number
  height: number
}

/** Index the dragged row would land on, given its current visual center (inclusive so clamped edges reach the end slots). */
export function dragTargetIndex(rects: readonly DragRowRect[], from: number, centerY: number) {
  let over = from
  for (let i = from + 1; i < rects.length; i += 1)
    if (centerY >= rects[i]!.top + rects[i]!.height / 2) over = i
  for (let i = from - 1; i >= 0; i -= 1)
    if (centerY <= rects[i]!.top + rects[i]!.height / 2) over = i
  return over
}

/** Keeps the lifted row inside the list bounds. */
export function clampDragOffset(rects: readonly DragRowRect[], from: number, offset: number) {
  const self = rects[from],
    first = rects[0],
    last = rects[rects.length - 1]
  if (!self || !first || !last) return 0
  return Math.min(last.bottom - self.bottom, Math.max(first.top - self.top, offset))
}

/** Offset that places the dragged row exactly in the slot of `over`. */
export function settleOffset(rects: readonly DragRowRect[], from: number, over: number) {
  const self = rects[from],
    target = rects[over]
  if (!self || !target || from === over) return 0
  return over > from ? target.bottom - self.bottom : target.top - self.top
}

/** How far a non-dragged row moves out of the way while `from` hovers over `over`. */
export function dragShift(
  rects: readonly DragRowRect[],
  index: number,
  from: number,
  over: number,
) {
  const self = rects[from]
  if (!self || index === from) return 0
  const next = rects[from + 1],
    previous = rects[from - 1],
    gap = next ? next.top - self.bottom : previous ? self.top - previous.bottom : 0,
    step = self.height + Math.max(0, gap)
  if (from < over && index > from && index <= over) return -step
  if (from > over && index >= over && index < from) return step
  return 0
}

export function moveIndex<T>(items: readonly T[], from: number, to: number): T[] {
  const next = [...items]
  if (from === to || from < 0 || to < 0 || from >= next.length || to >= next.length) return next
  const [item] = next.splice(from, 1)
  next.splice(to, 0, item as T)
  return next
}

/**
 * Selectors to try when measuring rows. A page-scoped SelectorQuery cannot see nodes Taro
 * renders inside its `comp` custom component (anything deeper than baseLevel, e.g. rows in a
 * dialog's RootPortal), so the plain selector can come back empty; `scope >>> selector` crosses
 * that boundary from a shallow page-level ancestor.
 */
export function rowSelectorCandidates(
  selector: string,
  scopes: readonly string[] = ['.native-dialog', '.native-main-root'],
) {
  return [selector, ...scopes.map((scope) => `${scope} >>> ${selector}`)]
}

/** First query result that measured exactly `count` rows (null when none did). */
export function pickRowRects(
  results: readonly unknown[] | null | undefined,
  count: number,
): DragRowRect[] | null {
  for (const result of results ?? []) {
    const rects = (Array.isArray(result) ? (result as (DragRowRect | null)[]) : []).filter(
      (rect): rect is DragRowRect => !!rect?.height,
    )
    if (count > 0 && rects.length === count)
      return rects.map(({ top, bottom, height }) => ({ top, bottom, height }))
  }
  return null
}

/** Uniform slots centred on the touched row, used only when no query measured the list. */
export function estimateRowRects(count: number, from: number, anchorY: number, stride: number) {
  const height = Math.max(1, stride),
    top0 = anchorY - height / 2 - from * height
  return Array.from({ length: count }, (_, i) => ({
    top: top0 + i * height,
    bottom: top0 + (i + 1) * height,
    height,
  }))
}

/** Clamped offset and drop slot for a raw finger offset (what the hook does on every frame). */
export function dragFrame(rects: readonly DragRowRect[], from: number, raw: number) {
  const self = rects[from]
  if (!self) return { offset: raw, over: from }
  const offset = clampDragOffset(rects, from, raw)
  return { offset, over: dragTargetIndex(rects, from, self.top + self.height / 2 + offset) }
}
