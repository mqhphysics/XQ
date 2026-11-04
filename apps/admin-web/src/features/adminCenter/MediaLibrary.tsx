import { useEffect, useState } from 'react'
import type { OrganizationContext } from '../adminSchedule/types'
import { requireAdminApi } from '../adminAuth/config'
import { ActionForm, DataState, Modal, Pager, label, message, useAdminData } from './shared'
import type { PageData, Row } from './shared'
import { requestAdmin } from '../adminAuth/request'
import './default-media.css'

const mediaKinds: Record<string, string> = {
  USER_AVATAR: '账号头像',
  PLAYER_AVATAR: '球员头像',
  PLAYER_PORTRAIT: '球员照片',
  TEAM_CREST: '球队队徽',
  TEAM_BACKGROUND: '球队背景',
  POST_IMAGE: '帖子图片',
  COMMENT_IMAGE: '评论图片',
}

export function MediaThumbnail({
  context,
  url,
  large = false,
  previewable = large,
}: {
  context: OrganizationContext
  url: string
  large?: boolean
  previewable?: boolean
}) {
  const [image, setImage] = useState(''),
    [error, setError] = useState('')
  const [expanded, setExpanded] = useState(false)
  useEffect(() => {
    const controller = new AbortController()
    let objectUrl = ''
    const timeout = window.setTimeout(() => {
      setError('图片读取超时，请关闭后重试')
      controller.abort()
    }, 15000)
    setImage('')
    setError('')
    void fetch(`${requireAdminApi()}/admin/center/media/preview?url=${encodeURIComponent(url)}`, {
      headers: {
        authorization: `Bearer ${context.accessToken}`,
        'x-organization-id': context.organizationId,
      },
      cache: 'no-store',
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error(response.status === 404 ? '文件未找到' : '图片暂不可预览')
        const blob = await response.blob()
        if (controller.signal.aborted) return
        objectUrl = URL.createObjectURL(blob)
        setImage(objectUrl)
      })
      .catch((error) => {
        if (!controller.signal.aborted) setError(message(error))
      })
      .finally(() => window.clearTimeout(timeout))
    return () => {
      window.clearTimeout(timeout)
      controller.abort()
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [context.accessToken, context.organizationId, url])
  return (
    <div className={large ? 'gov-image-preview' : 'gov-thumbnail'}>
      {previewable ? (
        <button
          type="button"
          className="gov-image-open"
          disabled={!image}
          aria-label="查看完整图片"
          onClick={(event) => {
            event.stopPropagation()
            setExpanded(true)
          }}
        >
          {image ? <img src={image} alt="媒体内容预览" /> : <span>{error || '读取图片…'}</span>}
        </button>
      ) : image ? (
        <img src={image} alt="媒体内容预览" />
      ) : (
        <span>{error || '读取图片…'}</span>
      )}
      {expanded && image && (
        <Modal title="图片预览" className="mc-image-lightbox" onClose={() => setExpanded(false)}>
          <img className="gov-full-image" src={image} alt="完整图片" />
        </Modal>
      )}
    </div>
  )
}
export function MediaLibrary({ context }: { context: OrganizationContext }) {
  const [page, setPage] = useState(1),
    [query, setQuery] = useState(''),
    [selected, setSelected] = useState<Row | null>(null),
    [action, setAction] = useState<'BLOCK' | 'RESTORE' | null>(null),
    [notice, setNotice] = useState(''),
    [aiBusy, setAiBusy] = useState(false)
  const data = useAdminData<PageData>(
    context,
    `/admin/center/media/library?page=${page}&pageSize=16&query=${encodeURIComponent(query)}`,
  )
  const capabilities = useAdminData<{ aiConfigured: boolean; publicMediaGuardReady: boolean }>(
    context,
    '/admin/center/moderation/capabilities',
  )
  async function ai(url: string) {
    setAiBusy(true)
    try {
      const result = await requestAdmin<{ decision: string; summary: string }>(
        requireAdminApi(),
        context,
        `/admin/center/media/ai-review?url=${encodeURIComponent(url)}`,
        { method: 'POST', body: { reason: '管理员请求图片AI辅助审核' } },
      )
      setNotice(`${label(result.decision)}：${result.summary}`)
    } catch (error) {
      setNotice(message(error))
    } finally {
      setAiBusy(false)
    }
  }
  return (
    <>
      <section className="mc-panel">
        {capabilities.data && !capabilities.data.publicMediaGuardReady ? (
          <p className="mc-alert">
            公开网站的原图拦截尚未启用。目前封禁可移除页面上的图片引用；旧图片地址仍需完成服务接线才能阻断。
          </p>
        ) : null}
        <div className="mc-panel-heading">
          <div>
            <h2>图片预览与管理</h2>
            <p>预览实际文件，封禁图片会移除公开引用并保留处理记录，可恢复。</p>
          </div>
          <button className="secondary-button" onClick={data.refresh}>
            刷新图片
          </button>
        </div>
        <div className="mc-toolbar">
          <input
            aria-label="搜索图片所属对象"
            placeholder="搜索球队、球员或帖子"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setPage(1)
            }}
          />
        </div>
        <DataState {...data} empty={data.data?.items.length === 0} onRetry={data.refresh} />
        {data.data ? (
          <>
            <div className="gov-media-grid">
              {data.data.items.map((row) => (
                <button
                  className="gov-media-card"
                  key={row.id}
                  onClick={() => {
                    setSelected(row)
                    setAction(null)
                    setNotice('')
                  }}
                >
                  <MediaThumbnail context={context} url={String(row.url)} />
                  <strong>{String(row.ownerName)}</strong>
                  <span>
                    {row.visibility === 'BLOCKED'
                      ? '已下架图片'
                      : mediaKinds[String(row.kind)] || '图片'}{' '}
                    · {Number(row.referenceCount)}处引用
                  </span>
                </button>
              ))}
            </div>
            <Pager data={data.data} page={page} onPage={setPage} />
          </>
        ) : null}
      </section>
      {selected ? (
        <Modal title="图片管理" onClose={() => setSelected(null)}>
          <div className="gov-detail-body">
            <MediaThumbnail context={context} url={String(selected.url)} large />
            <h3>{String(selected.ownerName)}</h3>
            <p className="mc-muted">
              {mediaKinds[String(selected.kind)] || '图片'} · 图片状态：
              {selected.visibility === 'BLOCKED' ? '已封禁' : '当前引用'} · 处理版本{' '}
              {Number(selected.policyVersion)}
            </p>
            <p className="mc-muted gov-wrap">{String(selected.url)}</p>
            {notice ? <p className="mc-alert">{notice}</p> : null}
            {!capabilities.data?.aiConfigured ? (
              <p className="mc-muted">AI审核服务尚未配置，可先人工查看和处理图片。</p>
            ) : null}
            {action ? (
              <ActionForm
                context={context}
                path="/admin/center/media/decisions"
                body={{
                  action,
                  url: selected.url,
                  expectedVersion: Number(selected.policyVersion),
                }}
                submitLabel={action === 'BLOCK' ? '确认封禁图片' : '确认恢复图片'}
                onDone={() => {
                  setSelected(null)
                  setAction(null)
                  data.refresh()
                }}
              >
                <p>
                  {action === 'RESTORE'
                    ? '恢复原图片的访问，并恢复仍为空的原引用；已换成新图片的资料不会被覆盖。'
                    : '下架同一文件的当前引用，原文件保留供复核。帖子相册中的图片被封禁时，整组图片先从该帖子下架。'}
                  已下载或缓存的文件无法远程撤回。
                </p>
              </ActionForm>
            ) : (
              <div className="mc-actions">
                <button
                  onClick={() => setAction(selected.visibility === 'BLOCKED' ? 'RESTORE' : 'BLOCK')}
                >
                  {selected.visibility === 'BLOCKED' ? '恢复图片' : '封禁图片'}
                </button>
                <button
                  className="secondary-button"
                  disabled={aiBusy || !capabilities.data?.aiConfigured}
                  onClick={() => {
                    void ai(String(selected.url))
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
