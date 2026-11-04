import { useState } from 'react'
import type { OrganizationContext } from '../adminSchedule/types'
import {
  ActionForm,
  Badge,
  Modal,
  Pager,
  DataState as ReadState,
  time,
  useAdminData,
  type PageData,
} from './shared'
import './direct-message-review.css'
import { QuickApprove } from './QuickApprove'

type Item = {
  id: string
  body: string
  sender: { id: string; displayName: string }
  recipient: { id: string; displayName: string }
  createdAt: string
  status: string
  version: number
  moderatedAt: string | null
}
export function DirectMessageReview({ context }: { context: OrganizationContext }) {
  const [status, setStatus] = useState('PENDING'),
    [query, setQuery] = useState(''),
    [search, setSearch] = useState(''),
    [page, setPage] = useState(1),
    [selected, setSelected] = useState<Item | null>(null),
    [action, setAction] = useState('APPROVE')
  const data = useAdminData<PageData<Item>>(
    context,
    `/admin/center/messages?page=${page}&pageSize=20${status ? '&status=' + status : ''}&query=${encodeURIComponent(search)}`,
  )
  return (
    <section className="mc-card dm-review">
      <header className="dm-review__heading">
        <div>
          <h2>私聊事后审核</h2>
          <p>消息先送达双方；确认违规后可隐藏，原文保留用于管理中心复核。</p>
        </div>
        <span className="dm-review__private">仅管理中心可见 · 人工审核</span>
      </header>
      <form
        className="dm-review__filters"
        onSubmit={(e) => {
          e.preventDefault()
          setSearch(query.trim())
          setPage(1)
        }}
      >
        <input
          aria-label="按聊天双方昵称搜索"
          placeholder="搜索发送人或接收人"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          maxLength={80}
        />
        <select
          aria-label="私聊审核状态"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value)
            setPage(1)
          }}
        >
          <option value="PENDING">待复核</option>
          <option value="APPROVED">已通过</option>
          <option value="HIDDEN">已隐藏</option>
          <option value="">全部</option>
        </select>
        <button type="submit" className="secondary-button">
          查找
        </button>
        <button type="button" className="secondary-button" onClick={data.refresh}>
          刷新
        </button>
      </form>
      <ReadState loading={data.loading} error={data.error} onRetry={data.refresh} />
      {data.data && (
        <>
          {data.data.items.length ? (
            <div className="dm-review__rows">
              {data.data.items.map((item) => (
                <article key={item.id}>
                  <div className="dm-review__meta">
                    <strong>{item.sender.displayName}</strong>
                    <span>发给</span>
                    <strong>{item.recipient.displayName}</strong>
                    <time>{time(item.createdAt)}</time>
                    <Badge value={item.status} />
                  </div>
                  <p>{item.body}</p>
                  {item.status === 'PENDING' && <QuickApprove context={context}
                    path={`/admin/center/messages/${item.id}/decisions`}
                    body={{ action: 'APPROVE', expectedVersion: item.version }}
                    onDone={() => data.update(current => current && ({ ...current,
                      items: current.items.filter(row => row.id !== item.id), total: current.total - 1,
                    }))} />}
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => {
                      setSelected(item)
                      setAction(item.status === 'HIDDEN' ? 'RESTORE' : 'APPROVE')
                    }}
                  >
                    查看并处理
                  </button>
                </article>
              ))}
            </div>
          ) : (
            <div className="mc-state">
              <strong>没有符合条件的私信</strong>
              <p>新的消息发送后会进入待复核列表。</p>
            </div>
          )}
          <Pager data={data.data} page={page} onPage={setPage} />
        </>
      )}
      <p className="mc-muted dm-review__note">
        正文不公开展示、不进入外部 AI 审核。查看和处理均保留操作记录。
      </p>
      {selected && (
        <Modal title="人工复核私信" onClose={() => setSelected(null)}>
          <p>
            {selected.sender.displayName} → {selected.recipient.displayName} ·{' '}
            {time(selected.createdAt)}
          </p>
          <blockquote className="dm-review__original">{selected.body}</blockquote>
          <ActionForm
            context={context}
            path={`/admin/center/messages/${selected.id}/decisions`}
            body={{ action, expectedVersion: selected.version }}
            submitLabel="保存审核结果"
            onDone={() => {
              setSelected(null)
              data.refresh()
            }}
          >
            <label>
              处理方式
              <select
                aria-label="私信处理方式"
                value={action}
                onChange={(e) => setAction(e.target.value)}
              >
                {selected.status === 'HIDDEN' ? (
                  <option value="RESTORE">恢复展示</option>
                ) : (
                  <option value="APPROVE">复核通过，保持展示</option>
                )}
                <option value="HIDE">隐藏违规消息</option>
              </select>
            </label>
          </ActionForm>
        </Modal>
      )}
    </section>
  )
}
