import { useEffect, useId, useState } from 'react'
import { createPortal } from 'react-dom'
import { useOverlayFocus } from '../overlay-focus'
import { TeamCrest } from '../product-ui'
import type { TeamSummary } from '../../features/product/product.types'
import { TeamIcon } from './icons.h5'

export const JOIN_POSITIONS = [
  { id: 'FORWARD', label: '前锋', code: 'FW', hint: '进攻与射门' },
  { id: 'MIDFIELDER', label: '中场', code: 'MF', hint: '组织与衔接' },
  { id: 'DEFENDER', label: '后卫', code: 'DF', hint: '防守与出球' },
  { id: 'GOALKEEPER', label: '门将', code: 'GK', hint: '守门与指挥' },
] as const

/** Site-style dialog for a team application: position picker + note, submit / cancel. */
export function JoinTeamDialog({
  team,
  busy,
  error,
  onCancel,
  onSubmit,
}: {
  team: Pick<TeamSummary, 'id' | 'name'> & Partial<TeamSummary>
  busy: boolean
  error: string
  onCancel: () => void
  onSubmit: (position: string, message: string) => void
}) {
  const id = `th-join-${useId().replace(/:/g, '')}`
  const [position, setPosition] = useState<string>('MIDFIELDER')
  const [message, setMessage] = useState('')
  useOverlayFocus(true, `#${id}`, () => {
    if (!busy) onCancel()
  })
  useEffect(() => {
    // After useOverlayFocus has focused the first control, start on the selected position.
    const timer = window.setTimeout(
      () => document.getElementById(id)?.querySelector<HTMLElement>('[aria-checked="true"]')?.focus(),
      30,
    )
    return () => window.clearTimeout(timer)
  }, [id])
  return createPortal(
    <div
      className="th-join-scrim"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onCancel()
      }}
    >
      <section
        id={id}
        className="th-join-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${id}-title`}
      >
        <header className="th-join-dialog__header">
          <TeamCrest team={team as TeamSummary} size="medium" />
          <div>
            <small>入队申请</small>
            <h2 id={`${id}-title`}>申请加入{team.name}</h2>
          </div>
          <button
            data-team-control
            type="button"
            className="th-join-dialog__close"
            aria-label="关闭入队申请"
            disabled={busy}
            onClick={onCancel}
          >
            <TeamIcon name="close" />
          </button>
        </header>
        <div className="th-join-dialog__body">
          <fieldset className="th-join-positions">
            <legend>场上位置</legend>
            <div role="radiogroup" aria-label="场上位置">
              {JOIN_POSITIONS.map((item, index) => (
                <button
                  data-team-control
                  key={item.id}
                  type="button"
                  role="radio"
                  aria-checked={position === item.id}
                  tabIndex={position === item.id ? 0 : -1}
                  className={`th-join-position${position === item.id ? ' is-selected' : ''}`}
                  disabled={busy}
                  onClick={() => setPosition(item.id)}
                  onKeyDown={(event) => {
                    const step =
                      event.key === 'ArrowRight' || event.key === 'ArrowDown'
                        ? 1
                        : event.key === 'ArrowLeft' || event.key === 'ArrowUp'
                          ? -1
                          : 0
                    if (!step) return
                    event.preventDefault()
                    const next =
                      JOIN_POSITIONS[(index + step + JOIN_POSITIONS.length) % JOIN_POSITIONS.length]!
                    setPosition(next.id)
                    const group = event.currentTarget.parentElement
                    window.requestAnimationFrame(() =>
                      group?.querySelector<HTMLElement>('[aria-checked="true"]')?.focus(),
                    )
                  }}
                >
                  <b>{item.code}</b>
                  <strong>{item.label}</strong>
                  <small>{item.hint}</small>
                </button>
              ))}
            </div>
          </fieldset>
          <label className="th-join-note">
            <span>
              申请说明<em>选填</em>
            </span>
            <textarea
              data-team-control
              className="th-join-note__field"
              maxLength={500}
              rows={4}
              value={message}
              disabled={busy}
              placeholder="介绍一下自己，比如常踢的位置、可以参加训练的时间"
              onChange={(event) => setMessage(event.target.value)}
            />
            <small>{message.length}/500</small>
          </label>
          <p className="th-join-dialog__hint">提交后由球队负责人审核，结果会通过消息通知你。</p>
          {error ? (
            <p className="th-join-dialog__error" role="alert">
              {error}
            </p>
          ) : null}
        </div>
        <footer className="th-join-dialog__footer">
          <button
            data-team-control
            type="button"
            className="th-outline-button th-join-dialog__action"
            disabled={busy}
            onClick={onCancel}
          >
            取消
          </button>
          <button
            data-team-control
            type="button"
            className="th-primary-button th-join-dialog__action"
            disabled={busy}
            onClick={() => onSubmit(position, message.trim())}
          >
            {busy ? '提交中…' : '提交申请'}
          </button>
        </footer>
      </section>
    </div>,
    document.body,
  )
}
