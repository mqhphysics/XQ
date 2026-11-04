import { playerAvatarInitial, playerAvatarPhoto } from '../../components/player-avatar.logic.h5'
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import Taro from '@tarojs/taro'
import { readSession } from '../product/session'
import { resolveMediaUrl } from '../product/product.repository'
import { positionLabel } from '../product/product.format'
import { createClientActionId } from '../product/product.repository'
import { rosterRepository, RosterApiError } from './roster.repository'
import {
  lineupPlanRepository,
  type LineupPlanHistory,
  type LineupPlanView,
  type SaveLineupPlan,
} from './lineup-plan.repository'
import {
  assignPlayer,
  createFormation,
  clearStarters,
  draftStorageKey,
  fillByPosition,
  FORMATIONS,
  groupLineupPlayers,
  moveSlot,
  restoreDraft,
  selectSavedLineupPlan,
  type LineupDraft,
  type LineupPlayer,
} from './lineup.logic'
import type { LineupBoardProps } from './lineup-board'
import './lineup.scss'

interface DragState {
  pointerId: number
  playerId: string | null
  slotId: string | null
  originX: number
  originY: number
  moved: boolean
  element: HTMLElement
}

export default function LineupBoard({
  players: teamPlayers,
  lockedPlayers,
  matches,
  teamName,
  tournamentId,
  teamId,
  landscape = false,
  compact = false,
}: LineupBoardProps) {
  const slotStyle = (slot: { x: number; y: number }) =>
    landscape
      ? { left: `${100 - slot.y}%`, top: `${slot.x}%` }
      : { left: `${slot.x}%`, top: `${slot.y}%` }

  const session = readSession()
  const owner = useRef({ userId: session?.user.id, organizationId: session?.user.organizationId })
  const [ownerInvalid, setOwnerInvalid] = useState(false)
  const [kind, setKind] = useState<'TACTIC' | 'MATCH_LINEUP'>('TACTIC')
  const [tacticScope, setTacticScope] = useState<'TEAM' | 'TOURNAMENT'>('TEAM')
  const [matchId, setMatchId] = useState('')
  const [boundPlayers, setBoundPlayers] = useState<LineupPlayer[] | null>(null)
  const [boundSnapshotId, setBoundSnapshotId] = useState<string | null>(null)
  const [boundSnapshotVersion, setBoundSnapshotVersion] = useState<number | null>(null)
  const players = kind === 'MATCH_LINEUP' ? (boundPlayers ?? lockedPlayers) : teamPlayers
  const storageKey =
    owner.current.userId && owner.current.organizationId
      ? draftStorageKey(owner.current.organizationId, owner.current.userId, tournamentId, teamId)
      : ''
  const [draft, setDraft] = useState<LineupDraft>(() => {
    try {
      return restoreDraft(Taro.getStorageSync(storageKey), players) ?? createFormation('3-3-1')
    } catch {
      return createFormation('3-3-1')
    }
  })
  const [templates, setTemplates] = useState<LineupDraft[]>(() => {
    try {
      const saved: unknown = Taro.getStorageSync(`${storageKey}:templates`)
      return Array.isArray(saved)
        ? saved
            .flatMap((item) => {
              const template = restoreDraft(item, [])
              return template ? [template] : []
            })
            .slice(0, 12)
        : []
    } catch {
      return []
    }
  })
  const [selected, setSelected] = useState<string | null>(null)
  const [notice, setNotice] = useState('拖动球员到位置，或先选球员再点位置。')
  const [query, setQuery] = useState('')
  const [freeMove, setFreeMove] = useState(false)
  const [dirty, setDirty] = useState(false)
  const dirtyRef = useRef(dirty)
  dirtyRef.current = dirty
  const [history, setHistory] = useState<LineupDraft[]>([])
  const [future, setFuture] = useState<LineupDraft[]>([])
  const [plans, setPlans] = useState<LineupPlanView[]>([])
  const [cloudPlan, setCloudPlan] = useState<LineupPlanView | null>(null)
  const [cloudError, setCloudError] = useState('')
  const [cloudBusy, setCloudBusy] = useState(false)
  const [pendingPublication, setPendingPublication] = useState<{
    planId: string
    action: 'DEFAULT' | 'CONFIRM'
    expectedVersion: number
    key: string
  } | null>(null)
  const [cloudLoading, setCloudLoading] = useState(true)
  const [planHistory, setPlanHistory] = useState<LineupPlanHistory | null>(null)
  const [pendingSave, setPendingSave] = useState<{ input: SaveLineupPlan; key: string } | null>(
    null,
  )
  const sending = useRef(false)
  const initialPlanLoaded = useRef(false)
  const alive = useRef(true)
  const pitch = useRef<HTMLDivElement>(null)
  const ghost = useRef<HTMLDivElement>(null)
  const drag = useRef<DragState | null>(null)
  const suppressClick = useRef(false)
  const highlighted = useRef<HTMLElement | null>(null)
  const previousRects = useRef(new Map<string, DOMRect>())
  const playerMap = new Map(players.map((player) => [player.id, player]))
  const starters = new Set(draft.slots.flatMap((slot) => (slot.playerId ? [slot.playerId] : [])))
  const { substitutes, unselected: unassigned } = groupLineupPlayers(draft, players)
  const bench = substitutes.filter((player) =>
    `${player.displayName} ${player.shirtNumber ?? ''}`.includes(query.trim()),
  )
  const visibleUnassigned = unassigned.filter((player) =>
    `${player.displayName} ${player.shirtNumber ?? ''}`.includes(query.trim()),
  )
  const candidateIds = players.map((player) => player.id).join(',')
  useEffect(() => {
    const allowed = new Set(players.map((player) => player.id))
    if (
      !draft.slots.some((slot) => slot.playerId && !allowed.has(slot.playerId)) &&
      !draft.benchPlayerIds?.some((id) => !allowed.has(id))
    )
      return
    setHistory([])
    setFuture([])
    setSelected(null)
    setDirty(true)
    setNotice('候选名单已变化，不再符合条件的球员已移回空位，请重新核对。')
    setDraft((current) => ({
      ...current,
      slots: current.slots.map((slot) =>
        slot.playerId && !allowed.has(slot.playerId) ? { ...slot, playerId: null } : slot,
      ),
      benchPlayerIds: current.benchPlayerIds?.filter((id) => allowed.has(id)) ?? [],
    }))
  }, [candidateIds])

  const hasSameOwner = () => {
    const current = readSession()
    return Boolean(
      current &&
      current.user.id === owner.current.userId &&
      current.user.organizationId === owner.current.organizationId,
    )
  }
  useEffect(() => {
    const check = () => {
      if (!hasSameOwner()) {
        clearDrag()
        setOwnerInvalid(true)
      }
    }
    window.addEventListener('storage', check)
    window.addEventListener('focus', check)
    return () => {
      window.removeEventListener('storage', check)
      window.removeEventListener('focus', check)
    }
  }, [])
  const loadPlans = async () => {
    setCloudLoading(true)
    try {
      const result = await lineupPlanRepository.list(teamId)
      if (alive.current) {
        setPlans(result.items)
        setCloudPlan((current) =>
          current
            ? (result.items.find(
                (plan) => plan.id === current.id && plan.version === current.version,
              ) ?? current)
            : current,
        )
        setCloudError('')
        if (!initialPlanLoaded.current) {
          initialPlanLoaded.current = true
          let selectedPlanId = ''
          try {
            selectedPlanId = Taro.getStorageSync(`${storageKey}:cloud-plan`)
          } catch {
            /* Read from the server list below. */
          }
          const saved = selectSavedLineupPlan(
            result.items.filter(
              (plan) => plan.payload.format === 8 && plan.payload.slots.length === 8,
            ),
            tournamentId,
            selectedPlanId,
          )
          if (saved && !dirtyRef.current) await openPlan(saved.id, saved)
        }
      }
    } catch (error) {
      if (alive.current) setCloudError(error instanceof Error ? error.message : '云端战术加载失败')
    } finally {
      if (alive.current) setCloudLoading(false)
    }
  }
  useEffect(() => {
    alive.current = true
    void loadPlans()
    return () => {
      alive.current = false
    }
  }, [teamId])

  useLayoutEffect(() => {
    const next = new Map<string, DOMRect>()
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    pitch.current?.querySelectorAll<HTMLElement>('[data-lineup-key]').forEach((element) => {
      const key = element.dataset.lineupKey!
      const rect = element.getBoundingClientRect()
      const old = previousRects.current.get(key)
      next.set(key, rect)
      if (!reducedMotion && old && (Math.abs(old.x - rect.x) > 1 || Math.abs(old.y - rect.y) > 1)) {
        element.animate(
          [
            {
              transform: `translate(calc(-50% + ${old.x - rect.x}px), calc(-50% + ${old.y - rect.y}px))`,
            },
            { transform: 'translate(-50%, -50%)' },
          ],
          { duration: 180, easing: 'cubic-bezier(.23,1,.32,1)' },
        )
      }
    })
    previousRects.current = next
  }, [draft])

  const change = (next: LineupDraft, message?: string) => {
    if (cloudBusy || pendingSave || pendingPublication) {
      setNotice('上一次云端保存尚未确认，请先重试原请求。')
      return
    }
    if (next === draft) return
    setHistory((items) => [...items.slice(-29), draft])
    setFuture([])
    setDraft(next)
    setDirty(true)
    if (message) setNotice(message)
  }
  const clearDrag = () => {
    const current = drag.current
    if (current) {
      current.element.classList.remove('lineup-drag-source')
      if (current.element.hasPointerCapture(current.pointerId))
        current.element.releasePointerCapture(current.pointerId)
    }
    drag.current = null
    if (ghost.current) ghost.current.style.display = 'none'
    highlighted.current?.classList.remove('lineup-drop-active')
    highlighted.current = null
  }
  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        clearDrag()
        setSelected(null)
        setNotice('已取消本次选位。')
      }
    }
    const warn = (event: BeforeUnloadEvent) => {
      if (dirty) {
        event.preventDefault()
        event.returnValue = ''
      }
    }
    window.addEventListener('keydown', escape)
    window.addEventListener('beforeunload', warn)
    return () => {
      window.removeEventListener('keydown', escape)
      window.removeEventListener('beforeunload', warn)
      clearDrag()
    }
  }, [dirty])

  const startDrag = (
    event: ReactPointerEvent<HTMLElement>,
    playerId: string | null,
    slotId: string | null = null,
  ) => {
    if (
      cloudBusy ||
      pendingSave ||
      event.button !== 0 ||
      !event.isPrimary ||
      drag.current ||
      (!playerId && !freeMove)
    )
      return
    const element = event.currentTarget
    drag.current = {
      pointerId: event.pointerId,
      playerId,
      slotId,
      originX: event.clientX,
      originY: event.clientY,
      moved: false,
      element,
    }
    element.setPointerCapture(event.pointerId)
    suppressClick.current = false
  }
  const moveDrag = (event: ReactPointerEvent<HTMLElement>) => {
    const current = drag.current
    if (!current || current.pointerId !== event.pointerId) return
    if (
      !current.moved &&
      Math.hypot(event.clientX - current.originX, event.clientY - current.originY) < 6
    )
      return
    current.moved = true
    current.element.classList.add('lineup-drag-source')
    if (ghost.current) {
      ghost.current.style.display = 'flex'
      ghost.current.style.transform = `translate3d(${event.clientX}px, ${event.clientY}px, 0)`
      ghost.current.textContent = current.playerId
        ? (playerMap.get(current.playerId)?.displayName ?? '')
        : (draft.slots.find((slot) => slot.id === current.slotId)?.label ?? '')
    }
    const target =
      document
        .elementFromPoint(event.clientX, event.clientY)
        ?.closest<HTMLElement>(
          '[data-lineup-slot], [data-lineup-bench], [data-lineup-unassigned]',
        ) ?? null
    if (target !== highlighted.current) {
      highlighted.current?.classList.remove('lineup-drop-active')
      target?.classList.add('lineup-drop-active')
      highlighted.current = target
    }
  }
  const endDrag = (event: ReactPointerEvent<HTMLElement>) => {
    const current = drag.current
    if (!current || current.pointerId !== event.pointerId) return
    if (current.moved) {
      suppressClick.current = true
      const target = document
        .elementFromPoint(event.clientX, event.clientY)
        ?.closest<HTMLElement>('[data-lineup-slot], [data-lineup-bench], [data-lineup-unassigned]')
      const rect = pitch.current?.getBoundingClientRect()
      if (target?.hasAttribute('data-lineup-unassigned') && current.playerId) {
        change(
          {
            ...assignPlayer(draft, current.playerId, null),
            benchPlayerIds: substitutes
              .map((player) => player.id)
              .filter((id) => id !== current.playerId),
          },
          '球员已移至未入选。',
        )
      } else if (target?.hasAttribute('data-lineup-bench') && current.playerId) {
        change(assignPlayer(draft, current.playerId, null), '球员已移至替补。')
      } else if (
        freeMove &&
        current.slotId &&
        rect &&
        event.clientX >= rect.left &&
        event.clientX <= rect.right &&
        event.clientY >= rect.top &&
        event.clientY <= rect.bottom
      ) {
        {
          const px = ((event.clientX - rect.left) / rect.width) * 100
          const py = ((event.clientY - rect.top) / rect.height) * 100
          change(
            moveSlot(draft, current.slotId, landscape ? py : px, landscape ? 100 - px : py),
            '站位已调整，可保存为自定义战术。',
          )
        }
      } else if (target?.dataset.lineupSlot && current.playerId) {
        change(
          assignPlayer(draft, current.playerId, target.dataset.lineupSlot),
          '首发位置已更新；占用位置会自动交换球员。',
        )
      } else {
        setNotice('没有放到有效位置，球员已回到原处。')
      }
      setSelected(null)
    }
    clearDrag()
  }
  const choosePlayer = (player: LineupPlayer) => {
    if (suppressClick.current) {
      suppressClick.current = false
      return
    }
    setSelected(selected === player.id ? null : player.id)
    setNotice(`已选择 ${player.displayName}，请点一个场上位置。Esc 取消。`)
  }
  const chooseSlot = (slotId: string) => {
    if (suppressClick.current) {
      suppressClick.current = false
      return
    }
    const slot = draft.slots.find((item) => item.id === slotId)!
    if (selected) {
      change(assignPlayer(draft, selected, slotId), `已安排到 ${slot.label}。`)
      setSelected(null)
    } else if (slot.playerId) {
      setSelected(slot.playerId)
      setNotice('已选择场上球员，点击另一个位置可交换，点击替补区可移出首发。')
    } else {
      setNotice(`这是空位 ${slot.label}，先从替补区选择球员。`)
    }
  }
  const saveDraft = () => {
    if (!storageKey || !hasSameOwner()) {
      setNotice('请先重新登录队长账号。')
      return
    }
    try {
      Taro.setStorageSync(storageKey, draft)
      setDirty(false)
      setNotice('战术草稿已保存在本机，刷新可恢复。')
    } catch {
      setNotice('本机存储失败，草稿仍在页面中，请勿关闭。')
    }
  }
  const saveTemplate = () => {
    if (!hasSameOwner()) {
      setOwnerInvalid(true)
      return
    }
    const name = draft.name.trim()
    if (!name) {
      setNotice('请先为自定义战术命名。')
      return
    }
    const template = {
      ...draft,
      name,
      custom: true,
      benchPlayerIds: [],
      slots: draft.slots.map((slot) => ({ ...slot, playerId: null })),
    }
    const next = [...templates.filter((item) => item.name !== name), template].slice(-12)
    try {
      Taro.setStorageSync(`${storageKey}:templates`, next)
      setTemplates(next)
      setNotice(`已保存战术「${name}」，只保存站位，不绑定球员。`)
    } catch {
      setNotice('保存自定义战术失败，请检查本机存储。')
    }
  }

  const openPlan = async (id: string, latestPlan?: LineupPlanView) => {
    if (cloudBusy || pendingSave || pendingPublication) return
    if (dirty) {
      const answer = await Taro.showModal({
        title: '切换云端计划',
        content: '当前未保存的排阵会被替换，是否继续？',
        confirmText: '继续',
      })
      if (!answer.confirm) return
    }
    const plan = latestPlan ?? plans.find((item) => item.id === id)
    if (!plan) {
      setCloudPlan(null)
      setPlanHistory(null)
      setNotice('将作为新的云端计划保存，请使用不同名称。')
      return
    }
    const restored = restoreDraft(
      {
        schemaVersion: 1,
        formation: plan.payload.formation,
        captainPlayerId: plan.payload.captainPlayerId,
        name: plan.name,
        custom: true,
        slots: plan.payload.slots.map((slot) => ({ ...slot, id: slot.slotId })),
        benchPlayerIds: plan.payload.benchPlayerIds,
      },
      plan.kind === 'MATCH_LINEUP' ? plan.snapshotPlayers : teamPlayers,
    )
    if (!restored) {
      setCloudError('云端战术格式不可读取，请联系赛事管理员。')
      return
    }
    setKind(plan.kind)
    setTacticScope(plan.tournamentId ? 'TOURNAMENT' : 'TEAM')
    setBoundPlayers(plan.kind === 'MATCH_LINEUP' ? plan.snapshotPlayers : null)
    setBoundSnapshotId(plan.rosterSnapshotId)
    setBoundSnapshotVersion(plan.rosterSnapshotVersion)
    setMatchId(plan.matchId ?? '')
    setCloudPlan(plan)
    setDraft(restored)
    setDirty(false)
    setHistory([])
    setFuture([])
    setCloudError('')
    setPlanHistory(null)
    setNotice(`已读取云端「${plan.name}」v${plan.version}。`)
    try {
      Taro.setStorageSync(`${storageKey}:cloud-plan`, plan.id)
    } catch {
      /* Server plan remains available in the selector. */
    }
  }
  const chooseKind = async (nextKind: 'TACTIC' | 'MATCH_LINEUP') => {
    if (cloudBusy || pendingSave || pendingPublication || cloudPlan) return
    setCloudBusy(true)
    try {
      let next =
        restoreDraft(draft, nextKind === 'MATCH_LINEUP' ? lockedPlayers : teamPlayers) ??
        createFormation('3-3-1')
      if (nextKind === 'MATCH_LINEUP') {
        const workflow = await rosterRepository.read(tournamentId, teamId)
        const format = workflow.policy?.playersOnPitch
        if (format !== 8) throw new Error('本赛事须配置八人制首发人数，请联系赛事管理员。')
        if (!workflow.lockedSnapshot) throw new Error('本队尚无赛事锁定名单，不能编排单场阵容。')
        setBoundPlayers(workflow.lockedSnapshot.players)
        setBoundSnapshotId(workflow.lockedSnapshot.id)
        setBoundSnapshotVersion(workflow.lockedSnapshot.version)
        next = restoreDraft(next, workflow.lockedSnapshot.players) ?? createFormation('3-3-1')
        if (next.slots.length !== format)
          next = createFormation(
            FORMATIONS.find((formation) => formation.format === format)!.name,
            next,
          )
      }
      if (!alive.current) return
      setKind(nextKind)
      setSelected(null)
      setHistory((items) => [...items.slice(-29), draft])
      setFuture([])
      setDraft(next)
      setDirty(true)
      setCloudError('')
      setNotice(
        nextKind === 'MATCH_LINEUP'
          ? '八人制单场计划仅使用锁定名单；保存后还需明确确认本场首发。'
          : '球队阵容计划可安排本队现役成员；设为默认后仍不会代替单场首发。',
      )
    } catch (error) {
      if (alive.current) setCloudError(error instanceof Error ? error.message : '赛事规程读取失败')
    } finally {
      if (alive.current) setCloudBusy(false)
    }
  }
  const saveCloud = async (retry = false) => {
    if (sending.current || pendingPublication) return
    if (!hasSameOwner()) {
      setOwnerInvalid(true)
      return
    }
    let request = retry ? pendingSave : null
    if (!request) {
      if (!draft.name.trim()) {
        setCloudError('请先填写战术名称。')
        return
      }
      if (kind === 'MATCH_LINEUP' && !matchId) {
        setCloudError('请先选择本队的一场待赛比赛。')
        return
      }
      if (kind === 'MATCH_LINEUP' && starters.size !== draft.slots.length) {
        setCloudError('单场阵容需安排完整首发。')
        return
      }
      sending.current = true
      setCloudBusy(true)
      try {
        if (kind === 'MATCH_LINEUP' && !boundSnapshotId)
          throw new Error('本队尚无赛事锁定名单，不能保存单场阵容。')
        request = {
          key: createClientActionId('lineup'),
          input: {
            ...(cloudPlan ? { planId: cloudPlan.id } : {}),
            name: draft.name.trim(),
            kind,
            expectedVersion: cloudPlan?.version ?? 0,
            tournamentId: cloudPlan
              ? cloudPlan.tournamentId
              : kind === 'MATCH_LINEUP' || tacticScope === 'TOURNAMENT'
                ? tournamentId
                : null,
            matchId: kind === 'MATCH_LINEUP' ? matchId : null,
            rosterSnapshotId: kind === 'MATCH_LINEUP' ? boundSnapshotId : null,
            payload: {
              captainPlayerId: draft.captainPlayerId,
              formation: draft.formation,
              format: 8,
              slots: draft.slots.map((slot) => ({
                slotId: slot.id,
                label: slot.label,
                x: slot.x,
                y: slot.y,
                playerId: slot.playerId,
              })),
              benchPlayerIds: substitutes.map((player) => player.id),
            },
          },
        }
      } catch (error) {
        setCloudError(error instanceof Error ? error.message : '锁定名单读取失败')
        sending.current = false
        setCloudBusy(false)
        return
      }
    } else {
      sending.current = true
      setCloudBusy(true)
    }
    setCloudError('')
    try {
      const result = await lineupPlanRepository.save(teamId, request.input, request.key)
      if (!alive.current) return
      setCloudPlan(result)
      setBoundSnapshotVersion(result.rosterSnapshotVersion)
      setPlans((items) => [result, ...items.filter((item) => item.id !== result.id)])
      setPendingSave(null)
      setDirty(false)
      setPlanHistory(null)
      setNotice(
        `已保存「${result.name}」v${result.version}。` +
          (result.kind === 'MATCH_LINEUP'
            ? result.confirmedVersion
              ? `本场仍使用已确认 v${result.confirmedVersion}，新修改需再次确认。`
              : '本场首发尚未确认，保存计划不会自动公布。'
            : '队长与教练可管理球队阵容，默认阵容不代替单场首发。'),
      )
      try {
        Taro.setStorageSync(`${storageKey}:cloud-plan`, result.id)
        Taro.setStorageSync(storageKey, draft)
      } catch {
        /* A successful server save does not depend on local storage. */
      }
    } catch (error) {
      if (!alive.current) return
      setCloudError(error instanceof Error ? error.message : '云端保存失败')
      if (!(error instanceof RosterApiError) || error.status >= 500 || error.status === 0)
        setPendingSave(request)
      else setPendingSave(null)
    } finally {
      sending.current = false
      if (alive.current) setCloudBusy(false)
    }
  }

  const refreshLockedRoster = async () => {
    if (sending.current || pendingSave || pendingPublication || kind !== 'MATCH_LINEUP') return
    if (!hasSameOwner()) {
      setOwnerInvalid(true)
      return
    }
    sending.current = true
    setCloudBusy(true)
    setCloudError('')
    try {
      const workflow = await rosterRepository.read(tournamentId, teamId)
      if (!alive.current) return
      if (workflow.policy?.playersOnPitch !== 8)
        throw new Error('本赛事须配置八人制首发人数，请联系赛事管理员。')
      if (!workflow.lockedSnapshot) throw new Error('本队尚无赛事锁定名单，不能确认单场首发。')
      const snapshot = workflow.lockedSnapshot
      if (snapshot.id === boundSnapshotId) {
        setNotice('当前计划已绑定最新锁定名单。')
        return
      }
      setBoundPlayers(snapshot.players)
      setBoundSnapshotId(snapshot.id)
      setBoundSnapshotVersion(snapshot.version)
      setDraft(restoreDraft(draft, snapshot.players) ?? createFormation())
      setHistory([])
      setFuture([])
      setDirty(true)
      setNotice(
        `已绑定锁定名单 v${snapshot.version}；离队球员已移出计划。请补齐八人、保存并重新确认。此前确认的首发保持原版本。`,
      )
    } catch (error) {
      if (alive.current) setCloudError(error instanceof Error ? error.message : '锁定名单读取失败')
    } finally {
      sending.current = false
      if (alive.current) setCloudBusy(false)
    }
  }

  const publishPlan = async (action: 'DEFAULT' | 'CONFIRM', retry = false) => {
    if (sending.current || pendingSave || (pendingPublication && !retry)) return
    if (!hasSameOwner()) {
      setOwnerInvalid(true)
      return
    }
    let command = retry ? pendingPublication : null
    if (!command) {
      if (!cloudPlan || dirty) {
        setCloudError('请先保存当前修改，再操作保存的阵容版本。')
        return
      }
      if (action === 'CONFIRM') {
        sending.current = true
        setCloudBusy(true)
        try {
          const answer = await Taro.showModal({
            title: '确认本场八人首发',
            content: `确认「${cloudPlan.name}」v${cloudPlan.version} 为本场首发？这会替换本队本场此前已确认的阵容。球队默认阵容不会参与此操作。`,
            confirmText: '确认首发',
          })
          if (!answer.confirm) return
          if (!hasSameOwner()) {
            setOwnerInvalid(true)
            return
          }
        } catch {
          setCloudError('确认窗口未能打开，请重试。')
          return
        } finally {
          sending.current = false
          if (alive.current) setCloudBusy(false)
        }
      }
      command = {
        planId: cloudPlan.id,
        action,
        expectedVersion: cloudPlan.version,
        key: createClientActionId('lineup-publication'),
      }
    }
    sending.current = true
    setCloudBusy(true)
    setCloudError('')
    try {
      const result = await lineupPlanRepository.publish(
        teamId,
        command.planId,
        command.action,
        command.expectedVersion,
        command.key,
      )
      if (!alive.current) return
      setCloudPlan(result)
      setPlans((items) => [
        result,
        ...items
          .filter((item) => item.id !== result.id)
          .map((item) =>
            command.action === 'DEFAULT'
              ? { ...item, isDefault: false }
              : item.matchId === result.matchId
                ? {
                    ...item,
                    confirmedVersion: null,
                    confirmedAt: null,
                    confirmedByUserId: null,
                    hasUnconfirmedChanges: false,
                  }
                : item,
          ),
      ])
      setPendingPublication(null)
      setNotice(
        command.action === 'DEFAULT'
          ? `「${result.name}」已设为球队默认阵容；每场比赛仍需单独确认首发。`
          : `已确认本场首发 v${result.confirmedVersion}；之后保存的修改需再次确认才会公布。`,
      )
    } catch (error) {
      if (!alive.current) return
      setCloudError(error instanceof Error ? error.message : '阵容操作失败')
      setPendingPublication(
        !(error instanceof RosterApiError) || error.status >= 500 || error.status === 0
          ? command
          : null,
      )
    } finally {
      sending.current = false
      if (alive.current) setCloudBusy(false)
    }
  }

  if (ownerInvalid)
    return (
      <section className="lineup-workbench">
        <p className="lineup-local-note">账号已切换或退出，请重新打开球队管理。</p>
        <button
          className="lineup-button"
          onClick={() => void Taro.reLaunch({ url: '/pages/my-team/index' })}
        >
          重新打开
        </button>
      </section>
    )
  return (
    <section
      className={`lineup-workbench${compact ? ' lineup-workbench--compact' : ''}${landscape ? ' lineup-workbench--landscape' : ''}`}
      aria-label="队长与教练八人制排阵"
    >
      <div className="lineup-heading">
        <div>
          <span className="lineup-eyebrow">TACTICS ROOM</span>
          <h2>把你的阵容，排上球场</h2>
          <p>{teamName} · 固定八人制 · 球队默认阵容与单场确认首发分别管理</p>
        </div>
        <div className="lineup-save-actions">
          <button className="lineup-button" onClick={saveDraft}>
            保存战术草稿{dirty ? ' *' : ''}
          </button>
          <button
            className="lineup-button lineup-primary"
            disabled={cloudBusy || cloudLoading || Boolean(pendingSave || pendingPublication)}
            onClick={() => void saveCloud()}
          >
            {cloudBusy ? '处理中…' : '保存到云端'}
          </button>
        </div>
      </div>
      <div className="lineup-cloud">
        <p className="lineup-publication-status" role="status">
          {kind === 'TACTIC'
            ? cloudPlan?.isDefault
              ? '球队默认阵容 · 每场比赛仍需单独确认首发'
              : '球队阵容计划 · 尚未设为球队默认阵容'
            : cloudPlan?.confirmedVersion
              ? `本场已确认 v${cloudPlan.confirmedVersion}${cloudPlan.hasUnconfirmedChanges || dirty ? ' · 有未确认修改' : ''}`
              : '本场首发尚未确认 · 保存计划不会自动公布'}
        </p>
        {cloudPlan && (
          <button
            className="lineup-button lineup-primary"
            disabled={
              cloudBusy ||
              dirty ||
              Boolean(pendingSave || pendingPublication) ||
              (kind === 'TACTIC' && (cloudPlan.tournamentId !== null || cloudPlan.isDefault)) ||
              (kind === 'MATCH_LINEUP' &&
                !matches.some(
                  (match) =>
                    match.id === cloudPlan.matchId &&
                    ['DRAFT', 'SCHEDULED', 'POSTPONED'].includes(match.status),
                ))
            }
            onClick={() => void publishPlan(kind === 'TACTIC' ? 'DEFAULT' : 'CONFIRM')}
          >
            {kind === 'TACTIC' ? '设为球队默认阵容' : '确认本场首发'}
          </button>
        )}
        {cloudPlan && (
          <span className="lineup-cloud__hint">
            {cloudPlan.tournamentId === null
              ? '全队通用战术 · 保留原归属保存'
              : '当前赛事计划 · 保留原归属保存'}
          </span>
        )}
        <label className="lineup-label">
          计划用途
          <select
            className="lineup-select"
            aria-label="计划用途"
            value={kind}
            disabled={cloudBusy || Boolean(pendingSave || pendingPublication) || Boolean(cloudPlan)}
            onChange={(event) => void chooseKind(event.target.value as 'TACTIC' | 'MATCH_LINEUP')}
          >
            <option value="TACTIC">球队阵容计划</option>
            <option value="MATCH_LINEUP">单场首发计划（需确认）</option>
          </select>
        </label>
        {kind === 'TACTIC' ? (
          <label className="lineup-label">
            战术归属
            <select
              className="lineup-select"
              aria-label="战术归属"
              value={tacticScope}
              disabled={
                cloudBusy || Boolean(pendingSave || pendingPublication) || Boolean(cloudPlan)
              }
              onChange={(event) => {
                setTacticScope(event.target.value as 'TEAM' | 'TOURNAMENT')
                setDirty(true)
              }}
            >
              <option value="TEAM">全队通用（无需赛事报名）</option>
              <option value="TOURNAMENT">当前赛事（需有效报名）</option>
            </select>
          </label>
        ) : null}
        {kind === 'MATCH_LINEUP' && (
          <label className="lineup-label">
            本队比赛
            <select
              className="lineup-select"
              aria-label="选择本队比赛"
              value={matchId}
              disabled={
                cloudBusy || Boolean(pendingSave || pendingPublication) || Boolean(cloudPlan)
              }
              onChange={(event) => {
                setMatchId(event.target.value)
                const match = matches.find((item) => item.id === event.target.value)
                if (match) change({ ...draft, name: `${match.title}首发`.slice(0, 32) })
              }}
            >
              <option value="">选择待赛比赛</option>
              {matches
                .filter((match) => ['DRAFT', 'SCHEDULED', 'POSTPONED'].includes(match.status))
                .map((match) => (
                  <option key={match.id} value={match.id}>
                    {match.title}
                  </option>
                ))}
            </select>
          </label>
        )}
        {kind === 'MATCH_LINEUP' && (
          <button
            className="lineup-button"
            disabled={cloudBusy || Boolean(pendingSave || pendingPublication)}
            onClick={() => void refreshLockedRoster()}
          >
            绑定最新锁定名单
          </button>
        )}
        <label className="lineup-label">
          云端计划
          <select
            className="lineup-select"
            aria-label="云端计划"
            value={cloudPlan?.id ?? ''}
            disabled={cloudBusy || Boolean(pendingSave || pendingPublication)}
            onChange={(event) => void openPlan(event.target.value)}
          >
            <option value="">新建计划</option>
            {plans
              .filter(
                (plan) =>
                  plan.payload.format === 8 &&
                  plan.payload.slots.length === 8 &&
                  (!plan.tournamentId || plan.tournamentId === tournamentId),
              )
              .map((plan) => (
                <option value={plan.id} key={plan.id}>
                  {plan.name} · v{plan.version}
                  {plan.isDefault ? ' · 球队默认' : ''}
                  {plan.confirmedVersion ? ` · 本场已确认 v${plan.confirmedVersion}` : ''}
                </option>
              ))}
          </select>
        </label>
        {cloudLoading && <span className="lineup-cloud__hint">正在读取云端计划…</span>}
        <button
          className="lineup-button"
          disabled={cloudBusy || Boolean(pendingSave || pendingPublication)}
          onClick={() => void loadPlans()}
        >
          刷新云端列表
        </button>
        {cloudPlan && (
          <button
            className="lineup-button"
            disabled={cloudBusy || Boolean(pendingSave || pendingPublication)}
            onClick={async () => {
              try {
                const result = await lineupPlanRepository.list(teamId)
                setPlans(result.items)
                const latest = result.items.find((plan) => plan.id === cloudPlan.id)
                if (!latest) throw new Error('云端计划已不可用，请重新打开球队管理。')
                await openPlan(latest.id, latest)
              } catch (error) {
                setCloudError(error instanceof Error ? error.message : '最新版本读取失败')
              }
            }}
          >
            读取最新版本
          </button>
        )}
        {cloudPlan && (
          <button
            className="lineup-button"
            disabled={cloudBusy}
            onClick={async () => {
              try {
                setPlanHistory(await lineupPlanRepository.history(teamId, cloudPlan.id))
                setCloudError('')
              } catch (error) {
                setCloudError(error instanceof Error ? error.message : '历史读取失败')
              }
            }}
          >
            保存历史
          </button>
        )}
      </div>
      {cloudError && (
        <div className="lineup-cloud-error" role="alert">
          {cloudError}
          {pendingSave && (
            <button
              className="lineup-button"
              disabled={cloudBusy}
              onClick={() => void saveCloud(true)}
            >
              用原保存请求重试
            </button>
          )}
          {pendingPublication && (
            <button
              className="lineup-button"
              disabled={cloudBusy}
              onClick={() => void publishPlan(pendingPublication.action, true)}
            >
              用原阵容操作请求重试
            </button>
          )}
        </div>
      )}
      {planHistory && (
        <div className="lineup-revisions">
          <strong>云端保存历史</strong>
          {planHistory.items.map((revision) => (
            <span key={revision.version}>
              v{revision.version} · {revision.payload.name} ·{' '}
              {new Date(revision.createdAt).toLocaleString('zh-CN')}
            </span>
          ))}
          {planHistory.nextBeforeVersion && (
            <span>显示最近 50 次保存，更早版本由历史 API 分页读取。</span>
          )}
        </div>
      )}
      <fieldset
        className="lineup-editable"
        disabled={cloudBusy || Boolean(pendingSave || pendingPublication)}
      >
        <div className="lineup-toolbar">
          <label className="lineup-label">
            阵型
            <select
              className="lineup-select"
              aria-label="选择阵型"
              value={draft.custom ? 'custom' : draft.formation}
              onChange={(event) => {
                if (event.target.value !== 'custom')
                  change(
                    createFormation(event.target.value, draft),
                    '阵型已切换，已选首发保留；人数减少时多余球员转入替补。',
                  )
              }}
            >
              {draft.custom && <option value="custom">自定义站位</option>}
              {FORMATIONS.map((formation) => (
                <option key={formation.name} value={formation.name}>
                  {formation.name} · {formation.format} 人制
                </option>
              ))}
            </select>
          </label>
          <button
            className={freeMove ? 'lineup-button is-active' : 'lineup-button'}
            aria-pressed={freeMove}
            onClick={() => {
              setFreeMove(!freeMove)
              setNotice(
                freeMove
                  ? '拖拽球员可交换首发位置。'
                  : '自由站位：拖动场上标记，调整战术坐标；方向键也可微调。',
              )
            }}
          >
            {freeMove ? '自由站位：开启' : '自定义站位'}
          </button>
          <button
            className="lineup-button"
            onClick={() =>
              change(fillByPosition(draft, players), '已按球员登记位置填入空位，请核对首发。')
            }
          >
            按位置填入
          </button>
          <div className="lineup-toolbar__history">
            <button
              className="lineup-button"
              disabled={!history.length}
              aria-label="撤销排阵"
              onClick={() => {
                const previous = history[history.length - 1]!
                setFuture([...future, draft])
                setHistory(history.slice(0, -1))
                setDraft(previous)
                setDirty(true)
              }}
            >
              撤销
            </button>
            <button
              className="lineup-button"
              disabled={!future.length}
              aria-label="重做排阵"
              onClick={() => {
                const next = future[future.length - 1]!
                setHistory([...history, draft])
                setFuture(future.slice(0, -1))
                setDraft(next)
                setDirty(true)
              }}
            >
              重做
            </button>
          </div>
        </div>
        <div className="lineup-layout">
          <div className="lineup-pitch-panel">
            <div className="lineup-pitch-caption">
              <span>{draft.custom ? draft.name || '自定义战术' : draft.formation}</span>
              <span>
                {kind === 'MATCH_LINEUP' && boundSnapshotVersion
                  ? `名单 v${boundSnapshotVersion} · `
                  : ''}
                拟首发 {starters.size}/8 · 进攻方向 {landscape ? '→' : '↑'}
              </span>
            </div>
            <p className="lineup-local-note">
              拟首发 {starters.size}/8 人 · 替补 {substitutes.length} 人 · 未入选{' '}
              {unassigned.length} 人
              {kind === 'MATCH_LINEUP' && starters.size < draft.slots.length
                ? ' · 请补齐首发后保存'
                : ''}
            </p>
            <div
              ref={pitch}
              className={`lineup-pitch${landscape ? ' lineup-pitch--landscape' : ''}${freeMove ? ' lineup-pitch--free' : ''}`}
            >
              <div className="lineup-pitch__boundary" aria-hidden="true">
                <div className="lineup-pitch__half" />
                <div className="lineup-pitch__circle" />
                <div className="lineup-pitch__spot" />
                <div className="lineup-pitch__box lineup-pitch__box--top" />
                <div className="lineup-pitch__box lineup-pitch__box--bottom" />
                <div className="lineup-pitch__goal lineup-pitch__goal--top" />
                <div className="lineup-pitch__goal lineup-pitch__goal--bottom" />
              </div>
              {draft.slots.map((slot) => {
                const player = slot.playerId ? playerMap.get(slot.playerId) : undefined
                return (
                  <button
                    key={slot.id}
                    data-lineup-slot={slot.id}
                    data-lineup-key={slot.playerId ?? `empty:${slot.id}`}
                    className={`lineup-button lineup-slot ${player ? 'lineup-slot--filled' : ''} ${selected && selected === slot.playerId ? 'is-selected' : ''}`}
                    style={slotStyle(slot)}
                    aria-label={`${slot.label} ${player?.displayName ?? '空位'}`}
                    aria-pressed={selected !== null && selected === slot.playerId}
                    onPointerDown={(event) => startDrag(event, slot.playerId, slot.id)}
                    onPointerMove={moveDrag}
                    onPointerUp={endDrag}
                    onPointerCancel={clearDrag}
                    onLostPointerCapture={() => {
                      if (drag.current) clearDrag()
                    }}
                    onClick={() => chooseSlot(slot.id)}
                    onKeyDown={(event) => {
                      if (
                        !freeMove ||
                        !['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)
                      )
                        return
                      event.preventDefault()
                      change(
                        moveSlot(
                          draft,
                          slot.id,
                          slot.x +
                            (event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0),
                          slot.y +
                            (event.key === 'ArrowDown' ? 1 : event.key === 'ArrowUp' ? -1 : 0),
                        ),
                      )
                    }}
                  >
                    <span
                      className={`lineup-shirt ${slot.label === 'GK' ? 'lineup-shirt--keeper' : ''}`}
                    >
                      {player?.shirtNumber ?? (player ? '—' : '+')}
                    </span>
                    <span className="lineup-slot__name">{player?.displayName ?? slot.label}</span>
                    <span className="lineup-slot__position">{slot.label}</span>
                  </button>
                )
              })}
            </div>
            <div className="lineup-pitch-footer">
              <span>号码球衣 · 本队真实成员</span>
              <button
                className="lineup-button"
                onClick={async () => {
                  const result = await Taro.showModal({
                    title: '清空首发',
                    content: '球员将回到替补区，已保存的草稿不会被覆盖。',
                    confirmText: '清空',
                  })
                  if (result.confirm) change(clearStarters(draft), '首发已清空。')
                }}
              >
                清空首发
              </button>
            </div>
          </div>
          <aside className="lineup-bench">
            <div className="lineup-bench__heading">
              <div>
                <span className="lineup-eyebrow">ON THE BENCH</span>
                <h3>替补</h3>
              </div>
              <strong>{substitutes.length}</strong>
            </div>
            <input
              className="lineup-input"
              aria-label="搜索本队球员"
              placeholder="搜索姓名或号码"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            <p className="lineup-bench__hint">拖入球场成为首发，拖回这里成为替补。</p>
            <div className="lineup-bench__list" data-lineup-bench="true">
              {bench.map((player) => (
                <div className="lineup-bench-row" key={player.id}>
                  <button
                    className={`lineup-button lineup-player ${selected === player.id ? 'is-selected' : ''}`}
                    aria-label={`选择${player.displayName}`}
                    aria-pressed={selected === player.id}
                    onPointerDown={(event) => startDrag(event, player.id)}
                    onPointerMove={moveDrag}
                    onPointerUp={endDrag}
                    onPointerCancel={clearDrag}
                    onClick={() => choosePlayer(player)}
                  >
                    <PlayerPortrait player={player} />
                    <span className="lineup-player__copy">
                      <strong>{player.displayName}</strong>
                      <small>
                        {positionLabel(player.position)} · {player.shirtNumber ?? '未设'} 号
                      </small>
                    </span>
                    <span className="lineup-player__grip" aria-hidden="true">
                      ⠿
                    </span>
                  </button>
                  <button
                    className="lineup-button lineup-player-action"
                    aria-label={`将${player.displayName}移至未入选`}
                    onClick={() =>
                      change(
                        {
                          ...draft,
                          benchPlayerIds: substitutes
                            .map((item) => item.id)
                            .filter((id) => id !== player.id),
                        },
                        '已移至未入选。',
                      )
                    }
                  >
                    未入选
                  </button>
                </div>
              ))}
              {!bench.length && (
                <p className="lineup-empty">
                  {query
                    ? '没有符合搜索的本队球员'
                    : players.length
                      ? unassigned.length
                        ? '暂未选择替补，可从未入选中添加。'
                        : '所有球员均已安排首发'
                      : '本队还没有已关联档案的球员'}
                </p>
              )}
            </div>
            <div className="lineup-unassigned" data-lineup-unassigned="true">
              <h3>
                未入选 <span>{unassigned.length}</span>
              </h3>
              {visibleUnassigned.map((player) => (
                <div className="lineup-bench-row" key={player.id}>
                  <button
                    className={`lineup-button lineup-player ${selected === player.id ? 'is-selected' : ''}`}
                    aria-label={`选择未入选的${player.displayName}`}
                    aria-pressed={selected === player.id}
                    onPointerDown={(event) => startDrag(event, player.id)}
                    onPointerMove={moveDrag}
                    onPointerUp={endDrag}
                    onPointerCancel={clearDrag}
                    onClick={() => choosePlayer(player)}
                  >
                    <PlayerPortrait player={player} />
                    <span className="lineup-player__copy">
                      <strong>{player.displayName}</strong>
                      <small>{positionLabel(player.position)}</small>
                    </span>
                  </button>
                  <button
                    className="lineup-button lineup-player-action"
                    aria-label={`将${player.displayName}设为替补`}
                    onClick={() =>
                      change(
                        {
                          ...draft,
                          benchPlayerIds: [...substitutes.map((item) => item.id), player.id],
                        },
                        '已设为替补。',
                      )
                    }
                  >
                    替补
                  </button>
                </div>
              ))}
            </div>
            <button
              className="lineup-button lineup-bench__remove"
              disabled={!selected || !starters.has(selected)}
              onClick={() => {
                if (selected) change(assignPlayer(draft, selected, null), '已移至替补。')
                setSelected(null)
              }}
            >
              将所选球员移至替补
            </button>
          </aside>
        </div>
        <div className="lineup-custom">
          <label className="lineup-label">
            战术名称
            <input
              className="lineup-input"
              aria-label="战术名称"
              maxLength={32}
              placeholder="例如：边路推进"
              value={draft.name}
              onChange={(event) => change({ ...draft, name: event.target.value })}
            />
          </label>
          <button className="lineup-button" onClick={saveTemplate}>
            保存为自定义战术
          </button>
          {templates.map((template) => (
            <span className="lineup-template" key={template.name}>
              <button
                className="lineup-button"
                onClick={() => {
                  const sameSize = draft.slots.length === template.slots.length
                  const base = sameSize ? draft : createFormation(template.formation, draft)
                  change(
                    {
                      ...template,
                      benchPlayerIds: base.benchPlayerIds,
                      slots: template.slots.map((slot, index) => ({
                        ...slot,
                        playerId: base.slots[index]?.playerId ?? null,
                      })),
                    },
                    `已应用「${template.name}」。`,
                  )
                }}
              >
                {template.name}
              </button>
              <button
                className="lineup-button"
                aria-label={`删除战术${template.name}`}
                onClick={() => {
                  const next = templates.filter((item) => item.name !== template.name)
                  try {
                    Taro.setStorageSync(`${storageKey}:templates`, next)
                    setTemplates(next)
                  } catch {
                    setNotice('删除战术失败。')
                  }
                }}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      </fieldset>
      <div className="lineup-status" role="status" aria-live="polite">
        {notice}
      </div>
      <p className="lineup-local-note">
        「保存战术草稿」只保存在本机；「保存到云端」供获授权队长重新读取。战术规划与比赛报告分开保存，正式参赛资格以赛事锁定名单为准。
      </p>
      <div ref={ghost} className="lineup-drag-ghost" aria-hidden="true" />
    </section>
  )
}

function PlayerPortrait({ player }: { player: LineupPlayer }) {
  const [failed, setFailed] = useState(false)
  const url = resolveMediaUrl(playerAvatarPhoto(player.avatarUrl))
  return (
    <span className="lineup-portrait">
      {url && !failed ? (
        <img
          className="lineup-avatar-image"
          src={url}
          alt=""
          draggable={false}
          onError={() => setFailed(true)}
        />
      ) : (
        <span>{playerAvatarInitial(player.displayName)}</span>
      )}
      <small>{player.shirtNumber ?? '—'}</small>
    </span>
  )
}
