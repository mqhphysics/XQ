import { View } from '@tarojs/components'
import { displayedBadgeKind, identityLabels, type IdentityBadgeKind } from '../../types'
import './index.scss'

export interface IdentityBadgeProps {
  kind?: IdentityBadgeKind | null
  level?: string | null
  roles?: readonly (string | { role: string })[]
  official?: boolean
  preferredKind?: string | null
  badge?: string | null
  title?: string
}

export function IdentityBadge({
  kind,
  level,
  roles,
  official = false,
  preferredKind,
  badge,
  title,
}: IdentityBadgeProps) {
  const resolvedKind =
    kind !== undefined
      ? kind
      : displayedBadgeKind(level ?? badge, roles ?? [], official, preferredKind ?? badge)

  if (!resolvedKind) return null
  const label = title || identityLabels[resolvedKind]

  return (
    <View
      className={`identity-badge identity-badge--${resolvedKind}`}
      aria-label={label}
    >
      <View className="identity-badge__icon" />
      <View className="identity-badge__check" />
    </View>
  )
}