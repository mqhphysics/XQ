import type { AuthUser } from '../../features/product/product.types'

// This entry is only implemented for H5. WeChat keeps its existing profile UI.
export function EmailVerificationPanel(_props: {
  user: AuthUser
  onVerified: (user: AuthUser) => void
}) {
  return null
}
