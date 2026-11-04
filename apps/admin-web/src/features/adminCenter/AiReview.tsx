import { useState } from 'react'
import type { OrganizationContext } from '../adminSchedule/types'
import { requestAdmin } from '../adminAuth/request'
import { requireAdminApi } from '../adminAuth/config'
import { refreshManagementData } from '../adminAuth/refresh'
import { ActionForm, DataState, Modal, useAdminData, time, type Row } from './shared'
import { MediaThumbnail } from './MediaLibrary'
import { purposeNames } from './ai-config'
import { AiProviderSettings } from './AiProviderSettings'
import { QuickApprove } from './QuickApprove'
type Review = Row & {
  resourceType: string
  targetId: string
  purpose: string
  status: string
  decision: string | null
  summary: string | null
  needsHumanReview: boolean
  reviewedAt: string | null
  createdAt: string
  source: { text: string; urls: string[] }
}
export function AiReviewStats({ context }: { context: OrganizationContext }) {
  const data = useAdminData<{ reviewed: number; flagged: number; pending: number; queued: number }>(
    context,
    context.canManageOrganization ? '/admin/ai-review/stats' : null,
  )
  return context.canManageOrganization ? (
    <div className="admin-ai-stats">
      {[
        ['reviewed', '近7天AI审核'],
        ['flagged', '需关注'],
        ['pending', '待人工复核'],
        ['queued', 'AI处理中'],
      ].map(([key, title]) => (
        <div key={key}>
          <span>{title}</span>
          <strong>{data.data?.[key as keyof typeof data.data] ?? '—'}</strong>
        </div>
      ))}
    </div>
  ) : null
}
export function AiReview({ context }: { context: OrganizationContext }) {
  return (
    <>
      <AiReviewStats context={context} />
      <AiProviderSettings context={context} />
      <AiReviewQueue context={context} />
    </>
  )
}
export function AiReviewQueue({
  context,
  compact = false,
}: {
  context: OrganizationContext
  compact?: boolean
}) {
  const data = useAdminData<{ items: Review[] }>(
      context,
      context.canManageOrganization ? '/admin/ai-review/jobs' : null,
    ),
    [selected, setSelected] = useState<Review | null>(null)
  const rows = (data.data?.items ?? [])
    .filter((item) => !compact || (item.needsHumanReview && !item.reviewedAt))
    .slice(0, compact ? 6 : 100)
  const done = (id: string) => {
    data.update(current => current && ({ ...current, items: current.items.map(item => item.id === id
      ? { ...item, reviewedAt: new Date().toISOString(), needsHumanReview: false } : item) }))
    setSelected(null)
  }
  if (compact && !rows.length) return null
  return (
    <section className="mc-panel">
      <div className="mc-panel-heading">
        <h2>{compact ? '内容复核' : 'AI审核记录'}</h2>
        <button className="secondary-button" onClick={data.refresh}>
          刷新
        </button>
      </div>
      <DataState {...data} onRetry={data.refresh} />
      <table className="mc-table">
        <thead>
          <tr>
            <th>内容</th>
            <th>结果</th>
            <th>说明</th>
            <th>时间</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((item) => (
            <tr className="mc-clickable-row" key={item.id} onClick={() => setSelected(item)}>
              <td><div className="mc-review-preview">{item.source.urls.slice(0, 3).map(url =>
                <MediaThumbnail key={url} context={context} url={url} previewable />)}</div>
                {purposeNames[item.purpose] || item.purpose}{item.source.text && <p>{item.source.text.slice(0, 160)}</p>}</td>
              <td>
                {!item.reviewedAt && item.status !== 'STALE' && <QuickApprove context={context}
                  path={`/admin/ai-review/jobs/${item.id}/decision`} body={{ decision: 'ALLOW' }} onDone={() => done(item.id)} />}
                {item.reviewedAt
                  ? '已人工处理'
                  : item.decision === 'BLOCK'
                    ? '已暂停公开'
                    : item.decision === 'REVIEW'
                      ? '待核实'
                      : item.decision === 'ALLOW'
                        ? 'AI通过'
                        : item.status === 'ERROR'
                          ? '服务异常'
                          : item.status === 'MANUAL'
                            ? '待人工审核'
                            : 'AI处理中'}
              </td>
              <td>{item.summary || '—'}</td>
              <td>{time(item.createdAt)}</td>
              <td>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    setSelected(item)
                  }}
                >
                  查看并处理
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {selected && (
        <Modal
          title={purposeNames[selected.purpose] || '内容复核'}
          onClose={() => setSelected(null)}
        >
          <div className="gov-detail-body">
            <p className="mc-prose">{selected.source.text}</p>
            <div className="gov-media-grid">
              {selected.source.urls.map((url) => (
                <MediaThumbnail key={url} context={context} url={url} large />
              ))}
            </div>
            <p>{selected.summary}</p>
            {!selected.reviewedAt && (
              <AiReviewDecision
                context={context}
                id={selected.id}
                onDone={() => {
                  done(selected.id)
                }}
              />
            )}
            <button
              className="secondary-button"
              disabled={!!selected.reviewedAt}
              onClick={() =>
                void requestAdmin(
                  requireAdminApi(),
                  context,
                  `/admin/ai-review/jobs/${selected.id}/retry`,
                  { method: 'POST', body: {} },
                ).then(() => {
                  setSelected(null)
                  refreshManagementData()
                })
              }
            >
              重新AI审核
            </button>
          </div>
        </Modal>
      )}
    </section>
  )
}

function AiReviewDecision({
  context,
  id,
  onDone,
}: {
  context: OrganizationContext
  id: string
  onDone: () => void
}) {
  const [decision, setDecision] = useState<'ALLOW' | 'BLOCK' | null>(null)
  return decision ? (
    <ActionForm
      context={context}
      path={`/admin/ai-review/jobs/${id}/decision`}
      body={{ decision }}
      submitLabel={decision === 'ALLOW' ? '确认通过' : '暂停公开并通知用户'}
      onDone={onDone}
      refreshAll={false}
    />
  ) : (
    <div className="mc-actions">
      <QuickApprove context={context} path={`/admin/ai-review/jobs/${id}/decision`}
        body={{ decision: 'ALLOW' }} onDone={onDone} />
      <button className="secondary-button" onClick={() => setDecision('BLOCK')}>
        有误
      </button>
    </div>
  )
}
