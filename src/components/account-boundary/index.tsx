import type { PropsWithChildren, ReactNode } from 'react'

/** WeChat retains its existing flow; this release changes the H5 account gate. */
export function AccountBoundary({
  children,
  overlays,
}: PropsWithChildren<{ overlays?: ReactNode; publicOverlays?: ReactNode }>) {
  return (
    <>
      {children}
      {overlays}
    </>
  )
}
