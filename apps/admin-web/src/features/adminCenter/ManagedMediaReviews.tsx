import { useState } from 'react'
import type { OrganizationContext } from '../adminSchedule/types'
import { ActionForm, Modal, useAdminData, DataState } from './shared'
import { MediaThumbnail } from './MediaLibrary'
import { refreshManagementData } from '../adminAuth/refresh'
import { QuickApprove } from './QuickApprove'
type Media = {
  id: string
  targetLabel: string
  purpose: string
  contentUrl: string
  posterUrl: string
  status: string
  awaitingReview: boolean
  version: number
  aiReviewId?: string
}
export function ManagedMediaReviews({
  context,
  compact = false,
}: {
  context: OrganizationContext
  compact?: boolean
}) {
  const data = useAdminData<{ items: Media[] }>(
      context,
      context.canManageOrganization ? '/admin/media-assets' : null,
    ),
    [selected, setSelected] = useState<Media | null>(null),
    [decision, setDecision] = useState<'APPROVE' | 'REJECT' | null>(null)
  const rows = (data.data?.items ?? [])
    .filter((item) => !item.aiReviewId && (item.status === 'PENDING' || item.awaitingReview))
    .slice(0, compact ? 5 : 50)
  const done = (id: string) => {
    data.update(current => current && ({ ...current, items: current.items.filter(item => item.id !== id) }))
    setSelected(null)
  }
  if (compact && !rows.length) return null
  return (
    <section className="mc-panel">
      <div className="mc-panel-heading">
        <h2>资料图片复核</h2>
      </div>
      <DataState {...data} onRetry={data.refresh} />
      <div className="workspace-direct-tasks">
        {rows.map((item) => (
          <div key={item.id}>
            <MediaThumbnail context={context} url={item.posterUrl} previewable />
            <strong>{item.targetLabel}</strong>
            <span>
              {{
                USER_AVATAR: '用户头像',
                USER_BACKGROUND: '个人背景',
                PLAYER_PORTRAIT: '球员照片',
                TEAM_CREST: '球队队徽',
                TEAM_BACKGROUND: '球队背景',
              }[item.purpose] || '比赛图片'}
            </span>
            <QuickApprove context={context} method="PUT" path={`/admin/media-assets/${item.id}/review`}
              body={{ action: 'APPROVE', expectedVersion: item.version }} onDone={() => done(item.id)} />
            <button
              onClick={() => {
                setSelected(item)
                setDecision(null)
              }}
            >
              查看并审核
            </button>
          </div>
        ))}
      </div>
      {selected && (
        <Modal title={selected.targetLabel} onClose={() => setSelected(null)}>
          <div className="gov-detail-body">
            <MediaThumbnail context={context} url={selected.posterUrl} large />
            {decision ? (
              <ActionForm
                context={context}
                method="PUT"
                path={`/admin/media-assets/${selected.id}/review`}
                body={{ action: decision, expectedVersion: selected.version }}
                submitLabel={decision === 'APPROVE' ? '确认通过' : '暂停公开'}
                onDone={() => {
                  done(selected.id)
                }}
                refreshAll={false}
              />
            ) : (
              <div className="mc-actions">
                <QuickApprove context={context} method="PUT" path={`/admin/media-assets/${selected.id}/review`}
                  body={{ action: 'APPROVE', expectedVersion: selected.version }} onDone={() => done(selected.id)} />
                <button className="secondary-button" onClick={() => setDecision('REJECT')}>
                  有误
                </button>
              </div>
            )}
          </div>
        </Modal>
      )}
    </section>
  )
}
