import { View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { displayedBadgeKind, identityLabels } from '../../features/product/identity-badges'
import type { VerificationBadgeProps } from './verification-badge.shared'

export function VerificationBadge({
  level,
  roles,
  official,
  displayedKind,
  className,
}: VerificationBadgeProps) {
  const kind =
    displayedBadgeKind(level, roles, official, displayedKind) ??
    (level === 'STAFF_VERIFIED' ? 'reporter' : null)
  if (!kind) return null
  return (
    <View
      className={`native-badge native-badge--${kind} ${className ?? ''}`}
      role="img"
      aria-label={identityLabels[kind]}
      onClick={(event) => {
        event.stopPropagation()
        void Taro.showToast({ title: identityLabels[kind], icon: 'none' })
      }}
    >
      <View className="native-badge__icon" />
      {kind !== 'profile' && <View className="native-badge__check" />}
    </View>
  )
}
