export interface FocusIdentity {
  tagName: string
  id: string
  label: string | null
  href: string | null
  className: string
  text: string
}

/** Resolve the same trigger after Taro replaces the source page's DOM on Back. */
export function sameFocusOrigin(origin: FocusIdentity, candidate: FocusIdentity): boolean {
  if (origin.tagName !== candidate.tagName) return false
  if (origin.id) return origin.id === candidate.id
  if (origin.label) return origin.label === candidate.label
  if (origin.href) return origin.href === candidate.href
  return Boolean(
    origin.text && origin.text === candidate.text && origin.className === candidate.className,
  )
}
