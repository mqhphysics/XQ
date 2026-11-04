import { useRef, useState } from 'react'
import { CommandStatus, useWorkflowCommand, useWorkflowRead, workflowRequest } from './client'
import type { ReportWorkspace, WorkflowProps } from './types'
import { parseMatchSheet, sheetPrompt, type SheetPreview } from './sheet-import.logic'
import { initializeSheetLineups } from './sheet-lineup.logic'
import { DataState } from '../adminCenter/shared'
import './sheet-import.css'

type EditorWorkspace = ReportWorkspace & { editorToken?: string }
export function AdminSheetImport({ context, tournamentId }: WorkflowProps) {
  const snapshot = useWorkflowRead<{
    matches: Array<{
      id: string
      tournamentId: string
      title: string
      matchCode: string
      scheduledStartAt: string | null
      homeTeam: { name: string } | null
      awayTeam: { name: string } | null
    }>
  }>(context, tournamentId ? '/admin/schedule-workbench' : null)
  const available = (snapshot.data?.matches ?? [])
    .filter((m) => m.tournamentId === tournamentId && m.homeTeam && m.awayTeam)
    .sort(
      (a, b) =>
        (Date.parse(a.scheduledStartAt ?? '') || Infinity) -
          (Date.parse(b.scheduledStartAt ?? '') || Infinity) ||
        a.matchCode.localeCompare(b.matchCode, 'zh-CN', { numeric: true }),
    )
  const [selected, setSelected] = useState('')
  const match = available.find((m) => m.id === selected) ?? available[0]
  return (
    <section className="mc-panel sheet-import-workspace">
      <div className="mc-toolbar">
        <div>
          <h2>四官表录入</h2>
          <p className="mc-muted">
            选择比赛，把识别后的JSON粘贴进来，核对预览后保存。已有赛果走原有修改审核流程。
          </p>
        </div>
      </div>
      <label className="mc-field">
        <span>当前比赛</span>
        <select value={match?.id ?? ''} onChange={(e) => setSelected(e.target.value)}>
          {available.map((m) => (
            <option key={m.id} value={m.id}>
              {m.scheduledStartAt
                ? new Date(m.scheduledStartAt).toLocaleString('zh-CN', {
                    timeZone: 'Asia/Shanghai',
                    month: '2-digit',
                    day: '2-digit',
                    weekday: 'short',
                    hour: '2-digit',
                    minute: '2-digit',
                  })
                : '时间待定'}{' '}
              · {m.homeTeam?.name} — {m.awayTeam?.name} · {m.matchCode}
            </option>
          ))}
        </select>
      </label>
      {match ? (
        <SheetEditor
          key={`${context.accessToken}/${match.id}`}
          context={context}
          matchId={match.id}
        />
      ) : (
        <DataState
          loading={snapshot.loading}
          error={snapshot.error}
          empty
          onRetry={snapshot.refresh}
        />
      )}
    </section>
  )
}
export function SheetEditor({
  context,
  matchId,
  tournamentId = '',
  genericPrompt = false,
  scheduledStartAt,
}: {
  context: WorkflowProps['context']
  matchId: string
  tournamentId?: string
  genericPrompt?: boolean
  scheduledStartAt?: string | null
}) {
  const data = useWorkflowRead<EditorWorkspace>(context, `/matches/${matchId}/report`)
  const [text, setText] = useState(''),
    [preview, setPreview] = useState<SheetPreview | null>(null),
    [error, setError] = useState(''),
    [reason, setReason] = useState('按签字四官表核对比赛记录'),
    [copied, setCopied] = useState(false),
    [lineupBusy, setLineupBusy] = useState(false),
    [lineupMessage, setLineupMessage] = useState('')
  const [images, setImages] = useState<string[]>([]),
    [bulletin, setBulletin] = useState<{ title: string; body: string } | null>(null),
    [publishNews, setPublishNews] = useState(true),
    [newsMessage, setNewsMessage] = useState(''),
    [newsPending, setNewsPending] = useState(false)
  const pendingNews = useRef<{ preview: SheetPreview; version: number } | null>(null)
  const sendNews = async (checked: SheetPreview, version: number) => {
    if (!checked.bulletin || !tournamentId || !context.canManageOrganization || !publishNews) return
    pendingNews.current = { preview: checked, version }
    setNewsPending(true)
    try {
      await workflowRequest(context, '/admin/center/posts', {
        method: 'POST',
        headers: { 'Idempotency-Key': 'sheet-news-' + matchId + '-' + version },
        body: {
          tournamentId,
          type: 'OFFICIAL',
          status: 'PUBLISHED',
          title: checked.bulletin.title,
          body: checked.bulletin.body,
          imageDataUrls: images,
          reason: '核对四官表后发布比赛快报',
        },
      })
      pendingNews.current = null
      setNewsMessage('比赛记录和快报均已保存。')
    } catch (cause) {
      setNewsMessage(
        '比赛记录已保存，快报尚未发布：' + (cause instanceof Error ? cause.message : '请重试'),
      )
    } finally {
      setNewsPending(false)
    }
  }
  const chooseImages = async (files: FileList | null) => {
    if (!files) return
    try {
      const list = [...files]
      if (images.length + list.length > 9) throw Error('最多9张照片')
      const urls = await Promise.all(
        list.map(
          (file) =>
            new Promise<string>((resolve, reject) => {
              if (!/^image\/(jpeg|png|webp|gif)$/.test(file.type) || file.size > 4 * 1024 * 1024)
                return reject(Error('请选择4MB以内的图片'))
              const reader = new FileReader()
              reader.onload = () => resolve(String(reader.result))
              reader.onerror = () => reject(Error('图片读取失败'))
              reader.readAsDataURL(file)
            }),
        ),
      )
      setImages((value) => [...value, ...urls])
      setError('')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '图片读取失败')
    }
  }
  const previewRef = useRef<SheetPreview | null>(null),
    base = useRef<{ version: number; action: string } | null>(null)
  previewRef.current = preview
  const lineupJob = useRef<{
    workspace: ReportWorkspace
    starters: { HOME: string[]; AWAY: string[] }
  } | null>(null)
  const saveLineups = async () => {
    const job = lineupJob.current
    if (!job) return
    setLineupBusy(true)
    try {
      setLineupMessage(
        await initializeSheetLineups(job.workspace, job.starters, (path, options) =>
          workflowRequest(context, path, options),
        ),
      )
      lineupJob.current = null
    } catch (cause) {
      setLineupMessage(
        `比赛记录已保存，默认阵容尚未保存：${cause instanceof Error ? cause.message : '请重试'}`,
      )
    } finally {
      setLineupBusy(false)
    }
  }
  const writer = useWorkflowCommand<EditorWorkspace>(
    context,
    (fresh) => {
      const checked = previewRef.current
      if (
        checked?.starters &&
        workspace &&
        (workspace.permissions.canPublish || context.canManageOrganization) &&
        fresh.confirmedReportVersion === fresh.reportVersion
      ) {
        lineupJob.current = { workspace, starters: checked.starters }
        void saveLineups()
      }
      if (checked && fresh.confirmedReportVersion === fresh.reportVersion)
        void sendNews(checked, fresh.reportVersion)
      setPreview(null)
      previewRef.current = null
      data.refresh()
    },
    `/matches/${matchId}/report`,
  )
  const begin = useWorkflowCommand<EditorWorkspace>(
    context,
    (fresh) => {
      const current = previewRef.current,
        version = base.current
      if (!current || !version || fresh.reportVersion !== version.version || !fresh.editorToken) {
        setError('本场记录已变化，请刷新并重新核对预览。')
        data.refresh()
        return
      }
      void writer.run({
        path: `/matches/${matchId}/report`,
        body: {
          clientActionId: `${version.action}-save`,
          expectedVersion: fresh.reportVersion,
          editorToken: fresh.editorToken,
          action: current.warnings.length ? 'SAVE_SCORE' : 'COMPLETE',
          reason: reason.trim(),
          homeRosterSnapshotId: fresh.homeTeam.rosterSnapshotId,
          awayRosterSnapshotId: fresh.awayTeam.rosterSnapshotId,
          ruleVersionId: fresh.ruleVersionId,
          fields: current.fields,
        },
      })
    },
    `/matches/${matchId}/report/editor`,
  )
  const locked = begin.locked || writer.locked || lineupBusy
  const workspace = data.data
  const blocked =
    !workspace?.permissions.canEdit ||
    !workspace.ruleVersionId ||
    !workspace.homeTeam.rosterSnapshotId ||
    !workspace.awayTeam.rosterSnapshotId
  if (!workspace)
    return (
      <DataState loading={data.loading} error={data.error} empty={false} onRetry={data.refresh} />
    )
  const check = () => {
    try {
      const next = parseMatchSheet(text, workspace)
      if (next.date && scheduledStartAt) {
        const d = new Date(scheduledStartAt),
          date = new Intl.DateTimeFormat('en-CA', {
            timeZone: 'Asia/Shanghai',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
          }).format(d)
        if (/^\d{4}-\d{2}-\d{2}$/.test(next.date) && next.date !== date)
          throw Error('识别日期与所选比赛不一致，请核对比赛卡片。')
      }
      setPreview(next)
      setBulletin(next.bulletin ?? null)
      setError('')
      base.current = { version: workspace.reportVersion, action: `sheet-${crypto.randomUUID()}` }
    } catch (cause) {
      setPreview(null)
      setError(cause instanceof Error ? cause.message : '内容无法读取')
    }
  }
  const save = () => {
    if (!preview || !base.current || reason.trim().length < 2) return
    void begin.run({
      path: `/matches/${matchId}/report/editor`,
      body: { clientActionId: `${base.current.action}-begin` },
    })
  }
  return (
    <div className="sheet-import">
      {!genericPrompt && (
        <div className="mc-toolbar">
          <p className="mc-muted">
            {workspace.homeTeam.name} 对 {workspace.awayTeam.name} · 当前版本{' '}
            {workspace.reportVersion}
          </p>
          <button
            type="button"
            className="secondary-button"
            onClick={() => {
              void navigator.clipboard.writeText(sheetPrompt(workspace)).then(
                () => setCopied(true),
                () => setError('未能复制提示词，请允许浏览器访问剪贴板。'),
              )
            }}
          >
            {copied ? '提示词已复制' : '复制给GPT的识别提示词'}
          </button>
        </div>
      )}
      {blocked && (
        <p className="mc-alert">
          {workspace.blockingReasons?.join('；') ||
            '需要本场编辑权限、规程和双方锁定名单，补齐后即可录入。'}
        </p>
      )}
      <label className="mc-field">
        <span>识别结果JSON</span>
        <textarea
          rows={8}
          spellCheck={false}
          maxLength={100000}
          value={text}
          disabled={locked}
          placeholder="粘贴识别结果，再点击核对预览"
          onChange={(e) => {
            setText(e.target.value)
            setPreview(null)
            setError('')
          }}
        />
      </label>
      <button
        type="button"
        className="secondary-button"
        disabled={locked || !text.trim() || blocked}
        onClick={check}
      >
        核对预览
      </button>
      {error && (
        <p className="mc-alert" role="alert">
          {error}
        </p>
      )}
      <label className="mc-field">
        <span>导入识别JSON文件</span>
        <input
          type="file"
          accept=".json,application/json"
          multiple
          onChange={(event) => {
            const files = [...(event.target.files ?? [])]
            void Promise.all(files.map((file) => file.text()))
              .then((texts) => {
                if (texts.length === 1) setText(texts[0]!)
                else
                  setText(
                    JSON.stringify(
                      texts.flatMap((text) => {
                        const value = JSON.parse(text)
                        return Array.isArray(value) ? value : [value]
                      }),
                      null,
                      2,
                    ),
                  )
                setPreview(null)
              })
              .catch(() => setError('文件无法读取，请检查JSON是否完整'))
          }}
        />
      </label>
      <div
        className="intake-photo-drop"
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault()
          void chooseImages(event.dataTransfer.files)
        }}
      >
        <label>
          快报配图（公开）：拖入比赛照片，或选择图片
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            multiple
            onChange={(event) => void chooseImages(event.target.files)}
          />
        </label>
        <div className="gov-upload-preview">
          {images.map((url, index) => (
            <button
              type="button"
              key={index}
              onClick={() => setImages((values) => values.filter((_, i) => i !== index))}
              aria-label="移除照片"
            >
              <img src={url} alt="比赛照片" />
            </button>
          ))}
        </div>
      </div>
      {bulletin && (
        <section className="intake-bulletin">
          <h3>比赛快报</h3>
          <input
            aria-label="快报标题"
            value={bulletin.title}
            maxLength={180}
            onChange={(event) => {
              const next = { ...bulletin, title: event.target.value }
              setBulletin(next)
              if (preview) {
                preview.bulletin = next
                previewRef.current = preview
              }
            }}
          />
          <textarea
            aria-label="快报正文"
            value={bulletin.body}
            maxLength={2000}
            onChange={(event) => {
              const next = { ...bulletin, body: event.target.value }
              setBulletin(next)
              if (preview) {
                preview.bulletin = next
                previewRef.current = preview
              }
            }}
          />
          {context.canManageOrganization && (
            <label>
              <input
                type="checkbox"
                checked={publishNews}
                onChange={(event) => setPublishNews(event.target.checked)}
              />
              保存比赛记录后同时发布快报
            </label>
          )}
        </section>
      )}
      {newsMessage && <p role="status">{newsMessage}</p>}
      {pendingNews.current && (
        <button
          type="button"
          disabled={newsPending}
          onClick={() => void sendNews(pendingNews.current!.preview, pendingNews.current!.version)}
        >
          {newsPending ? '正在发布…' : '重试发布快报'}
        </button>
      )}
      {preview && (
        <div className="mc-panel sheet-import-preview">
          <h3>
            {workspace.homeTeam.name} {preview.fields.homeScore} : {preview.fields.awayScore}{' '}
            {workspace.awayTeam.name}
          </h3>
          <p>{preview.fields.events.length}条事件；首发只读取明确勾选，学号和出场时间不推断。</p>
          {preview.starterLabels.map((label) => (
            <p key={label}>{label}</p>
          ))}
          {preview.starterWarnings.map((warning) => (
            <p className="mc-muted" key={warning}>
              {warning}
            </p>
          ))}
          {preview.starterLabels.length > 0 && (
            <p className="mc-muted">
              管理员保存后，为尚无默认阵容的球队保存这份首发；位置和阵型暂定，已有默认阵容保留。
            </p>
          )}
          {preview.warnings.map((w) => (
            <p className="mc-muted" key={w}>
              {w}
            </p>
          ))}
          <ol>
            {preview.eventLabels.map((label, i) => (
              <li key={i}>{label}</li>
            ))}
          </ol>
          {preview.fields.notes && <p>{preview.fields.notes}</p>}
          <label className="mc-field">
            <span>录入依据</span>
            <input
              value={reason}
              maxLength={240}
              disabled={locked}
              onChange={(e) => setReason(e.target.value)}
            />
          </label>
          <p className="mc-muted">
            {preview.warnings.length
              ? '有待核实内容：先保存比分，缺少的信息继续保留待补。'
              : '数据齐全：保存比赛比分与事件。'}{' '}
            {workspace.permissions.canPublish || context.canManageOrganization
              ? '管理员确认后立即更新公开数据。'
              : '当前账号提交后等待管理员审核。'}
          </p>
          <button type="button" disabled={locked || reason.trim().length < 2} onClick={save}>
            {writer.busy || begin.busy ? '正在保存…' : '核对无误，保存记录'}
          </button>
        </div>
      )}
      <CommandStatus command={begin} />
      <CommandStatus command={writer} />
      {lineupMessage && (
        <p role="status" className="mc-muted">
          {lineupMessage}
        </p>
      )}
      {lineupJob.current && !lineupBusy && (
        <button type="button" className="secondary-button" onClick={() => void saveLineups()}>
          重试保存默认阵容
        </button>
      )}
    </div>
  )
}
