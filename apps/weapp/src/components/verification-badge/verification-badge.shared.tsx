import { Text } from '@tarojs/components'
import { verificationLabel } from '../../features/product/product.format'

export interface VerificationBadgeProps {
  level?: string | null | undefined
  className?: string | undefined
  focusable?: boolean | undefined
  roles?: readonly (string | { role: string })[] | undefined
  official?: boolean | undefined
  displayedKind?: string | null | undefined
  userId?: string | undefined
}

// Keep the existing compact H5 / WeChat text treatment.
export function VerificationBadge({ level, className }: VerificationBadgeProps) {
  return (
    <Text className={className ?? 'post-card__verified'}>
      {verificationLabel(level ?? 'UNVERIFIED')}
    </Text>
  )
}
