import { useId } from 'react'
import {
  VerificationBadge as ExistingBadge,
  type VerificationBadgeProps,
} from './verification-badge.shared'
import playerIcon from './football.svg'
import staffIcon from '../../assets/profile-icons/pencil.svg'
import captainIcon from '../../assets/profile-icons/trophy.svg'
import operatorIcon from '../../assets/profile-icons/users.svg'
import adminIcon from '../../assets/profile-icons/shield-check.svg'
import officialIcon from '../../assets/profile-icons/bell.svg'
import studentIcon from '../../assets/profile-icons/user-circle.svg'
import checkIcon from '../../assets/profile-icons/check.svg'
import {
  displayedBadgeKind,
  identityLabels,
  type IdentityBadgeKind,
} from '../../features/product/identity-badges'
import { useBadgeDisplay } from '../../features/product/badge-display.h5'
import './index.h5.scss'

const icons: Record<IdentityBadgeKind, string> = {
  player: playerIcon,
  student: studentIcon,
  profile: studentIcon,
  reporter: staffIcon,
  captain: captainIcon,
  coach: staffIcon,
  operator: operatorIcon,
  admin: adminIcon,
  official: officialIcon,
  referee: officialIcon,
  reviewer: adminIcon,
}

export function VerificationBadge({
  level,
  roles,
  official,
  className,
  focusable = true,
  displayedKind,
  userId,
}: VerificationBadgeProps) {
  const tooltipId = useId()
  const localChoice = useBadgeDisplay(userId)
  const single = displayedBadgeKind(
    level,
    roles,
    official,
    localChoice === undefined ? displayedKind : localChoice,
  )
  const identities = single ? [single] : []
  return (
    <>
      <ExistingBadge level={level} className={`verification-badge__native ${className ?? ''}`} />
      {identities.map((kind) => (
        <span
          key={kind}
          className={`verification-badge verification-badge--${kind}`}
          role="img"
          aria-label={identityLabels[kind]}
          aria-describedby={`${tooltipId}-${kind}`}
          tabIndex={focusable ? 0 : undefined}
          onClickCapture={(event) => {
            event.stopPropagation()
            event.nativeEvent.stopImmediatePropagation()
          }}
        >
          <span className="verification-badge__symbol" aria-hidden="true">
            <img className="verification-badge__icon" src={icons[kind]} alt="" />
            {kind !== 'profile' && (
              <img className="verification-badge__check" src={checkIcon} alt="" />
            )}
          </span>
          <span className="verification-badge__tooltip" id={`${tooltipId}-${kind}`} role="tooltip">
            {identityLabels[kind]}
          </span>
        </span>
      ))}
    </>
  )
}
