import type { PropsWithChildren, ReactNode } from 'react'
export interface NativeDialogProps extends PropsWithChildren {
  title: string
  onClose: () => void
  footer?: ReactNode
  compact?: boolean
  busy?: boolean
  unsavedChanges?: boolean
}
export function NativeDialog(_props: NativeDialogProps) {
  return null
}
