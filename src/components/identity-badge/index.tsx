import { View } from '@tarojs/components'
import { displayedBadgeKind, type IdentityBadgeKind } from '../../types'
import './index.scss'

interface IdentityBadgeProps {
  badge?: string | null
  kind?: IdentityBadgeKind | null
  title?: string
}

const BADGE_TITLES: Record<IdentityBadgeKind, string> = {
  student: '校园认证',
  player: '认证球员',
  captain: '认证队长',
  coach: '认证教练',
  reporter: '校园记者',
  operator: '学生足协运营',
  admin: '平台管理员',
  reviewer: '认证审核员',
  referee: '认证裁判',
  official: '官方账号',
  profile: '资料已完善',
}

export function IdentityBadge({ badge, kind, title }: IdentityBadgeProps) {
  const resolvedKind = kind !== undefined ? kind : displayedBadgeKind(badge)
  if (!resolvedKind) return null
  const label = title || badge || BADGE_TITLES[resolvedKind]

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