import { lazy, Suspense, type ReactNode } from 'react'

import './overlay-buffer.h5'

const OverlayBundle = lazy(() => import('./overlay-bundle.h5'))

/**
 * Dialogs, emoji, the captain modal and other hosts download beside the page
 * instead of blocking the first script. Opens that happen mid-download are replayed.
 */
export function AppOverlays(): ReactNode {
  return (
    <Suspense fallback={null}>
      <OverlayBundle />
    </Suspense>
  )
}

export function PublicAppOverlays(): ReactNode {
  return (
    <Suspense fallback={null}>
      <OverlayBundle publicOnly />
    </Suspense>
  )
}
