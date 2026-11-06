import { SheetRecognition } from './SheetRecognition'
import { useRef, useState } from 'react'
import { CommandStatus, useWorkflowCommand, useWorkflowRead, workflowRequest } from './client'
import type { ReportWorkspace, WorkflowProps } from './types'
import { parseMatchSheet, type SheetPreview } from './sheet-import.logic'
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
            选择比赛，上传四官表图片，核对并编辑识别结果后保存。已有赛果走原有修改审核流程。
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
  scheduledStartAt,
}: {
  context: WorkflowProps['context']
  matchId: string
  scheduledStartAt?: string | null
}) {
  const data = useWorkflowRead<EditorWorkspace>(context, `/matches/${matchId}/report`)
  const [text, setText] = useState(''),
    [preview, setPreview] = useState<SheetPreview | null>(null),
    [error, setError] = useState(''),
    [reason, setReason] = useState('按签字四官表核对比赛记录'),
    [lineupBusy, setLineupBusy] = useState(false),
    [lineupMessage, setLineupMessage] = useState('')
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
      {blocked && (
        <p className="mc-alert">
          {workspace.blockingReasons?.join('；') ||
            '需要本场编辑权限、规程和双方锁定名单，补齐后即可录入。'}
        </p>
      )}
      <SheetRecognition
        context={context}
        matchId={matchId}
        disabled={locked || blocked}
        onChange={(value) => { setText(value); setPreview(null); setError('') }}
      />
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
