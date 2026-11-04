import type { TeamSummary } from '../../features/product/product.types'

export type NativeWideNavItem = { key: string; label: string }

/** The website draws its own desktop navigation; only the mini program needs this bar. */
export function NativeWideNav(_props: {
  items: NativeWideNavItem[]
  active: string
  primaryTeam: TeamSummary | null
  teamReplay: number
  windowWidth: number
  onSelect: (key: string) => void
}) {
  return null
}
