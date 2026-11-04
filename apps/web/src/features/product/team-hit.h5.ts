/**
 * Round 11: a team is "hit" only when the pointer is over its crest or over the actual glyphs of
 * its name, never over padding, gaps or stretched wrapper whitespace beside them.
 */
const CREST = '.team-crest, .tbd-crest, img, svg, [data-team-crest]'
const SLOP = 2

function inside(rect: DOMRect, x: number, y: number): boolean {
  return (
    rect.width > 0 &&
    rect.height > 0 &&
    x >= rect.left - SLOP &&
    x <= rect.right + SLOP &&
    y >= rect.top - SLOP &&
    y <= rect.bottom + SLOP
  )
}

export function pointerOnTeam(root: Element, x: number, y: number): boolean {
  for (const crest of root.querySelectorAll(CREST)) {
    if (inside(crest.getBoundingClientRect(), x, y)) return true
  }
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  const range = document.createRange()
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (!node.textContent?.trim()) continue
    range.selectNodeContents(node)
    for (const rect of range.getClientRects()) if (inside(rect as DOMRect, x, y)) return true
  }
  return false
}

/** Keyboard/synthetic clicks (detail 0, no coordinates) always count as a hit. */
export function eventOnTeam(
  root: Element,
  event: { clientX: number; clientY: number; detail?: number },
): boolean {
  if (!event.detail && !event.clientX && !event.clientY) return true
  return pointerOnTeam(root, event.clientX, event.clientY)
}
