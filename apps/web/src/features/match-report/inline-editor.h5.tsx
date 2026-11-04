import { useId, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useOverlayFocus } from '../../components/overlay-focus/index.h5'
import { MatchIcon } from '../readonly-match/match-icons.h5'
import type { InlineReportController } from './use-inline-report.h5'
import { inlineEventCount } from './inline.logic'
import type { EventKind, Side } from './types'
import './inline-editor.h5.scss'

const COUNTERS: EventKind[] = ['YELLOW_CARD', 'RED_CARD', 'SUBSTITUTION']
export function InlineEventEditor({ editor }: { editor: InlineReportController }) {
  const workspace = editor.workspace!
  return (
    <section className="inline-match-editor" aria-label="编辑比赛事件">
      <div className="inline-match-counters">
        {(['HOME', 'AWAY'] as Side[]).map((side) => (
          <div className="inline-match-counters__team" key={side}>
            <strong>{side === 'HOME' ? workspace.homeTeam.name : workspace.awayTeam.name}</strong>
            <div>
              {COUNTERS.map((kind) => (
                <label className="inline-match-counter" key={kind}>
                  <MatchIcon kind={kind} />
                  <input
                    type="number"
                    min="0"
                    max="99"
                    aria-label={`${side === 'HOME' ? '主队' : '客队'}${kind === 'YELLOW_CARD' ? '黄牌' : kind === 'RED_CARD' ? '红牌' : '换人'}数量`}
                    value={inlineEventCount(editor.fields, kind, side)}
                    disabled={editor.locked}
                    onChange={(event) => editor.count(kind, side, Number(event.target.value))}
                  />
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>
      <ol className="inline-match-events">
        {editor.displayEvents.map((event) => {
          const team = event.side === 'HOME' ? workspace.homeTeam : workspace.awayTeam
          return (
            <li
              className="inline-match-event"
              key={event.id}
              data-side={event.side}
              data-event-id={event.id}
            >
              <div className="inline-match-event__clock">
                <input
                  type="number"
                  min="0"
                  max="120"
                  placeholder="分钟"
                  aria-label="事件分钟"
                  value={event.minute}
                  disabled={editor.locked}
                  onChange={(input) => editor.patch(event.id, { minute: input.target.value })}
                />
                <span>+</span>
                <input
                  type="number"
                  min="0"
                  max="30"
                  placeholder="0"
                  aria-label="补时分钟"
                  value={event.addedMinute}
                  disabled={editor.locked}
                  onChange={(input) => editor.patch(event.id, { addedMinute: input.target.value })}
                />
                <span>′</span>
              </div>
              <MatchIcon kind={event.kind} />
              <span className="inline-match-event__side" title={team.name}>
                {event.side === 'HOME' ? '主' : '客'}
              </span>
              <select
                className="inline-match-event__player"
                aria-label={event.kind === 'SUBSTITUTION' ? '换下球员' : '事件球员'}
                value={event.playerId}
                disabled={editor.locked}
                onChange={(input) => editor.patch(event.id, { playerId: input.target.value })}
              >
                <option value="">{event.kind === 'SUBSTITUTION' ? '换下球员' : '选择球员'}</option>
                {team.players.map((player) => (
                  <option key={player.id} value={player.id}>
                    {player.shirtNumber ?? '—'} · {player.displayName}
                  </option>
                ))}
              </select>
              {event.kind === 'GOAL' || event.kind === 'SUBSTITUTION' ? (
                <>
                  <MatchIcon kind={event.kind === 'SUBSTITUTION' ? 'ON' : 'ASSIST'} />
                  <select
                    className="inline-match-event__player"
                    aria-label={event.kind === 'SUBSTITUTION' ? '换上球员' : '助攻球员'}
                    value={event.relatedPlayerId}
                    disabled={editor.locked}
                    onChange={(input) =>
                      editor.patch(event.id, { relatedPlayerId: input.target.value })
                    }
                  >
                    <option value="">
                      {event.kind === 'SUBSTITUTION' ? '换上球员' : '助攻（可选）'}
                    </option>
                    {team.players
                      .filter((player) => player.id !== event.playerId)
                      .map((player) => (
                        <option key={player.id} value={player.id}>
                          {player.shirtNumber ?? '—'} · {player.displayName}
                        </option>
                      ))}
                  </select>
                </>
              ) : null}
              <button
                type="button"
                className="inline-match-event__done"
                disabled={editor.locked}
                aria-label="完成本条事件"
                onClick={() => editor.completeEvent(event.id)}
              >
                完成
              </button>
            </li>
          )
        })}
      </ol>
      {workspace.isKnockout && editor.fields.homeScore === editor.fields.awayScore ? (
        <div className="inline-match-penalties">
          <span>点球</span>
          <input
            type="number"
            min="0"
            max="99"
            aria-label="主队点球比分"
            value={editor.fields.homePenaltyScore}
            disabled={editor.locked}
            onChange={(event) => editor.penalty('HOME', event.target.value)}
          />
          <span>:</span>
          <input
            type="number"
            min="0"
            max="99"
            aria-label="客队点球比分"
            value={editor.fields.awayPenaltyScore}
            disabled={editor.locked}
            onChange={(event) => editor.penalty('AWAY', event.target.value)}
          />
        </div>
      ) : null}
      {editor.error && (
        <p className="inline-match-error" role="alert">
          {editor.error}
        </p>
      )}
      <button
        type="button"
        className="inline-match-finish"
        disabled={editor.busy}
        aria-busy={editor.busy}
        onClick={() => void editor.finish()}
      >
        {editor.busy ? '正在保存…' : '保存记录'}
      </button>
      {editor.confirmingScore && (
        <InlineDialog
          title="事件细节尚未填完"
          onClose={editor.busy ? () => undefined : editor.cancelScore}
        >
          <p className="inline-match-dialog__copy">可以先保存比分，让其他编辑员继续补全事件。</p>
          {editor.error && (
            <p className="inline-match-error" role="alert">
              {editor.error}
            </p>
          )}
          <div className="inline-match-dialog__actions">
            <button type="button" disabled={editor.busy} onClick={editor.cancelScore}>
              继续填写
            </button>
            <button
              type="button"
              className="inline-match-dialog__primary"
              disabled={editor.busy}
              onClick={() => void editor.confirmScore()}
            >
              {editor.busy ? '正在保存…' : '先保存比分'}
            </button>
          </div>
        </InlineDialog>
      )}
    </section>
  )
}
export function MatchChangeRequest({ editor }: { editor: InlineReportController }) {
  const [reason, setReason] = useState('')
  if (!editor.requesting) return null
  return (
    <InlineDialog title="申请修改" onClose={editor.busy ? () => undefined : editor.closeRequest}>
      <form
        className="inline-match-request"
        onSubmit={(event) => {
          event.preventDefault()
          void editor.requestChange(reason)
        }}
      >
        <textarea
          id="match-change-reason"
          className="inline-match-request__reason"
          maxLength={240}
          value={reason}
          disabled={editor.busy}
          placeholder="需要修改哪些比分或事件？"
          onChange={(event) => setReason(event.target.value)}
        />
        <div>
          <button type="button" disabled={editor.busy} onClick={editor.closeRequest}>
            取消
          </button>
          <button type="submit" disabled={reason.trim().length < 2 || editor.busy}>
            {editor.busy ? '提交中…' : '提交申请'}
          </button>
        </div>
        {editor.error && (
          <p className="inline-match-error" role="alert">
            {editor.error}
          </p>
        )}
      </form>
    </InlineDialog>
  )
}

function InlineDialog({
  title,
  onClose,
  children,
}: {
  title: string
  onClose: () => void
  children: ReactNode
}) {
  const id = `inline-match-dialog-${useId().replace(/:/g, '')}`
  useOverlayFocus(true, `#${id}`, onClose)
  return createPortal(
    <div
      className="inline-match-dialog-scrim"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <section
        id={id}
        className="inline-match-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
      >
        <header>
          <h2>{title}</h2>
          <button type="button" aria-label={`关闭${title}`} onClick={onClose}>
            ×
          </button>
        </header>
        {children}
      </section>
    </div>,
    document.body,
  )
}
