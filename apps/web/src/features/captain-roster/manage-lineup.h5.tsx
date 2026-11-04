import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import Taro from '@tarojs/taro'
import { PlayerAvatar } from '../../components/player-avatar.h5'
import { createClientActionId } from '../product/product.repository'
import { positionLabel } from '../product/product.format'
import {
  FORMATIONS,
  assignPlayer,
  clearStarters,
  createFormation,
  fillByPosition,
  groupLineupPlayers,
  moveSlot,
  restoreDraft,
  selectSavedLineupPlan,
  type LineupDraft,
  type LineupPlayer,
  type LineupSlot,
} from './lineup.logic'
import { lineupPlanRepository, type LineupPlanView } from './lineup-plan.repository'
import { Icon } from './manage-icons.h5'

const FORMATION_ORDER = ['3-2-2', '3-3-1', '2-3-2', '2-4-1', '3-1-3', '2-2-3', '4-2-1']
const CUSTOM = '__custom__'
const DEFAULT_NAME = '球队主阵容'

type DropZone = 'bench' | 'unassigned'
interface DragState {
  playerId: string | null
  slotId: string | null
  startX: number
  startY: number
  moved: boolean
}

/** Landscape mapping: our goal on the left, attacking right. */
const slotLeft = (slot: LineupSlot) => 100 - slot.y
const slotTop = (slot: LineupSlot) => slot.x

