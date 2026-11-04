import Taro from '@tarojs/taro'
import { useEffect, useRef, useState } from 'react'
import { readSession } from '../product/session'
import { productRepository } from '../product/product.repository'
import type { MatchExperienceResponse } from '../product/product.types'
import { inlineReportGateway, MatchReportError } from './repository'
import { cloneFields, emptyFields, validateReport } from './logic'
import { draftKey, readDraft, removeDraft, writeDraft } from './draft.repository'
import {
  changeInlineScore,
  draftWithScores,
  initialInlineFields,
  resizeEventRows,
  eventsByConfirmedClock,
  eventReady,
  type EventClock,
} from './inline.logic'
import type {
  EventKind,
  ReportEvent,
  ReportFields,
  ReportWorkspace,
  SaveReportCommand,
  Side,
} from './types'

export function useInlineReport(
  match: MatchExperienceResponse | null,
  onUpdated: (match: MatchExperienceResponse) => void,
) {
  const session = readSession()
  const candidate = session?.user.roles.some((role) => role.role === 'MATCH_REPORTER') ?? false
  const [workspace, setWorkspace] = useState<ReportWorkspace | null>(null)
  const [fields, setFields] = useState<ReportFields>(emptyFields)
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [requesting, setRequesting] = useState(false)
  const [confirmingScore, setConfirmingScore] = useState(false)
  const [eventClocks, setEventClocks] = useState<Record<string, EventClock>>({})
  const token = useRef('')
  const pending = useRef<SaveReportCommand | null>(null)
  const inFlight = useRef(false)
  const fieldsRef = useRef(fields)
  const workspaceRef = useRef(workspace)
  const mounted = useRef(true)
  const key =
    session && match ? draftKey(session.user.organizationId, session.user.id, match.id) : ''
  fieldsRef.current = fields
  workspaceRef.current = workspace
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])
  useEffect(() => {
    let current = true
    setWorkspace(null)
    setEditing(false)
    setError('')
    token.current = ''
    pending.current = null
    if (candidate && match)
      void inlineReportGateway.load(match.id).then(
        (data) => {
          if (current) setWorkspace(data)
        },
        (cause) => {
          if (current && !(cause instanceof MatchReportError && cause.status === 403))
            setError(cause instanceof Error ? cause.message : '编辑入口加载失败')
        },
      )
    return () => {
      current = false
    }
  }, [match?.id, session?.accessToken, candidate])

  function persist(next: ReportFields, command: SaveReportCommand | null = null) {
    if (key)
      writeDraft(key, {
        schemaVersion: 1,
        baseVersion: workspaceRef.current?.reportVersion ?? 0,
        fields: cloneFields(next),
        reason: '详情页编辑比赛记录',
        savedAt: new Date().toISOString(),
        pending: command,
      })
  }
  function edit(next: ReportFields) {
    if (inFlight.current || pending.current) return
    fieldsRef.current = next
    setFields(next)
    setError('')
    persist(next)
  }
  async function start() {
    if (!match || !workspace?.inline?.canStart || inFlight.current) return
    inFlight.current = true
    setBusy(true)
    setError('')
    try {
      const data = await inlineReportGateway.begin(match.id, crypto.randomUUID())
      if (!mounted.current) return
      if (!data.editorToken) throw new Error('编辑凭据缺失，请重试')
      token.current = data.editorToken
      const draft = readDraft(key)
      const next =
        draft && !draft.pending && draft.baseVersion === (data.reportVersion ?? 0)
          ? draft.fields
          : initialInlineFields(match, data)
      setWorkspace(data)
      workspaceRef.current = data
      setFields(next)
      fieldsRef.current = next
      setEventClocks(
        Object.fromEntries(
          next.events
            .filter((event) => eventReady(event, data))
            .map((event) => [event.id, { minute: event.minute, addedMinute: event.addedMinute }]),
        ),
      )
      setEditing(true)
    } catch (cause) {
      if (mounted.current) setError(cause instanceof Error ? cause.message : '不能开始编辑')
    } finally {
      inFlight.current = false
      if (mounted.current) setBusy(false)
    }
  }
  async function save(action: 'SAVE' | 'COMPLETE' | 'SAVE_SCORE') {
    if (!match || !workspaceRef.current || inFlight.current) return false
    const current = workspaceRef.current
    const next = action === 'SAVE' ? draftWithScores(fieldsRef.current) : fieldsRef.current
    if (action === 'COMPLETE' && !pending.current) {
      const issues = validateReport(next, current, true, '详情页完成编辑')
      if (issues.length) {
        setError(issues[0]!.message)
        return false
      }
    }
    const command: SaveReportCommand = pending.current ?? {
      clientActionId: crypto.randomUUID(),
      expectedVersion: current.reportVersion ?? current.latest?.version ?? 0,
      action,
      editorToken: token.current,
      reason: action === 'COMPLETE' ? '详情页完成编辑' : '详情页保存未完成记录',
      fields: cloneFields(next),
      homeRosterSnapshotId: current.homeTeam.rosterSnapshotId!,
      awayRosterSnapshotId: current.awayTeam.rosterSnapshotId!,
      ruleVersionId: current.ruleVersionId!,
    }
    if (command.action !== action) {
      setError('上次请求尚未确认，请先重试原操作')
      return false
    }
    inFlight.current = true
    setBusy(true)
    setError('')
    pending.current = command
    persist(next, command)
    try {
      const data = await inlineReportGateway.save(match.id, command)
      pending.current = null
      if (!mounted.current) return true
      setWorkspace(data)
      workspaceRef.current = data
      setEditing(false)
      removeDraft(key)
      if (action === 'COMPLETE' || action === 'SAVE_SCORE') {
        onUpdated(await productRepository.getMatch(match.id))
        setConfirmingScore(false)
        await Taro.showToast({
          title: !data.completion?.published
            ? '已保存，先发布的结果保持不变'
            : action === 'SAVE_SCORE'
              ? '比分已保存，可继续补全'
              : data.officialResult?.status === 'LIVE'
                ? '比分已更新，可继续记录'
                : '比赛记录已保存',
          icon: 'none',
        })
      }
      return true
    } catch (cause) {
      if (!(cause instanceof MatchReportError && cause.status === 0)) pending.current = null
      if (mounted.current) setError(cause instanceof Error ? cause.message : '保存失败')
      persist(next, pending.current)
      return false
    } finally {
      inFlight.current = false
      if (mounted.current) setBusy(false)
    }
  }
  function finish() {
    const current = workspaceRef.current
    if (!current) return Promise.resolve(false)
    const issues = validateReport(fieldsRef.current, current, true, '详情页完成编辑')
    if (issues.length && issues.every((issue) => issue.field.startsWith('event-'))) {
      setError('')
      setConfirmingScore(true)
      return Promise.resolve(false)
    }
    return save('COMPLETE')
  }
  async function requestChange(reason: string) {
    if (!match || inFlight.current) return
    inFlight.current = true
    setBusy(true)
    setError('')
    try {
      const data = await inlineReportGateway.requestChange(
        match.id,
        crypto.randomUUID(),
        reason.trim(),
      )
      if (mounted.current) {
        setWorkspace(data)
        setRequesting(false)
      }
      await Taro.showToast({ title: '修改申请已提交', icon: 'none' })
    } catch (cause) {
      if (mounted.current) setError(cause instanceof Error ? cause.message : '申请失败')
    } finally {
      inFlight.current = false
      if (mounted.current) setBusy(false)
    }
  }
  return {
    candidate,
    workspace,
    fields,
    editing,
    busy,
    locked: busy || !!pending.current,
    error,
    requesting,
    confirmingScore,
    confirmScore: () => save('SAVE_SCORE'),
    cancelScore: () => setConfirmingScore(false),
    displayEvents: eventsByConfirmedClock(fields.events, eventClocks),
    completeEvent: (id: string) => {
      const event = fieldsRef.current.events.find((event) => event.id === id)
      if (!event || !workspaceRef.current || !eventReady(event, workspaceRef.current)) {
        setError('请补齐本条事件的分钟和球员，换人需选择换上球员')
        return
      }
      setError('')
      setEventClocks((current) => ({
        ...current,
        [id]: { minute: event.minute, addedMinute: event.addedMinute },
      }))
    },
    start,
    finish,
    saveDraft: () => save('SAVE'),
    requestChange,
    openRequest: () => {
      setRequesting(true)
      setError('')
    },
    closeRequest: () => setRequesting(false),
    score: (side: Side, value: string) =>
      edit(changeInlineScore(fieldsRef.current, side, value, () => crypto.randomUUID())),
    count: (kind: EventKind, side: Side, value: number) =>
      edit(resizeEventRows(fieldsRef.current, kind, side, value, () => crypto.randomUUID())),
    patch: (id: string, patch: Partial<ReportEvent>) =>
      edit({
        ...fieldsRef.current,
        events: fieldsRef.current.events.map((event) =>
          event.id === id ? { ...event, ...patch } : event,
        ),
      }),
    penalty: (side: Side, value: string) =>
      edit({
        ...fieldsRef.current,
        [side === 'HOME' ? 'homePenaltyScore' : 'awayPenaltyScore']: value,
      }),
  }
}
export type InlineReportController = ReturnType<typeof useInlineReport>
