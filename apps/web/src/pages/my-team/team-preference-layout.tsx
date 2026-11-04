import type { ReactNode } from 'react'
export interface TeamPreferenceLayoutProps {
  editing: boolean
  editor: ReactNode
  content: ReactNode
  onClose: () => void
  onSave: () => void
  saving: boolean
  canSave: boolean
}
export function TeamPreferenceLayout({ editing, editor, content }: TeamPreferenceLayoutProps) {
  return editing ? editor : content
}
