import { useId, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { requireAdminApi } from '../adminAuth/config'
import { requestAdmin } from '../adminAuth/request'
import type { OrganizationContext } from '../adminSchedule/types'
import {
  ActionForm,
  Badge,
  DataState,
  Modal,
  Pager,
  PendingCapability,
  message,
  time,
  useAdminData,
} from './shared'
import type { Row } from './shared'
import { RegistrationFeedback } from './RegistrationFeedback'

interface Feedback extends Row {
  reason: string
  details: string | null
  targetType: string
  status: string
  resolution: string | null
  targetPreview: { title: string; body: string; linkPath: string } | null
  reporter: { id: string; displayName: string }
  handledBy: { displayName: string } | null
}
export function Content({ context }: { context: OrganizationContext }) {
  const [tab, setTab] = useState('content')
  const registration = useAdminData<{ pendingCount: number }>(
    context,
    '/admin/center/registration-feedback?page=1&pageSize=1',
  )
  return (
    <>
      <div className="workspace-view-tabs" role="tablist" aria-label="反馈类型">
        <button role="tab" aria-selected={tab === 'content'} onClick={() => setTab('content')}>
          反馈与举报
        </button>
        <button
          role="tab"
          aria-selected={tab === 'registration'}
          onClick={() => setTab('registration')}
        >
          注册问题
          {Boolean(registration.data?.pendingCount) && (
            <span className="mc-badge">{registration.data?.pendingCount}</span>
          )}
        </button>
      </div>
      {tab === 'registration' ? (
        <RegistrationFeedback context={context} onChanged={registration.refresh} />
      ) : (
        <Feedbacks context={context} />
      )}
    </>
  )
}
function Feedbacks({ context }: { context: OrganizationContext }) {
  const result = useAdminData<{ items: Feedback[] }>(context, '/admin/reports')
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('')
  const [selected, setSelected] = useState<Feedback | null>(null)
  const [editing, setEditing] = useState(false)
  const [page, setPage] = useState(1)
  const filtered =
    result.data?.items.filter(
      (r) =>
        (!status || r.status === status) &&
        `${r.reason} ${r.details || ''} ${r.reporter.displayName}`
          .toLowerCase()
          .includes(query.toLowerCase()),
    ) ?? []
  return (
    <>
      <section className="mc-panel">
        <div className="mc-panel-heading">
          <div>
            <h2>反馈与举报</h2>
            <p>当前接口最多返回最近 200 条，回复会通知提交者。</p>
          </div>
          <button
            className="secondary-button"
            onClick={() => {
              setSelected(null)
              result.refresh()
            }}
          >
            刷新
          </button>
        </div>
        <div className="mc-toolbar">
          <input
            aria-label="搜索反馈"
            placeholder="搜索问题或提交者"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setPage(1)
            }}
          />
          <select
            aria-label="反馈状态"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value)
              setPage(1)
            }}
          >
            {[
              ['', '全部状态'],
              ['OPEN', '待处理'],
              ['IN_REVIEW', '处理中'],
              ['RESOLVED', '已处理'],
              ['REJECTED', '已驳回'],
            ].map(([id, title]) => (
              <option key={id} value={id}>
                {title}
              </option>
            ))}
          </select>
        </div>
        <DataState {...result} empty={!filtered.length} onRetry={result.refresh} />
        {filtered.length ? (
          <>
            <div className="mc-table-wrap">
              <table className="mc-table">
                <thead>
                  <tr>
                    <th>问题</th>
                    <th>提交者</th>
                    <th>状态</th>
                    <th>提交时间</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.slice((page - 1) * 10, page * 10).map((r) => (
                    <tr key={r.id}>
                      <td>
                        <strong>{r.reason}</strong>
                        <small>{(r.details || '').slice(0, 60)}</small>
                      </td>
                      <td>{r.reporter.displayName}</td>
                      <td>
                        <Badge value={r.status} />
                      </td>
                      <td>{time(r.createdAt)}</td>
                      <td>
                        <button className="mc-link-button" onClick={() => setSelected(r)}>
                          查看与处理 ↗
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pager
              data={{ items: filtered, total: filtered.length, page, pageSize: 10 }}
              page={page}
              onPage={setPage}
            />
          </>
        ) : null}
      </section>
      {selected && !editing ? (
        <Modal title="反馈详情" onClose={() => setSelected(null)}>
          <section className="mc-panel mc-detail">
            <div className="mc-panel-heading">
              <h2>{selected.reason}</h2>
              <button className="secondary-button" onClick={() => setSelected(null)}>
                收起详情
              </button>
            </div>
            <dl className="mc-facts">
              <div>
                <dt>提交者</dt>
                <dd>{selected.reporter.displayName}</dd>
              </div>
              <div>
                <dt>状态</dt>
                <dd>
                  <Badge value={selected.status} />
                </dd>
              </div>
              <div>
                <dt>工单编号</dt>
                <dd>{selected.id}</dd>
              </div>
              <div>
                <dt>处理人</dt>
                <dd>{selected.handledBy?.displayName || '尚未分配'}</dd>
              </div>
            </dl>
            <p className="mc-prose">{selected.details || '没有补充说明'}</p>
            {selected.targetPreview ? (
              <blockquote className="mc-quote">
                <strong>{selected.targetPreview.title}</strong>
                <p>{selected.targetPreview.body}</p>
              </blockquote>
            ) : null}
            {selected.resolution ? (
              <div className="mc-alert">
                <strong>处理回复</strong>
                <p className="mc-prose">{selected.resolution}</p>
              </div>
            ) : null}
            <button
              disabled={['RESOLVED', 'REJECTED'].includes(selected.status)}
              onClick={() => setEditing(true)}
            >
              处理并回复
            </button>
            <p className="mc-muted">已完成的工单保留处理结果；内容隐藏后仍保留记录。</p>
          </section>
        </Modal>
      ) : null}
      {selected && editing ? (
        <Modal title="处理反馈" onClose={() => setEditing(false)}>
          <FeedbackReview
            context={context}
            item={selected}
            onDone={() => {
              setEditing(false)
              setSelected(null)
              result.refresh()
            }}
          />
        </Modal>
      ) : null}
      <PendingCapability
        title="案件证据与申诉"
        description="当前可处理反馈和隐藏被举报内容。不可变证据附件、分派与申诉流程尚未接通。"
      />
    </>
  )
}
function FeedbackReview({
  context,
  item,
  onDone,
}: {
  context: OrganizationContext
  item: Feedback
  onDone: () => void
}) {
  const [resolution, setResolution] = useState('')
  const [status, setStatus] = useState('RESOLVED')
  const [hide, setHide] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const lock = useRef(false)
  async function submit(e: FormEvent) {
    e.preventDefault()
    if (lock.current) return
    lock.current = true
    setBusy(true)
    setError('')
    try {
      await requestAdmin(requireAdminApi(), context, `/admin/reports/${item.id}`, {
        method: 'PUT',
        body: { status, resolution: resolution.trim(), hideContent: hide && status === 'RESOLVED' },
      })
      onDone()
    } catch (caught) {
      setError(message(caught))
    } finally {
      lock.current = false
      setBusy(false)
    }
  }
  return (
    <form
      className="mc-form"
      onSubmit={(e) => {
        void submit(e)
      }}
    >
      <strong>{item.reason}</strong>
      <label className="mc-field">
        <span>处理结果</span>
        <select
          value={status}
          disabled={busy}
          onChange={(e) => {
            setStatus(e.target.value)
            setHide(false)
          }}
        >
          <option value="IN_REVIEW">标记处理中</option>
          <option value="RESOLVED">处理完成</option>
          <option value="REJECTED">驳回</option>
        </select>
      </label>
      <label className="mc-field">
        <span>回复与处理说明</span>
        <textarea
          required
          minLength={2}
          maxLength={1000}
          value={resolution}
          onChange={(e) => setResolution(e.target.value)}
          disabled={busy}
        />
      </label>
      {['POST', 'COMMENT'].includes(item.targetType) && status === 'RESOLVED' ? (
        <label className="mc-checkbox">
          <input
            type="checkbox"
            checked={hide}
            disabled={busy}
            onChange={(e) => setHide(e.target.checked)}
          />
          同时隐藏被举报的内容
        </label>
      ) : null}
      {error ? (
        <p className="mc-alert mc-error" role="alert">
          {error}
        </p>
      ) : null}
      <button disabled={busy || resolution.trim().length < 2}>
        {busy ? '正在保存…' : '保存并通知提交者'}
      </button>
    </form>
  )
}
export function PostEditor({
  context,
  tournamentId,
  row,
  onDone,
}: {
  context: OrganizationContext
  tournamentId: string
  row: Row | null
  onDone: () => void
}) {
  const editorId = useId()
  const [title, setTitle] = useState(String(row?.title ?? ''))
  const [body, setBody] = useState(String(row?.body ?? ''))
  const [status, setStatus] = useState(String(row?.status ?? 'PUBLISHED'))
  return (
    <ActionForm
      context={context}
      path={row ? `/admin/center/posts/${row.id}` : '/admin/center/posts'}
      method={row ? 'PATCH' : 'POST'}
      body={
        row
          ? {
              expectedUpdatedAt: row.updatedAt,
              patch: {
                title: title.trim(),
                body: body.trim(),
                ...(status !== String(row.status) ? { status } : {}),
              },
            }
          : { tournamentId, title: title.trim(), body: body.trim() }
      }
      submitLabel={row ? '保存修改' : '确认发布'}
      onDone={onDone}
    >
      <label className="mc-field">
        <span id={`${editorId}-title`}>标题</span>
        <input
          aria-labelledby={`${editorId}-title`}
          required
          minLength={2}
          maxLength={160}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
      </label>
      <label className="mc-field">
        <span id={`${editorId}-body`}>正文</span>
        <textarea
          aria-labelledby={`${editorId}-body`}
          required
          maxLength={2000}
          rows={7}
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
      </label>
      {row ? (
        <label className="mc-field">
          <span id={`${editorId}-status`}>可见状态</span>
          <select
            aria-labelledby={`${editorId}-status`}
            disabled={row.status === 'DRAFT'}
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            {row.status === 'DRAFT' ? (
              <option value="DRAFT">待审核（请用审核动作批准）</option>
            ) : null}
            <option value="PUBLISHED">已发布</option>
            <option value="HIDDEN">已隐藏</option>
          </select>
        </label>
      ) : (
        <p className="mc-muted">发布后将作为当前赛事的官方资讯出现在晓球网站。</p>
      )}
    </ActionForm>
  )
}
