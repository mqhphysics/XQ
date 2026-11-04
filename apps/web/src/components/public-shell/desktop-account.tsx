import type { AuthUser } from '../../features/product/product.types'
export interface DesktopAccountProps {
  user: AuthUser | null
  onProfile: () => void
  onMessages: () => void
  onSettings: () => void
  onFeedback: () => void
  onLogout: () => void
}
export function useDesktopAccount() {
  return false
}
export function DesktopAccount(_props: DesktopAccountProps) {
  return null
}
