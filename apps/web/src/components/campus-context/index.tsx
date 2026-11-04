import type { PropsWithChildren } from 'react'
export function CampusContext({ children }: PropsWithChildren<{ active: string }>) {
  return <>{children}</>
}
export function CampusWelcome() {
  return null
}
