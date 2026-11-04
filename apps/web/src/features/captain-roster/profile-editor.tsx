import type { CaptainWorkspaceResponse } from '../product/product.types'

export interface CaptainProfileEditorProps {
  teamId: string
  onChange: (data: CaptainWorkspaceResponse) => void
  defaultExpanded?: boolean
}
// Team profile editing is currently an H5 workflow.
export default function CaptainProfileEditor(_props: CaptainProfileEditorProps) {
  return null
}
