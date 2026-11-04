import { lazy, Suspense, type ReactNode } from 'react'
import type { ReportTargetType } from '../../features/product/product.types'

const ReportModalLazy = lazy(() =>
  import('../report-modal').then((module) => ({ default: module.ReportModal })),
)
const SettingsDialogLazy = lazy(() =>
  import('../settings-dialog').then((module) => ({ default: module.SettingsDialog })),
)

export function ReportModal(props: {
  targetId?: string
  targetType: ReportTargetType
  title: string
  onClose: () => void
}): ReactNode {
  return (
    <Suspense fallback={null}>
      <ReportModalLazy {...props} />
    </Suspense>
  )
}

export function SettingsDialog(props: {
  onClose: () => void
  section?: 'messages' | undefined
}): ReactNode {
  return (
    <Suspense fallback={null}>
      <SettingsDialogLazy {...props} />
    </Suspense>
  )
}
