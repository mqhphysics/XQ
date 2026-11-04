import { AdminMessage } from './AdminMessage'
import { refreshManagementData } from '../adminAuth/refresh'
import { useState } from 'react'
import type { OrganizationContext } from '../adminSchedule/types'
import {
  ActionForm,
  Badge,
  DataState,
  Modal,
  Pager,
  time,
  useAdminData,
  message,
  label,
} from './shared'
import type { Row, PageData } from './shared'
import { MediaThumbnail } from './MediaLibrary'
import { PostEditor } from './Content'
import { requireAdminApi } from '../adminAuth/config'
import { requestAdmin } from '../adminAuth/request'
import { QuickApprove } from './QuickApprove'

export function PostComposer({
  context,
  tournamentId,
}: {
  context: OrganizationContext
  tournamentId: string
}) {
  const [title, setTitle] = useState(''),
    [body, setBody] = useState(''),
    [type, setType] = useState('OFFICIAL'),
    [status, setStatus] = useState('PUBLISHED'),
    [images, setImages] = useState<string[]>([]),
    [success, setSuccess] = useState('')
  async function choose(files: FileList | null) {
    if (!files) return
    const selected = [...files]
    if (selected.length > 9) throw new Error('每次最多选择9张图片')
    if (selected.reduce((bytes, file) => bytes + file.size, 0) > 16 * 1024 * 1024)
      throw new Error('图片合计需不超过16MiB，请压缩或减少图片')
    const result = await Promise.all(
      selected.map(
        (file) =>
          new Promise<string>((resolve, reject) => {
            if (file.size > 4 * 1024 * 1024) {
              reject(new Error('单张图片需不超过4MiB'))
              return
            }
            const reader = new FileReader()
            reader.onload = () => resolve(String(reader.result))
            reader.onerror = () => reject(new Error('图片读取失败'))
            reader.readAsDataURL(file)
          }),
      ),
    )
    setImages(result)
  }
  return (
    <section className="mc-panel">
      <div className="mc-panel-heading">
        <div>
          <h2>发布帖子</h2>
          <p>选择当前赛事，填写正文并附图；可直接发布或保存为待审核稿。</p>
        </div>
        <a href="#review" className="mc-link-button">
          前往帖子审核 ↗
        </a>
      </div>
      {success ? (
        <p className="mc-alert" role="status">
          {success}
        </p>
      ) : null}
      <ActionForm
        context={context}
        path="/admin/center/posts"
        body={{ tournamentId, title, body, type, status, imageDataUrls: images }}
        submitLabel={status === 'DRAFT' ? '提交待审核' : '发布帖子'}
        onDone={() => {
          setSuccess(
            status === 'DRAFT'
              ? '已保存为待审核稿，公开网站不会展示。'
              : '帖子已发布，后台已保存正文与图片。',
          )
          setTitle('')
          setBody('')
          setImages([])
        }}
      >
        <div className="mc-form-grid">
          <label className="mc-field">
            <span>内容类型</span>
            <select aria-label="内容类型" value={type} onChange={(e) => setType(e.target.value)}>
              <option value="OFFICIAL">官方资讯</option>
              <option value="COMMUNITY">普通帖子</option>
            </select>
          </label>
          <label className="mc-field">
            <span>发布方式</span>
            <select
              aria-label="发布方式"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              <option value="PUBLISHED">管理员直接发布</option>
              <option value="DRAFT">保存到待审核</option>
            </select>
          </label>
          <label className="mc-field mc-wide">
            <span>标题</span>
            <input
              aria-label="帖子标题"
              required
              minLength={2}
              maxLength={180}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </label>
          <label className="mc-field mc-wide">
            <span>正文</span>
            <textarea
              aria-label="帖子正文"
              required
              rows={8}
              maxLength={2000}
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
          </label>
          <label className="mc-field mc-wide">
            <span>上传图片（最多9张，每张4MiB，合计16MiB）</span>
            <input
              aria-label="上传帖子图片"
              type="file"
              multiple
              accept="image/png,image/jpeg,image/webp,image/gif"
              onChange={(e) => {
                void choose(e.target.files).catch((error) => setSuccess(message(error)))
              }}
            />
          </label>
        </div>
        {images.length ? (
          <div className="gov-upload-preview">
            {images.map((url, index) => (
              <div key={url.slice(-60) + index}>
                <img src={url} alt={`待发布图片${index + 1}`} />
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => setImages(images.filter((_, i) => i !== index))}
                >
                  移除
                </button>
              </div>
            ))}
          </div>
        ) : null}
        {!tournamentId ? <p className="mc-alert">请先选择已发布的赛事。</p> : null}
      </ActionForm>
    </section>
  )
}
export function PostReview({
  context,
  initialStatus = '',
}: {
  context: OrganizationContext
  initialStatus?: string
}) {
  const [page, setPage] = useState(1),
    [query, setQuery] = useState(''),
    [input, setInput] = useState(''),
    [status, setStatus] = useState(initialStatus),
    [selected, setSelected] = useState<Row | null>(null),
    [decision, setDecision] = useState<'APPROVE' | 'BLOCK' | 'RESTORE' | null>(null),
    [aiResult, setAiResult] = useState(''),
    [aiBusy, setAiBusy] = useState(false)
  const [editing, setEditing] = useState(false),
    [contact, setContact] = useState(false)
  const data = useAdminData<PageData>(
    context,
    `/admin/center/posts?page=${page}&pageSize=25&query=${encodeURIComponent(query)}${status ? '&status=' + status : ''}`,
  )
  const capabilities = useAdminData<{ aiConfigured: boolean }>(
    context,
    '/admin/center/moderation/capabilities',
  )
  const visible = data.data?.items.filter((row) => !status || row.status === status) ?? []
  const approved = (id: string) => {
    data.update(current => current && ({ ...current, items: current.items.map(row => row.id === id
      ? { ...row, status: 'PUBLISHED' } : row) }))
    setSelected(null)
  }
  async function ai() {
    if (!selected) return
    setAiBusy(true)
    try {
      const result = await requestAdmin<{ decision: string; summary: string }>(
        requireAdminApi(),
        context,
        `/admin/center/posts/${selected.id}/ai-review`,
        { method: 'POST', body: { reason: '管理员请求帖子AI辅助审核' } },
      )
      setAiResult(`${label(result.decision)}：${result.summary}`)
    } catch (error) {
      setAiResult(message(error))
    } finally {
      setAiBusy(false)
    }
  }
  return (
    <>
      <section className="mc-panel">
        <div className="mc-panel-heading">
          <div>
            <h2>动态审核</h2>
            <p>待审核稿批准后才公开；已发布的违规内容可立即下架，保留原记录。</p>
          </div>
          <button className="secondary-button" onClick={data.refresh}>
            刷新帖子
          </button>
        </div>
        <form
          className="mc-toolbar"
          onSubmit={(e) => {
            e.preventDefault()
            setQuery(input.trim())
            setPage(1)
          }}
        >
          <input
            aria-label="搜索审核帖子"
            placeholder="标题或正文"
            value={input}
            onChange={(e) => setInput(e.target.value)}
          />
          <select
            aria-label="帖子审核状态"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value)
              setPage(1)
            }}
          >
            <option value="">全部状态</option>
            <option value="DRAFT">待审核</option>
            <option value="PUBLISHED">已公开</option>
            <option value="HIDDEN">已封禁 / 已隐藏</option>
          </select>
          <button>搜索</button>
        </form>
        <DataState {...data} empty={visible.length === 0} onRetry={data.refresh} />
        {data.data ? (
          <>
            <div className="mc-table-wrap">
              <table className="mc-table">
                <thead>
                  <tr>
                    <th>帖子</th>
                    <th>作者</th>
                    <th>图片</th>
                    <th>状态</th>
                    <th>时间</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((row) => (
                    <tr
                      key={row.id}
                      className="mc-clickable-row"
                      tabIndex={0}
                      onClick={() => {
                        setSelected(row)
                        setDecision(null)
                        setAiResult('')
                        setEditing(false)
                      }}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          setSelected(row)
                          setDecision(null)
                          setEditing(false)
                        }
                      }}
                    >
                      <td>
                        <strong>{String(row.title ?? '无标题')}</strong>
                        <small>{String(row.body).slice(0, 80)}</small>
                      </td>
                      <td>
                        {(row.author as { displayName: string } | null)?.displayName ?? '官方账号'}
                      </td>
                      <td>
                        {(row.imageUrls as string[] | undefined)?.length ?? (row.imageUrl ? 1 : 0)}
                      </td>
                      <td>
                        <Badge value={row.status} />
                      </td>
                      <td>{time(row.updatedAt)}</td>
                      <td>
                        <button
                          className="secondary-button"
                          onClick={() => {
                            setSelected(row)
                            setDecision(null)
                            setAiResult('')
                            setEditing(false)
                          }}
                        >
                          审核 / 处理 ↗
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pager data={data.data} page={page} onPage={setPage} />
          </>
        ) : null}
      </section>
      {contact && selected?.author ? (
        <AdminMessage
          context={context}
          recipient={selected.author as { id: string; displayName: string }}
          onClose={() => setContact(false)}
        />
      ) : null}
      {selected ? (
        <Modal title="动态审核" onClose={() => setSelected(null)}>
          <div className="gov-detail-body">
            <h3>{String(selected.title ?? '无标题')}</h3>
            <Badge value={selected.status} />
            <p className="mc-prose">{String(selected.body)}</p>
            <div className="gov-media-grid">
              {((selected.imageUrls as string[] | undefined) ?? []).map((url) => (
                <MediaThumbnail key={url} context={context} url={url} large />
              ))}
            </div>
            <ReviewComments context={context} id={selected.id} />
            {aiResult ? <p className="mc-alert">{aiResult}</p> : null}
            <p className="mc-muted">
              {capabilities.data?.aiConfigured
                ? 'AI辅助审核已配置，结果仅作为建议，最终处理由你确认。'
                : 'AI审核服务未接入。现在可人工审核、批准和封禁，接入后这里显示风险建议。'}
            </p>
            {editing ? (
              <PostEditor
                context={context}
                tournamentId={String(selected.tournamentId ?? '')}
                row={selected}
                onDone={() => {
                  setEditing(false)
                  setSelected(null)
                  data.refresh()
                  refreshManagementData()
                }}
              />
            ) : decision ? (
              <ActionForm
                context={context}
                path={`/admin/center/posts/${selected.id}/decisions`}
                body={{ action: decision, expectedUpdatedAt: selected.updatedAt }}
                submitLabel={
                  decision === 'BLOCK'
                    ? '确认封禁帖子'
                    : decision === 'APPROVE'
                      ? '确认批准发布'
                      : '确认恢复发布'
                }
                onDone={() => {
                  setSelected(null)
                  setDecision(null)
                  data.refresh()
                }}
              >
                <p>
                  公开内容和处理记录分开保存。封禁后公开接口不会继续返回该帖子，历史正文保留供你复核。
                </p>
              </ActionForm>
            ) : (
              <div className="mc-actions">
                {!!selected.author && (
                  <button className="secondary-button" onClick={() => setContact(true)}>
                    发私信
                  </button>
                )}
                <button className="secondary-button" onClick={() => setEditing(true)}>
                  编辑帖子信息
                </button>
                {selected.status === 'DRAFT' ? <QuickApprove context={context}
                  path={`/admin/center/posts/${selected.id}/decisions`}
                  body={{ action: 'APPROVE', expectedUpdatedAt: selected.updatedAt }}
                  label="批准发布" onDone={() => approved(selected.id)} /> : <button
                  onClick={() =>
                    setDecision(
                      selected.status === 'HIDDEN'
                        ? 'RESTORE'
                        : selected.status === 'DRAFT'
                          ? 'APPROVE'
                          : 'BLOCK',
                    )
                  }
                >
                  {selected.status === 'HIDDEN'
                    ? '恢复发布'
                    : selected.status === 'DRAFT'
                      ? '批准发布'
                      : '封禁帖子'}
                </button>}
                {selected.status === 'DRAFT' ? (
                  <button className="secondary-button" onClick={() => setDecision('BLOCK')}>
                    拒绝 / 封禁
                  </button>
                ) : null}
                <button
                  className="secondary-button"
                  disabled={aiBusy || !capabilities.data?.aiConfigured}
                  onClick={() => {
                    void ai()
                  }}
                >
                  {aiBusy ? 'AI审核中…' : 'AI辅助审核'}
                </button>
              </div>
            )}
          </div>
        </Modal>
      ) : null}
    </>
  )
}

function ReviewComments({ context, id }: { context: OrganizationContext; id: string }) {
  const data = useAdminData<{
    comments: Array<{
      id: string
      body: string
      imageUrls: string[]
      hiddenAt: string | null
      updatedAt: string
      user: { displayName: string }
    }>
  }>(context, '/admin/center/posts/' + id + '/detail')
  return (
    <section className="review-comments">
      <h3>评论</h3>
      <DataState {...data} onRetry={data.refresh} />
      {data.data?.comments.map((comment) => (
        <article key={comment.id}>
          <strong>{comment.user.displayName}</strong>
          <p>{comment.body}</p>
          <div className="gov-media-grid">{comment.imageUrls?.map(url => <MediaThumbnail key={url} context={context} url={url} large />)}</div>
          {comment.hiddenAt && <span>已隐藏</span>}
        </article>
      ))}
      {data.data && !data.data.comments.length && <p>暂无评论</p>}
    </section>
  )
}
