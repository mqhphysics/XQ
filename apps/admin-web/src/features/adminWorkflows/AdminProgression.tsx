import { validateRuleDocument } from './rule.logic'
import { useState } from 'react'
import {
  actionId,
  CommandStatus,
  displayDate,
  errorMessage,
  useWorkflowCommand,
  useWorkflowRead,
  workflowRequest,
} from './client'
import type { OfficialResults, ProgressionPreview, RuleVersion, WorkflowProps } from './types'
import './workflows.css'

interface ScheduleRulesSnapshot {
  tournaments: { id: string; status: string }[]
  ruleVersions: RuleVersion[]
  teams: { id: string; name: string }[]
  matches: { id: string; title?: string; tournamentId: string }[]
}
const progressionReasons: Record<string, string> = {
  SOURCE_UNCONFIRMED: '来源比赛还有未确认报告',
  SOURCE_VOID: '来源比赛已作废，无法使用该结果安排晋级',
  UNRESOLVED_GROUP_RANK: '来源小组排名仍存在未解决的并列',
  CONFIRMED_RULE_VERSION_MISMATCH: '来源报告绑定的规程与所选规程不同，请核对报告版本后选择对应规程',
  CONFIRMED_FORFEIT_SCORE_MISMATCH: '来源弃权比分与所选规程不同，需要更正并重新确认报告',
  DRAW_REQUIRES_DECISION: '来源比赛平局尚未决定晋级球队',
  SOURCE_MATCHES_UNCONFIRMED: '来源比赛还有未确认报告',
  TARGET_ALREADY_STARTED_OR_REPORTED: '下游比赛已经开赛或已有报告',
  TARGET_LINEUP_ALREADY_BOUND: '下游比赛已绑定正式单场阵容',
  DUPLICATE_QUALIFIER: '同一球队被安排到不同目标比赛',
  SAME_TEAM_TARGET: '目标比赛双方为同一支球队',
  GROUP_TIE_UNRESOLVED: '小组排名存在尚未解决的并列',
  PROGRESSION_RULES_REQUIRED: '赛事尚未配置晋级规程',
  NO_SOURCE_MATCHES: '晋级规程没有可用的来源比赛',
}

export function AdminProgression(props: WorkflowProps) {
  if (!props.tournamentId)
    return (
      <section className="mc-panel">
        <p className="mc-muted">请先选择要管理的赛事。</p>
      </section>
    )
  return (
    <ProgressionWorkspace key={`${props.context.accessToken}:${props.tournamentId}`} {...props} />
  )
}

