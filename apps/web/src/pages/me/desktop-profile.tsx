import type { ReactNode } from 'react'
import type { AuthUser, HomeResponse } from '../../features/product/product.types'

export type ProfileService = 'notifications' | 'reports' | 'adminReports' | 'identities'
export interface DesktopProfileProps {
  home: HomeResponse
  user: AuthUser
  onUserChange: (user: AuthUser) => void
  renderService: (
    service: ProfileService,
    onServiceLink: (service: ProfileService | null) => void,
  ) => ReactNode
}

// The reference layout is desktop H5 only. Other platforms keep their account page.
export function useDesktopProfile() {
  return false
}
export function DesktopProfile(_props: DesktopProfileProps) {
  return null
}