export function ManageLineupSection({
  teamId,
  tournamentId,
  players,
  poolLabel,
  toolbarTarget,
}: {
  teamId: string
  tournamentId: string
  players: LineupPlayer[]
  poolLabel: string
  toolbarTarget?: (toolbar: React.ReactNode) => React.ReactNode
}) {
  const [draft, setDraft] = useState<LineupDraft>(() => createFormation('3-2-2'))
  const [past, setPast] = useState<LineupDraft[]>([])
  const [future, setFuture] = useState<LineupDraft[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [plans, setPlans] = useState<LineupPlanView[]>([])
  const [plan, setPlan] = useState<LineupPlanView | null>(null)
  const [planName, setPlanName] = useState(DEFAULT_NAME)
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ tone: 'error' | 'ok'; text: string } | null>(null)
  const [moreOpen, setMoreOpen] = useState(false)
  const [ghost, setGhost] = useState<{
    x: number
    y: number
    player: LineupPlayer | null
    label: string
  } | null>(null)
  const [hoverSlot, setHoverSlot] = useState<string | null>(null)
  const [hoverZone, setHoverZone] = useState<DropZone | null>(null)
  const pitchRef = useRef<HTMLDivElement | null>(null)
  const moreRef = useRef<HTMLDivElement | null>(null)
  const drag = useRef<DragState | null>(null)
  const draftRef = useRef(draft)
  draftRef.current = draft
  const selectedRef = useRef(selected)
  selectedRef.current = selected

  const byId = useMemo(() => new Map(players.map((player) => [player.id, player])), [players])
  const groups = groupLineupPlayers(draft, players)
  // No separate 未安排: every player who is not on the pitch is a substitute.
  const bench = [...groups.substitutes, ...groups.unselected]
  const restorePlan = useCallback(
    (target: LineupPlanView) => {
      const restored = restoreDraft(
        {
          schemaVersion: 1,
          formation: target.payload.formation,
          name: target.name,
          custom: !FORMATIONS.some((item) => item.name === target.payload.formation),
          slots: target.payload.slots.map((slot) => ({ ...slot, id: slot.slotId })),
          benchPlayerIds: target.payload.benchPlayerIds,
        },
        players,
      )
      if (!restored) return false
      setDraft(restored)
      setPlan(target)
      setPlanName(target.name)
      setPast([])
      setFuture([])
      setDirty(false)
      return true
    },
    [players],
  )

  useEffect(() => {
    let alive = true
    lineupPlanRepository
      .list(teamId)
      .then((result) => {
        if (!alive) return
        const tactics = result.items.filter((item) => item.kind === 'TACTIC')
        setPlans(tactics)
        const preferred = selectSavedLineupPlan(tactics, tournamentId, '')
        if (preferred) restorePlan(preferred)
      })
      .catch(() => undefined)
    return () => {
      alive = false
    }
  }, [teamId, tournamentId, restorePlan])

  useEffect(() => {
    if (!moreOpen) return
    const close = (event: MouseEvent) => {
      if (moreRef.current && !moreRef.current.contains(event.target as Node)) setMoreOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [moreOpen])

  const commit = useCallback((next: LineupDraft) => {
    const current = draftRef.current
    if (next === current) return
    setPast((items) => [...items.slice(-39), current])
    setFuture([])
    setDraft(next)
    setDirty(true)
    setMessage(null)
  }, [])

  const undo = () => {
    const previous = past[past.length - 1]
    if (!previous) return
    setPast(past.slice(0, -1))
    setFuture([draft, ...future])
    setDraft(previous)
    setDirty(true)
  }
  const redo = () => {
    const next = future[0]
    if (!next) return
    setFuture(future.slice(1))
    setPast([...past, draft])
    setDraft(next)
    setDirty(true)
  }

  const changeFormation = (value: string) => {
    if (value === CUSTOM) {
      commit({ ...draft, custom: true })
      setMessage({ tone: 'ok', text: '自定义模式：拖动场上位置即可调整站位' })
      return
    }
    commit(createFormation(value, draft))
  }

  const toZone = (current: LineupDraft, playerId: string, zone: DropZone) => {
    const benched = assignPlayer(current, playerId, null)
    return zone === 'bench'
      ? benched
      : {
          ...benched,
          benchPlayerIds: (benched.benchPlayerIds ?? []).filter((id) => id !== playerId),
        }
  }

  const nearestSlot = (clientX: number, clientY: number) => {
    const pitch = pitchRef.current
    if (!pitch) return null
    const rect = pitch.getBoundingClientRect()
    if (
      clientX < rect.left - 24 ||
      clientX > rect.right + 24 ||
      clientY < rect.top - 24 ||
      clientY > rect.bottom + 24
    )
      return null
    const threshold = Math.max(48, rect.width * 0.1)
    let best: { slot: LineupSlot; distance: number } | null = null
    for (const slot of draftRef.current.slots) {
      const cx = rect.left + (slotLeft(slot) / 100) * rect.width
      const cy = rect.top + (slotTop(slot) / 100) * rect.height
      const distance = Math.hypot(clientX - cx, clientY - cy)
      if (distance <= threshold && (!best || distance < best.distance)) best = { slot, distance }
    }
    return { rect, slot: best?.slot ?? null }
  }

  const zoneAt = (clientX: number, clientY: number): DropZone | null => {
    const element = document.elementFromPoint(clientX, clientY)
    const zone = element?.closest('[data-drop-zone]')?.getAttribute('data-drop-zone')
    return zone === 'bench' || zone === 'unassigned' ? zone : null
  }

  const beginDrag = (
    event: React.PointerEvent,
    source: { playerId: string | null; slotId: string | null },
  ) => {
    if (event.button !== 0) return
    // Stop native image drag / text selection, which would fire pointercancel mid-drag.
    event.preventDefault()
    drag.current = { ...source, startX: event.clientX, startY: event.clientY, moved: false }
    const onMove = (move: PointerEvent) => {
      const state = drag.current
      if (!state) return
      if (!state.moved && Math.hypot(move.clientX - state.startX, move.clientY - state.startY) < 5)
        return
      state.moved = true
      const slot = state.slotId
        ? draftRef.current.slots.find((item) => item.id === state.slotId)
        : null
      const player = state.playerId ? (byId.get(state.playerId) ?? null) : null
      setGhost({ x: move.clientX, y: move.clientY, player, label: slot?.label ?? '' })
      const custom = draftRef.current.custom && state.slotId
      const hit = custom ? null : nearestSlot(move.clientX, move.clientY)
      setHoverSlot(hit?.slot?.id ?? null)
      setHoverZone(state.playerId ? zoneAt(move.clientX, move.clientY) : null)
    }
    const onUp = (up: PointerEvent) => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
      const state = drag.current
      drag.current = null
      setGhost(null)
      setHoverSlot(null)
      setHoverZone(null)
      if (!state || up.type === 'pointercancel') return
      if (!state.moved) {
        handleClick(state)
        return
      }
      const current = draftRef.current
      if (current.custom && state.slotId) {
        const pitch = pitchRef.current?.getBoundingClientRect()
        if (
          pitch &&
          up.clientX >= pitch.left &&
          up.clientX <= pitch.right &&
          up.clientY >= pitch.top &&
          up.clientY <= pitch.bottom
        ) {
          const left = ((up.clientX - pitch.left) / pitch.width) * 100
          const top = ((up.clientY - pitch.top) / pitch.height) * 100
          commit(moveSlot(current, state.slotId, top, 100 - left))
          return
        }
      }
      if (!state.playerId) return
      const hit = nearestSlot(up.clientX, up.clientY)
      if (hit?.slot) {
        commit(assignPlayer(current, state.playerId, hit.slot.id))
        setSelected(null)
        return
      }
      const zone = zoneAt(up.clientX, up.clientY)
      if (zone) commit(toZone(current, state.playerId, zone))
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
  }

  const handleClick = (state: DragState) => {
    const current = draftRef.current
    const picked = selectedRef.current
    if (state.slotId) {
      if (picked && picked !== state.playerId) {
        commit(assignPlayer(current, picked, state.slotId))
        setSelected(null)
        return
      }
      setSelected(state.playerId && picked !== state.playerId ? state.playerId : null)
      return
    }
    if (state.playerId) setSelected(picked === state.playerId ? null : state.playerId)
  }

  const save = async () => {
    if (saving) return
    const name = planName.trim() || DEFAULT_NAME
    setSaving(true)
    setMessage(null)
    try {
      const saved = await lineupPlanRepository.save(
        teamId,
        {
          ...(plan ? { planId: plan.id } : {}),
          name,
          kind: 'TACTIC',
          expectedVersion: plan?.version ?? 0,
          tournamentId: plan ? plan.tournamentId : null,
          matchId: null,
          rosterSnapshotId: null,
          payload: {
            formation: draft.formation,
            format: 8,
            slots: draft.slots.map((slot) => ({
              slotId: slot.id,
              label: slot.label,
              x: slot.x,
              y: slot.y,
              playerId: slot.playerId,
            })),
            benchPlayerIds: bench.map((player) => player.id),
          },
        },
        createClientActionId('lineup'),
      )
      setPlan(saved)
      setPlanName(saved.name)
      setPlans((items) => [saved, ...items.filter((item) => item.id !== saved.id)])
      setDirty(false)
      void Taro.showToast({ title: '阵容已保存', icon: 'success' })
    } catch (issue) {
      setMessage({ tone: 'error', text: issue instanceof Error ? issue.message : '保存失败' })
    } finally {
      setSaving(false)
    }
  }

  const setDefault = async () => {
    if (!plan || dirty) {
      setMessage({ tone: 'error', text: '请先保存当前阵容' })
      return
    }
    try {
      const saved = await lineupPlanRepository.publish(
        teamId,
        plan.id,
        'DEFAULT',
        plan.version,
        createClientActionId('lineup-default'),
      )
      setPlan(saved)
      setPlans((items) =>
        items.map((item) => (item.id === saved.id ? saved : { ...item, isDefault: false })),
      )
      setMoreOpen(false)
      void Taro.showToast({ title: '已设为默认', icon: 'success' })
    } catch (issue) {
      setMessage({ tone: 'error', text: issue instanceof Error ? issue.message : '设置失败' })
    }
  }

  const switchPlan = async (id: string) => {
    if (dirty) {
      const answer = await Taro.showModal({
        title: '切换方案',
        content: '当前改动尚未保存，切换后会丢失。',
        confirmText: '切换',
      })
      if (!answer.confirm) return
    }
    if (!id) {
      setPlan(null)
      setPlanName(`新方案 ${plans.length + 1}`)
      setDirty(true)
      return
    }
    const target = plans.find((item) => item.id === id)
    if (target && !restorePlan(target)) setMessage({ tone: 'error', text: '该方案无法读取' })
  }

  const formationValue = draft.custom ? CUSTOM : draft.formation
  const starters = draft.slots.filter((slot) => slot.playerId).length

  const toolbar = (
    <div className="cmx-toolbar" role="toolbar" aria-label="阵容工具">
      <label className="cmx-select cmx-select--sm" title="阵型">
        <span className="cmx-select__prefix">阵型</span>
        <select
          value={formationValue}
          aria-label="阵型"
          onChange={(event) => changeFormation(event.target.value)}
        >
          {FORMATION_ORDER.filter((name) => FORMATIONS.some((item) => item.name === name)).map(
            (name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ),
          )}
          <option value={CUSTOM}>自定义</option>
        </select>
        <Icon name="chevron" size={12} />
      </label>
      <span className="cmx-toolbar__divider" />
      <button
        type="button"
        className="cmx-btn cmx-btn--icon"
        title="撤销"
        aria-label="撤销"
        disabled={!past.length}
        onClick={undo}
      >
        <Icon name="undo" />
      </button>
      <button
        type="button"
        className="cmx-btn cmx-btn--icon"
        title="重做"
        aria-label="重做"
        disabled={!future.length}
        onClick={redo}
      >
        <Icon name="redo" />
      </button>
      <button
        type="button"
        className="cmx-btn cmx-btn--ghost cmx-btn--sm"
        title="把首发全部移到替补"
        disabled={!starters}
        onClick={() => commit(clearStarters(draft))}
      >
        <Icon name="eraser" size={14} />
        清空
      </button>
      <div className="cmx-more" ref={moreRef}>
        <button
          type="button"
          className={`cmx-btn cmx-btn--ghost cmx-btn--sm ${moreOpen ? 'is-active' : ''}`}
          aria-haspopup="true"
          aria-expanded={moreOpen}
          onClick={() => setMoreOpen((open) => !open)}
        >
          更多
          <Icon name="chevron" size={12} />
        </button>
        {moreOpen ? (
          <div className="cmx-menu" role="menu">
            <label className="cmx-field">
              <span>阵容方案</span>
              <span className="cmx-select">
                <select
                  value={plan?.id ?? ''}
                  onChange={(event) => void switchPlan(event.target.value)}
                >
                  {plans.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                      {item.isDefault ? '（默认）' : ''}
                    </option>
                  ))}
                  <option value="">+ 新建方案</option>
                </select>
                <Icon name="chevron" size={12} />
              </span>
            </label>
            <label className="cmx-field">
              <span>方案名称</span>
              <input
                className="cmx-input cmx-input--sm"
                value={planName}
                maxLength={32}
                onChange={(event) => {
                  setPlanName(event.target.value)
                  setDirty(true)
                }}
              />
            </label>
            <button
              type="button"
              className="cmx-menu__item"
              role="menuitem"
              onClick={() => {
                commit(
                  fillByPosition(
                    draft,
                    groups.substitutes.length
                      ? [...groups.substitutes, ...groups.unselected]
                      : players,
                  ),
                )
                setMoreOpen(false)
              }}
            >
              按位置自动补齐首发
            </button>
            <button
              type="button"
              className="cmx-menu__item"
              role="menuitem"
              disabled={!plan || plan.isDefault}
              onClick={() => void setDefault()}
            >
              {plan?.isDefault ? '已是球队默认阵容' : '设为球队默认阵容'}
            </button>
          </div>
        ) : null}
      </div>
      <button
        type="button"
        className="cmx-btn cmx-btn--primary cmx-btn--sm"
        disabled={saving || (!dirty && Boolean(plan))}
        onClick={() => void save()}
      >
        <Icon name="save" size={14} />
        {saving ? '保存中…' : dirty || !plan ? '保存' : '已保存'}
      </button>
    </div>
  )

  return (
    <>
      {toolbarTarget ? toolbarTarget(toolbar) : toolbar}
      <div className="cmx-lineup">
        <div className="cmx-lineup__stage">
          <div className="cmx-lineup__fit">
            <div
              className={`cmx-pitch ${draft.custom ? 'is-custom' : ''} ${ghost ? 'is-dragging' : ''}`}
              ref={pitchRef}
            >
              <PitchMarkings />
              <span className="cmx-pitch__title">首发阵容</span>
              <span className="cmx-pitch__direction">进攻方向 →</span>
              {draft.slots.map((slot) => {
                const player = slot.playerId ? byId.get(slot.playerId) : undefined
                return (
                  <button
                    type="button"
                    key={slot.id}
                    className={`cmx-slot ${player ? 'is-filled' : ''} ${hoverSlot === slot.id ? 'is-target' : ''} ${selected && player?.id === selected ? 'is-selected' : ''} ${selected && !player ? 'is-ready' : ''}`}
                    style={{ left: `${slotLeft(slot)}%`, top: `${slotTop(slot)}%` }}
                    aria-label={
                      player ? `${slot.label}：${player.displayName}` : `${slot.label} 空位`
                    }
                    onPointerDown={(event) =>
                      beginDrag(event, { playerId: player?.id ?? null, slotId: slot.id })
                    }
                  >
                    {player ? (
                      <>
                        <span className="cmx-slot__avatar">
                          <PlayerAvatar
                            name={player.displayName}
                            avatarUrl={player.avatarUrl}
                            size="small"
                          />
                          {player.shirtNumber ? <em>{player.shirtNumber}</em> : null}
                        </span>
                        <span className="cmx-slot__name">{player.displayName}</span>
                      </>
                    ) : (
                      <span className="cmx-slot__ring">{slot.label}</span>
                    )}
                  </button>
                )
              })}
            </div>
          </div>
          <div className="cmx-lineup__status">
            <span>
              {draft.custom ? '自定义' : draft.formation} · 首发 {starters}/8 · 替补 {bench.length}
            </span>
            {message ? (
              <span
                className={`cmx-lineup__msg is-${message.tone}`}
                role={message.tone === 'error' ? 'alert' : 'status'}
              >
                {message.text}
              </span>
            ) : (
              <span className="cmx-muted">
                {selected ? '再点一个位置即可放入' : '拖动球员到场上位置'}
              </span>
            )}
          </div>
        </div>
        <aside className="cmx-lineup__panel" aria-label="替补">
          <div className="cmx-lineup__panel-head">
            <strong>
              替补 <em className="cmx-lineup__bench-count">{bench.length}</em>
            </strong>
            <span title="大名单审核通过后，这里的球员会同步更新">{poolLabel}</span>
          </div>
          <div className="cmx-lineup__groups">
            {/* Everyone not on the pitch is a substitute; drop a starter here to bench him. */}
            <ChipGroup
              title="替补"
              count={bench.length}
              empty="全部球员都已上场"
              zone="bench"
              active={hoverZone === 'bench'}
            >
              {bench.map((player) => (
                <PlayerChip
                  key={player.id}
                  player={player}
                  selected={selected === player.id}
                  onPointerDown={(event) => beginDrag(event, { playerId: player.id, slotId: null })}
                />
              ))}
            </ChipGroup>
          </div>
        </aside>
      </div>
      {ghost
        ? createPortal(
            <div
              className="cmx-ghost"
              style={{ transform: `translate(${ghost.x}px, ${ghost.y}px)` }}
              aria-hidden="true"
            >
              {ghost.player ? (
                <>
                  <PlayerAvatar
                    name={ghost.player.displayName}
                    avatarUrl={ghost.player.avatarUrl}
                    size="small"
                  />
                  <span>{ghost.player.displayName}</span>
                </>
              ) : (
                <span>{ghost.label}</span>
              )}
            </div>,
            document.body,
          )
        : null}
    </>
  )
}

