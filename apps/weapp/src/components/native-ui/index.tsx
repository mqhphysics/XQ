import type { PropsWithChildren, ReactNode } from 'react'
export interface NativeDialogProps extends PropsWithChildren {
  title: string
  onClose: () => void
  footer?: ReactNode
  compact?: boolean
  busy?: boolean
  unsavedChanges?: boolean
  /** Element id inside the body to scroll into view. */
  focusId?: string | undefined
}
export function NativeDialog(_props: NativeDialogProps) {
  return null
}
