import type { AuthUser } from '../../features/product/product.types'
export function IdentityEntry(_props: {
  user: AuthUser
  onUserChange?: (user: AuthUser) => void
  actions?: { informationEntry?: () => void; administrationEntry?: () => void }
}) {
  return null
}
export function IdentityCenterHost() {
  return null
}