function ChipGroup({
  title,
  count,
  empty,
  zone,
  active,
  children,
}: {
  title: string
  count: number
  empty: string
  zone?: DropZone
  active?: boolean
  children: React.ReactNode
}) {
  return (
    <section
      className={`cmx-chip-group ${active ? 'is-drop' : ''}`}
      {...(zone ? { 'data-drop-zone': zone } : {})}
    >
      <h5>
        {title}
        <span>{count}</span>
      </h5>
      {count ? (
        <div className="cmx-chip-grid">{children}</div>
      ) : (
        <p className="cmx-chip-empty">{empty}</p>
      )}
    </section>
  )
}

function PlayerChip({
  player,
  badge,
  selected,
  onPointerDown,
}: {
  player: LineupPlayer
  badge?: string
  selected: boolean
  onPointerDown: (event: React.PointerEvent) => void
}) {
  return (
    <button
      type="button"
      className={`cmx-chip ${selected ? 'is-selected' : ''}`}
      onPointerDown={onPointerDown}
      aria-pressed={selected}
      title={`${player.displayName} · ${positionLabel(player.position)}`}
    >
      <PlayerAvatar name={player.displayName} avatarUrl={player.avatarUrl} size="small" />
      <span className="cmx-chip__text">
        <strong>{player.displayName}</strong>
        <small>
          {player.shirtNumber ? `${player.shirtNumber}号 · ` : ''}
          {positionLabel(player.position)}
        </small>
      </span>
      {badge ? <em className="cmx-chip__badge">{badge}</em> : null}
    </button>
  )
}

function PitchMarkings() {
  return (
    <svg
      className="cmx-pitch__lines"
      viewBox="0 0 105 68"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <g fill="none" stroke="rgba(255,255,255,0.72)" strokeWidth="0.45">
        <rect x="1.5" y="1.5" width="102" height="65" rx="0.6" />
        <line x1="52.5" y1="1.5" x2="52.5" y2="66.5" />
        <circle cx="52.5" cy="34" r="9.15" />
        <rect x="1.5" y="13.85" width="16.5" height="40.3" />
        <rect x="1.5" y="24.85" width="5.5" height="18.3" />
        <rect x="87" y="13.85" width="16.5" height="40.3" />
        <rect x="98" y="24.85" width="5.5" height="18.3" />
        <path d="M18 26.7 A9.15 9.15 0 0 1 18 41.3" />
        <path d="M87 26.7 A9.15 9.15 0 0 0 87 41.3" />
      </g>
      <g fill="rgba(255,255,255,0.8)">
        <circle cx="52.5" cy="34" r="0.6" />
        <circle cx="12.5" cy="34" r="0.5" />
        <circle cx="92.5" cy="34" r="0.5" />
      </g>
    </svg>
  )
}