function ProgressionWorkspace({ context, tournamentId }: WorkflowProps) {
  const snapshot = useWorkflowRead<ScheduleRulesSnapshot>(context, '/admin/schedule-workbench')
  const [ruleId, setRuleId] = useState('')
  const versions = (snapshot.data?.ruleVersions ?? [])
    .filter((rule) => rule.tournamentId === tournamentId)
    .sort((a, b) => b.version - a.version)
  const selected = versions.find((rule) => rule.id === ruleId) ?? versions[0]
  const ruleProblem = selected ? validateRuleDocument(selected.rules) : '尚无规程'
  const canReadResults =
    snapshot.data?.tournaments.find((t) => t.id === tournamentId)?.status === 'PUBLISHED' &&
    !ruleProblem
  const results = useWorkflowRead<OfficialResults>(
    context,
    canReadResults ? `/public/tournaments/${encodeURIComponent(tournamentId)}/results` : null,
  )
  const [preview, setPreview] = useState<ProgressionPreview | null>(null)
  const [previewBusy, setPreviewBusy] = useState(false)
  const [previewError, setPreviewError] = useState('')
  const [reason, setReason] = useState('')
  const [confirmation, setConfirmation] = useState(false)
  const command = useWorkflowCommand<{ version: number }>(
    context,
    (result) => {
      setPreview(null)
      setConfirmation(false)
      setReason('')
      results.refresh()
      snapshot.refresh()
      setPreviewError(`晋级版本 v${result.version} 已确认，请刷新赛程查看安排。`)
    },
    `/admin/tournaments/${encodeURIComponent(tournamentId)}/progression/confirm`,
  )
  const loadPreview = async () => {
    if (!selected || previewBusy || command.locked) return
    setPreviewBusy(true)
    setPreviewError('')
    setPreview(null)
    setConfirmation(false)
    try {
      setPreview(
        await workflowRequest<ProgressionPreview>(
          context,
          `/admin/tournaments/${encodeURIComponent(tournamentId)}/progression/preview`,
          { method: 'POST', body: { ruleVersionId: selected.id } },
        ),
      )
    } catch (error) {
      setPreviewError(errorMessage(error))
    } finally {
      setPreviewBusy(false)
    }
  }
  const confirm = () => {
    if (!preview || preview.status !== 'READY' || !reason.trim()) return
    setConfirmation(false)
    void command.run({
      path: `/admin/tournaments/${encodeURIComponent(tournamentId)}/progression/confirm`,
      headers: { 'Idempotency-Key': actionId() },
      body: {
        ruleVersionId: preview.ruleVersionId,
        expectedVersion: preview.version,
        sourceHash: preview.sourceHash,
        reason: reason.trim(),
      },
    })
  }
  const teamName = (id: string) => snapshot.data?.teams.find((team) => team.id === id)?.name ?? id
  const matchName = (id: string) =>
    snapshot.data?.matches.find((match) => match.id === id)?.title ?? id
  return (
    <div className="wf-sections">
      <section className="mc-panel">
        <div className="mc-toolbar">
          <div>
            <h2>正式结果与晋级</h2>
            <p className="mc-muted">只按已确认报告计算。晋级先预览，再确认写入赛程。</p>
          </div>
          <button
            type="button"
            disabled={command.locked || previewBusy}
            onClick={() => {
              results.refresh()
              snapshot.refresh()
              setPreview(null)
            }}
          >
            刷新数据
          </button>
        </div>
        {snapshot.data && !canReadResults ? (
          <p className="mc-muted mc-setup-note">
            该赛事尚未具备公开的 V2
            正式结果。可查看赛程和战报；完整规程配置好后再核对正式统计与晋级。
          </p>
        ) : null}
        {results.loading ? (
          <p className="mc-muted" role="status">
            正在读取正式结果…
          </p>
        ) : null}
        {results.error ? (
          <p className="mc-alert" role="alert">
            {results.error}
          </p>
        ) : null}
        {results.data ? (
          <>
            <div className="wf-facts">
              <span className="mc-badge">正式结果</span>
              <span>{results.data.confirmedResults.length} 场已确认比赛</span>
              <span>{results.data.groups.length} 个小组</span>
            </div>
            <div className="mc-table-wrap">
              <table className="mc-table">
                <thead>
                  <tr>
                    <th>比赛</th>
                    <th>主队</th>
                    <th>比分</th>
                    <th>客队</th>
                    <th>确认版本</th>
                  </tr>
                </thead>
                <tbody>
                  {results.data.confirmedResults.map((result) => (
                    <tr key={result.id}>
                      <td>{matchName(result.id)}</td>
                      <td>{teamName(result.homeTeamId)}</td>
                      <td>
                        {result.homeScore ?? '—'}:{result.awayScore ?? '—'}
                      </td>
                      <td>{teamName(result.awayTeamId)}</td>
                      <td>v{results.data!.sourceVersions[result.id] ?? 0}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!results.data.confirmedResults.length ? (
              <p className="mc-muted">尚无正式确认结果。</p>
            ) : null}
          </>
        ) : null}
        {snapshot.error ? <p className="mc-alert">{snapshot.error}</p> : null}
        <div className="mc-toolbar">
          <label className="mc-field">
            晋级使用的规程
            <select
              aria-label="晋级使用的规程"
              disabled={command.locked || previewBusy}
              value={selected?.id ?? ''}
              onChange={(event) => {
                setRuleId(event.target.value)
                setPreview(null)
                setConfirmation(false)
              }}
            >
              <option value="" disabled>
                选择已发布规程
              </option>
              {versions.map((rule) => (
                <option key={rule.id} value={rule.id}>
                  v{rule.version} · {rule.name}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            disabled={!selected || Boolean(ruleProblem) || command.locked || previewBusy}
            onClick={() => {
              void loadPreview()
            }}
          >
            {previewBusy ? '正在核对来源…' : '预览晋级安排'}
          </button>
        </div>
        {previewError ? (
          <p className="mc-alert" role="status">
            {previewError}
          </p>
        ) : null}
        {preview ? (
          <div className="wf-preview">
            <div className="wf-facts">
              <span className="mc-badge">
                {preview.status === 'READY' ? '可确认' : '条件未满足'}
              </span>
              <span>晋级基线 v{preview.version}</span>
            </div>
            {preview.reasons.length ? (
              <div className="mc-alert">
                <ul>
                  {preview.reasons.map((message) => (
                    <li key={message}>{progressionReasons[message] ?? message}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            <div className="mc-table-wrap">
              <table className="mc-table">
                <thead>
                  <tr>
                    <th>目标比赛</th>
                    <th>位置</th>
                    <th>晋级球队</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.slots.map((slot) => (
                    <tr key={`${slot.targetMatchId}:${slot.side}`}>
                      <td>{matchName(slot.targetMatchId)}</td>
                      <td>{slot.side === 'HOME' ? '主队' : '客队'}</td>
                      <td>{teamName(slot.teamId)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mc-muted">
              确认时服务器会再次核对规程、报名、小组、来源报告和下游比赛。来源发生变化时，此预览失效。
            </p>
            <label className="mc-field">
              确认原因
              <textarea
                maxLength={500}
                value={reason}
                aria-label="确认依据"
                disabled={command.locked}
                onChange={(event) => setReason(event.target.value)}
                placeholder="记录确认依据及赛事安排说明"
              />
            </label>
            <button
              type="button"
              disabled={preview.status !== 'READY' || !reason.trim() || command.locked}
              onClick={() => setConfirmation(true)}
            >
              确认晋级安排
            </button>
            {confirmation ? (
              <div className="mc-alert" role="alertdialog" aria-label="确认晋级安排">
                <p>
                  将按此预览写入 {preview.slots.length} 个比赛位置，并保留晋级版本、原因及审计记录。
                </p>
                <div className="mc-actions">
                  <button type="button" onClick={confirm}>
                    确认写入赛程
                  </button>
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => setConfirmation(false)}
                  >
                    取消
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
        <CommandStatus command={command} />
      </section>
      {snapshot.data ? (
        <details className="wf-rule-editor-shell">
          <summary>
            赛事规程配置 <span>首次配置或开赛前调整时展开</span>
          </summary>
          <RuleVersionEditor
            key={`${context.accessToken}:${tournamentId}`}
            context={context}
            tournamentId={tournamentId}
            versions={versions}
            unavailable={snapshot.loading || Boolean(snapshot.error)}
            onPublished={() => {
              snapshot.refresh()
              results.refresh()
              setPreview(null)
            }}
          />
        </details>
      ) : null}
    </div>
  )
}

function RuleVersionEditor({
  context,
  tournamentId,
  versions,
  onPublished,
  unavailable,
}: WorkflowProps & { versions: RuleVersion[]; onPublished: () => void; unavailable: boolean }) {
  const canPublish = context.canManageOrganization && !unavailable
  const latest = versions[0]
  const currentVersion = Math.max(0, ...versions.map((item) => item.version))
  const [expectedVersionBase, setExpectedVersionBase] = useState(currentVersion)
  const versionChanged = currentVersion > expectedVersionBase
  const [name, setName] = useState(latest ? `${latest.name}（修订）` : '赛事规程')
  const [version, setVersion] = useState(String((latest?.version ?? 0) + 1))
  const [jsonText, setJsonText] = useState(latest ? JSON.stringify(latest.rules, null, 2) : '{}')
  const [publishReason, setPublishReason] = useState('')
  const [error, setError] = useState('')
  const [confirmed, setConfirmed] = useState(false)
  const path = `/admin/center/tournaments/${encodeURIComponent(tournamentId)}/rule-versions`
  const command = useWorkflowCommand<RuleVersion>(
    context,
    (published) => {
      setConfirmed(false)
      setExpectedVersionBase(published.version)
      setVersion(String(published.version + 1))
      setName(`${published.name}（修订）`)
      setJsonText(JSON.stringify(published.rules, null, 2))
      setPublishReason('')
      setError('')
      onPublished()
    },
    path,
  )
  const validate = (): Record<string, unknown> | null => {
    try {
      if (!name.trim() || name.trim().length > 120) throw new Error('规程名称需填写 1–120 字。')
      if (
        !/^\d{1,3}$/.test(version) ||
        Number(version) < 1 ||
        Number(version) > 999 ||
        Number(version) <= expectedVersionBase ||
        versions.some((item) => item.version === Number(version))
      )
        throw new Error('请选择高于编辑基线且尚未使用的规程版本号（1–999）。')
      const parsed: unknown = JSON.parse(jsonText)
      const problem = validateRuleDocument(parsed)
      if (problem) throw new Error(problem)
      setError('')
      return parsed as Record<string, unknown>
    } catch (cause) {
      setError(
        cause instanceof SyntaxError
          ? 'JSON格式无效，请检查逗号、引号和括号。'
          : errorMessage(cause),
      )
      return null
    }
  }
  const publish = () => {
    if (!canPublish || !publishReason.trim()) {
      setError('发布规程需组织管理员权限，并填写发布原因。')
      return
    }
    if (versionChanged) {
      setConfirmed(false)
      setError('规程已有新版本。你的编辑内容仍保留，请先以最新版本继续核对。')
      return
    }
    const rules = validate()
    if (!rules) return
    setConfirmed(false)
    void command.run({
      path,
      headers: { 'Idempotency-Key': actionId() },
      body: {
        version: Number(version),
        name: name.trim(),
        rules,
        reason: publishReason.trim(),
        expectedVersion: expectedVersionBase,
      },
    })
  }
  return (
    <section className="mc-panel">
      <div className="mc-toolbar">
        <div>
          <h2>赛事规程版本</h2>
          <p className="mc-muted">使用完整规则 JSON 创建新版本，历史规程保持原样。</p>
          <p className="mc-muted">
            比赛开始录入后，规程变更需显式迁移流程，当前发布操作会被服务器拒绝。
          </p>
        </div>
      </div>
      {!context.canManageOrganization ? (
        <p className="mc-alert">当前赛事管理员可查看规程和管理晋级；发布新规程请联系组织管理员。</p>
      ) : null}
      {versionChanged ? (
        <div className="mc-alert" role="alert">
          <p>
            当前规程已更新至 v{currentVersion}，你的编辑基于 v{expectedVersionBase}
            。JSON、名称与发布原因均已保留，请核对新规程后再继续。
          </p>
          <button
            type="button"
            className="secondary-button"
            disabled={command.locked || !canPublish}
            onClick={() => {
              setExpectedVersionBase(currentVersion)
              setVersion(String(currentVersion + 1))
              setConfirmed(false)
              setError('')
            }}
          >
            以最新版本继续核对
          </button>
        </div>
      ) : null}
      <div className="wf-rule-layout">
        <div>
          {versions.length ? (
            <div className="wf-rule-list">
              {versions.map((rule) => (
                <details key={rule.id}>
                  <summary>
                    v{rule.version} · {rule.name}
                  </summary>
                  <p className="mc-muted">{displayDate(rule.publishedAt)}</p>
                  <pre className="wf-json-view">{JSON.stringify(rule.rules, null, 2)}</pre>
                  <button
                    type="button"
                    disabled={command.locked || !canPublish}
                    onClick={() => {
                      setJsonText(JSON.stringify(rule.rules, null, 2))
                      setName(`${rule.name}（修订）`)
                      setError('')
                      setConfirmed(false)
                    }}
                  >
                    以此版为基础编辑
                  </button>
                </details>
              ))}
            </div>
          ) : (
            <p className="mc-muted">当前赛事暂无已发布规程。请填写经赛事负责人确认的规则。</p>
          )}
          <details className="wf-rule-help">
            <summary>规则字段说明</summary>
            <p>
              roster：minPlayers、maxPlayers、带时区的 submissionDeadline、稳定球员 ID 数组
              eligiblePlayerIds；八人制 playersOnPitch 为 8，省略时服务器保存为 8。
            </p>
            <p>
              results：points（win/draw/loss）、tieBreakers、headToHead、groupShootout、knockoutShootout、forfeit（含
              both）。
            </p>
            <p>
              progression：sourceStageId 与 slots；目标比赛、分组和来源比赛使用当前赛事的稳定
              ID。未配置晋级规则时，服务器会阻止晋级预览。
            </p>
            <p>
              修改规程可能使现有名单需重新确认，或使旧确认报告与新规程不匹配。发布前核对所有受影响比赛；禁止仅用
              summary 代替业务规则。
            </p>
          </details>
        </div>
        <div className="mc-form">
          <div className="wf-player-grid">
            <label className="mc-field">
              新版本号
              <input
                inputMode="numeric"
                maxLength={3}
                disabled={command.locked || !canPublish}
                value={version}
                aria-label="新版本号"
                onChange={(event) => {
                  setVersion(event.target.value)
                  setConfirmed(false)
                }}
              />
            </label>
            <label className="mc-field">
              规程名称
              <input
                maxLength={120}
                disabled={command.locked || !canPublish}
                value={name}
                aria-label="规程名称"
                onChange={(event) => {
                  setName(event.target.value)
                  setConfirmed(false)
                }}
              />
            </label>
          </div>
          <label className="mc-field">
            完整规则 JSON
            <textarea
              className="wf-json-editor"
              rows={18}
              spellCheck={false}
              disabled={command.locked || !canPublish}
              value={jsonText}
              aria-label="完整规则 JSON"
              onChange={(event) => {
                setJsonText(event.target.value)
                setConfirmed(false)
              }}
            />
          </label>
          <label className="mc-field">
            发布原因
            <textarea
              maxLength={500}
              disabled={command.locked || !canPublish}
              value={publishReason}
              aria-label="发布原因"
              onChange={(event) => {
                setPublishReason(event.target.value)
                setConfirmed(false)
              }}
              placeholder="说明本次规则修改、确认依据和受影响范围"
            />
          </label>
          {error ? (
            <p className="mc-alert" role="alert">
              {error}
            </p>
          ) : null}
          <div className="mc-actions">
            <button
              type="button"
              className="secondary-button"
              disabled={command.locked || !canPublish}
              onClick={() => {
                const parsed = validate()
                if (parsed) {
                  setJsonText(JSON.stringify(parsed, null, 2))
                  setError('结构检查通过，请继续核对赛事规则与全部稳定 ID。')
                }
              }}
            >
              检查并格式化
            </button>
            <button
              type="button"
              disabled={command.locked || !canPublish || versionChanged || !publishReason.trim()}
              onClick={() => {
                if (validate()) setConfirmed(true)
              }}
            >
              发布新规程版本
            </button>
          </div>
          {confirmed && !versionChanged ? (
            <div className="mc-alert" role="alertdialog" aria-label="确认发布规程">
              <p>
                确认发布「{name}」v{version}
                ？请确认资格名单、期限、计分和晋级安排已经由赛事负责人审核。新规则会影响后续审核与结果计算。
              </p>
              <div className="mc-actions">
                <button type="button" disabled={command.locked || !canPublish} onClick={publish}>
                  确认发布
                </button>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => setConfirmed(false)}
                >
                  取消
                </button>
              </div>
            </div>
          ) : null}
          <CommandStatus command={command} />
        </div>
      </div>
    </section>
  )
}
