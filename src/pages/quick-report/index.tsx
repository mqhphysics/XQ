import { Button, Input, Text, Textarea, View } from '@tarojs/components'
import Taro, { useDidHide, useDidShow, useUnload } from '@tarojs/taro'
import { useCallback, useEffect, useRef, useState } from 'react'

import { quickReportDraftRepository } from '../../features/quick-report/draft.repository'
import {
  MockNetworkError,
  MockVersionConflictError,
  quickReportRepository,
  type MockNetworkMode,
} from '../../features/quick-report/mock-quick-report.repository'
import {
  QUICK_REPORT_TYPE,
  applySubmissionOutcome,
  cloneFields,
  getChangedFields,
  getResumeDecision,
  getRestoreDecision,
  markDraftSubmitted,
  mergeNonConflictingChanges,
  type ConflictField,
  type DraftContext,
  type GoalEventDraft,
  type MatchOutcome,
  type QuickReportClientState,
  type QuickReportDraft,
  type QuickReportFields,
  type QuickReportServerSnapshot,
  type SubmitQuickReportResult,
  type TeamSide,
} from '../../features/quick-report/quick-report.logic'

import './index.scss'

const MATCH_ID = 'match-spike-001'
const DRAFT_CONTEXT: DraftContext = {
  organizationId: 'org-east-campus',
  matchId: MATCH_ID,
  userId: 'user-reporter-01',
  reportType: QUICK_REPORT_TYPE,
}

const EMPTY_FIELDS: QuickReportFields = {
  homeScore: 0,
  awayScore: 0,
  outcome: 'FINISHED',
  goals: [],
  notes: '',
}

const OUTCOME_OPTIONS: Array<{ value: MatchOutcome; label: string }> = [
  { value: 'FINISHED', label: '正常完赛' },
  { value: 'HOME_FORFEIT', label: '主队弃权' },
  { value: 'AWAY_FORFEIT', label: '客队弃权' },
  { value: 'ABANDONED', label: '比赛中止' },
]

const CONFLICT_LABELS: Record<ConflictField, string> = {
  homeScore: '主队比分',
  awayScore: '客队比分',
  outcome: '比赛结果',
  goals: '进球事件',
  notes: '备注',
}

type PagePhase = 'LOADING' | 'EDITING' | 'SUBMITTING' | 'SUBMITTED' | 'NETWORK_ERROR' | 'CONFLICT'

interface ConflictState {
  draft: QuickReportDraft
  current: QuickReportServerSnapshot
  changedFields: ConflictField[]
}

type PendingPresentation =
  | {
      type: 'SUBMISSION_SUCCESS'
      cleanupFailed: boolean
      result: SubmitQuickReportResult
    }
  | {
      type: 'NETWORK_FAILURE'
    }

export default function QuickReportPage() {
  const [serverSnapshot, setServerSnapshot] = useState<QuickReportServerSnapshot | null>(null)
  const [fields, setFields] = useState<QuickReportFields>(EMPTY_FIELDS)
  const [baseFields, setBaseFields] = useState<QuickReportFields>(EMPTY_FIELDS)
  const [baseVersion, setBaseVersion] = useState(0)
  const [phase, setPhase] = useState<PagePhase>('LOADING')
  const [saveMessage, setSaveMessage] = useState('正在读取比赛与本地草稿…')
  const [networkMode, setNetworkMode] = useState<MockNetworkMode>('ONLINE')
  const [removeFailure, setRemoveFailure] = useState(false)
  const [conflict, setConflict] = useState<ConflictState | null>(null)

  const isActiveRef = useRef(true)
  const needsRefreshRef = useRef(false)
  const readyRef = useRef(false)
  const dirtyRef = useRef(false)
  const serverSnapshotRef = useRef<QuickReportServerSnapshot | null>(serverSnapshot)
  const fieldsRef = useRef(fields)
  const baseFieldsRef = useRef(baseFields)
  const baseVersionRef = useRef(baseVersion)
  const draftTaskQueueRef = useRef<Promise<void>>(Promise.resolve())
  const pendingPresentationRef = useRef<PendingPresentation | null>(null)
  const goalSequenceRef = useRef(2)
  const submissionInFlightRef = useRef(false)

  useEffect(() => {
    fieldsRef.current = fields
  }, [fields])

  useEffect(() => {
    baseFieldsRef.current = baseFields
  }, [baseFields])

  useEffect(() => {
    baseVersionRef.current = baseVersion
  }, [baseVersion])

  const runDraftTask = useCallback((task: () => Promise<void>): Promise<void> => {
    const run = draftTaskQueueRef.current.catch(() => undefined).then(task)
    draftTaskQueueRef.current = run.catch(() => undefined)
    return run
  }, [])

  const getCurrentClientState = useCallback((): QuickReportClientState | null => {
    const snapshot = serverSnapshotRef.current
    if (!snapshot) {
      return null
    }

    return {
      snapshot,
      fields: cloneFields(fieldsRef.current),
      baseFields: cloneFields(baseFieldsRef.current),
      baseVersion: baseVersionRef.current,
      dirty: dirtyRef.current,
    }
  }, [])

  const createCurrentDraft = useCallback(
    (): QuickReportDraft => ({
      context: DRAFT_CONTEXT,
      baseVersion: baseVersionRef.current,
      baseFields: cloneFields(baseFieldsRef.current),
      fields: cloneFields(fieldsRef.current),
      savedAt: new Date().toISOString(),
    }),
    [],
  )

  const persistDraft = useCallback(async () => {
    if (!readyRef.current || !dirtyRef.current) {
      return
    }

    const draft = createCurrentDraft()
    await runDraftTask(() => quickReportDraftRepository.write(draft))

    if (isActiveRef.current) {
      setSaveMessage(`草稿已保存 ${formatClock(draft.savedAt)}`)
    }
  }, [createCurrentDraft, runDraftTask])

  const recordSnapshot = useCallback((snapshot: QuickReportServerSnapshot) => {
    const nextFields = cloneFields(snapshot.fields)
    serverSnapshotRef.current = snapshot
    fieldsRef.current = nextFields
    baseFieldsRef.current = cloneFields(snapshot.fields)
    baseVersionRef.current = snapshot.version
  }, [])

  const renderSnapshot = useCallback((snapshot: QuickReportServerSnapshot) => {
    setServerSnapshot(snapshot)
    setFields(cloneFields(snapshot.fields))
    setBaseFields(cloneFields(snapshot.fields))
    setBaseVersion(snapshot.version)
  }, [])

  const applySnapshot = useCallback(
    (snapshot: QuickReportServerSnapshot) => {
      recordSnapshot(snapshot)
      renderSnapshot(snapshot)
    },
    [recordSnapshot, renderSnapshot],
  )

  const recordClientState = useCallback((state: QuickReportClientState) => {
    serverSnapshotRef.current = state.snapshot
    fieldsRef.current = cloneFields(state.fields)
    baseFieldsRef.current = cloneFields(state.baseFields)
    baseVersionRef.current = state.baseVersion
    dirtyRef.current = state.dirty
  }, [])

  const renderClientState = useCallback((state: QuickReportClientState) => {
    setServerSnapshot(state.snapshot)
    setFields(cloneFields(state.fields))
    setBaseFields(cloneFields(state.baseFields))
    setBaseVersion(state.baseVersion)
  }, [])

  const cleanupSubmittedDraft = useCallback(
    async (draft: QuickReportDraft, result: SubmitQuickReportResult): Promise<boolean> => {
      let removeFailed = false
      const submittedDraft = markDraftSubmitted(draft, result)

      await runDraftTask(async () => {
        try {
          await quickReportDraftRepository.write(submittedDraft)
        } catch {
          // A successful removal still prevents the stale draft from returning.
        }

        try {
          await quickReportDraftRepository.remove(DRAFT_CONTEXT)
        } catch {
          removeFailed = true
        }
      })

      return removeFailed
    },
    [runDraftTask],
  )

  const showConflict = useCallback(
    (draft: QuickReportDraft, current: QuickReportServerSnapshot) => {
      serverSnapshotRef.current = current
      setServerSnapshot(current)
      setConflict({
        draft,
        current,
        changedFields: getChangedFields(draft.fields, current.fields),
      })
      setPhase('CONFLICT')
      setSaveMessage(`检测到版本冲突：草稿 v${draft.baseVersion}，当前 v${current.version}`)
    },
    [],
  )

  const loadInitialState = useCallback(async () => {
    setPhase('LOADING')

    const [snapshot, draft] = await Promise.all([
      quickReportRepository.fetch(MATCH_ID),
      quickReportDraftRepository.read(DRAFT_CONTEXT),
    ])

    if (!isActiveRef.current) {
      needsRefreshRef.current = true
      return
    }

    const decision = getRestoreDecision(draft, snapshot.version)
    serverSnapshotRef.current = snapshot
    setServerSnapshot(snapshot)

    if (decision === 'RESTORE' && draft) {
      const restoredFields = cloneFields(draft.fields)
      setFields(restoredFields)
      setBaseFields(cloneFields(draft.baseFields))
      setBaseVersion(draft.baseVersion)
      fieldsRef.current = restoredFields
      baseFieldsRef.current = cloneFields(draft.baseFields)
      baseVersionRef.current = draft.baseVersion
      dirtyRef.current = true
      setSaveMessage(`已恢复 ${formatClock(draft.savedAt)} 的本地草稿`)
      setPhase('EDITING')
    } else if (decision === 'CONFLICT' && draft) {
      const restoredFields = cloneFields(draft.fields)
      setFields(restoredFields)
      setBaseFields(cloneFields(draft.baseFields))
      setBaseVersion(draft.baseVersion)
      fieldsRef.current = restoredFields
      baseFieldsRef.current = cloneFields(draft.baseFields)
      baseVersionRef.current = draft.baseVersion
      dirtyRef.current = true
      showConflict(draft, snapshot)
    } else if (decision === 'SUBMITTED' && draft) {
      applySnapshot(snapshot)
      dirtyRef.current = false
      setPhase('SUBMITTED')
      setSaveMessage(
        `已识别提交 ${draft.submissionId ?? ''}，服务端版本为 v${snapshot.version}，正在重试清理旧草稿`,
      )
      try {
        await runDraftTask(() => quickReportDraftRepository.remove(DRAFT_CONTEXT))
        setSaveMessage(`服务端已提交成功，旧草稿已清理（v${snapshot.version}）`)
      } catch {
        setSaveMessage(`服务端已提交成功（v${snapshot.version}），本地旧草稿将在下次恢复时重试清理`)
      }
    } else {
      applySnapshot(snapshot)
      dirtyRef.current = false
      setSaveMessage('暂无本地草稿')
      setPhase('EDITING')
    }

    readyRef.current = true
  }, [applySnapshot, runDraftTask, showConflict])

  useEffect(() => {
    void loadInitialState()
  }, [loadInitialState])

  useEffect(() => {
    if (
      !readyRef.current ||
      !dirtyRef.current ||
      phase === 'SUBMITTING' ||
      submissionInFlightRef.current
    ) {
      return
    }

    setSaveMessage('正在自动保存…')
    const timer = setTimeout(() => {
      void persistDraft()
    }, 650)

    return () => {
      clearTimeout(timer)
    }
  }, [fields, baseVersion, persistDraft, phase])

  useDidHide(() => {
    isActiveRef.current = false
    needsRefreshRef.current = true
    void persistDraft()
  })

  useDidShow(() => {
    isActiveRef.current = true

    if (!readyRef.current) {
      void loadInitialState()
      return
    }

    if (!needsRefreshRef.current) {
      return
    }

    needsRefreshRef.current = false
    void refreshAfterResume()
  })

  useUnload(() => {
    void persistDraft()
  })

  async function refreshAfterResume() {
    const current = await quickReportRepository.fetch(MATCH_ID)
    if (!isActiveRef.current) {
      needsRefreshRef.current = true
      return
    }

    const clientState = getCurrentClientState()
    if (!clientState) {
      applySnapshot(current)
      dirtyRef.current = false
      setPhase('EDITING')
      return
    }

    const decision = getResumeDecision(clientState, current)
    if (decision === 'CONFLICT') {
      showConflict(createCurrentDraft(), current)
      pendingPresentationRef.current = null
      return
    }

    if (decision === 'APPLY_SERVER') {
      applySnapshot(current)
      dirtyRef.current = false
    } else {
      serverSnapshotRef.current = current
      setServerSnapshot(current)
    }

    let pendingPresentation = pendingPresentationRef.current
    pendingPresentationRef.current = null
    if (pendingPresentation?.type === 'SUBMISSION_SUCCESS') {
      if (pendingPresentation.cleanupFailed) {
        try {
          await runDraftTask(() => quickReportDraftRepository.remove(DRAFT_CONTEXT))
          pendingPresentation = {
            ...pendingPresentation,
            cleanupFailed: false,
          }
        } catch {
          pendingPresentation = {
            ...pendingPresentation,
            cleanupFailed: true,
          }
        }
      }

      setPhase('SUBMITTED')
      setSaveMessage(createSubmissionSuccessMessage(pendingPresentation))
      await Taro.showToast({
        title: pendingPresentation.cleanupFailed ? '已提交，草稿待清理' : '提交成功',
        icon: pendingPresentation.cleanupFailed ? 'none' : 'success',
      })
      return
    }

    if (pendingPresentation?.type === 'NETWORK_FAILURE') {
      setPhase('NETWORK_ERROR')
      setSaveMessage('网络失败，输入已保存在本地草稿')
      await Taro.showToast({ title: '网络失败，草稿已保留', icon: 'none' })
      return
    }

    setPhase(clientState.dirty ? 'EDITING' : 'SUBMITTED')
    setSaveMessage('已从后台恢复并检查服务端版本')
  }

  function updateFields(updater: (current: QuickReportFields) => QuickReportFields) {
    if (submissionInFlightRef.current || phase === 'SUBMITTING') {
      return
    }

    dirtyRef.current = true
    setPhase('EDITING')
    setConflict(null)
    setFields((current) => {
      const next = updater(current)
      fieldsRef.current = next
      return next
    })
  }

  function updateScore(side: TeamSide, value: string) {
    const score = Math.max(0, Number.parseInt(value.replace(/\D/g, ''), 10) || 0)
    updateFields((current) => ({
      ...current,
      [side === 'HOME' ? 'homeScore' : 'awayScore']: score,
    }))
  }

  function addGoal() {
    const id = `goal-${Date.now()}-${goalSequenceRef.current}`
    goalSequenceRef.current += 1
    updateFields((current) => ({
      ...current,
      goals: [
        ...current.goals,
        {
          id,
          team: 'HOME',
          minute: 1,
          scorer: '',
        },
      ],
    }))
  }

  function updateGoal(id: string, patch: Partial<GoalEventDraft>) {
    updateFields((current) => ({
      ...current,
      goals: current.goals.map((goal) => (goal.id === id ? { ...goal, ...patch } : goal)),
    }))
  }

  function removeGoal(id: string) {
    updateFields((current) => ({
      ...current,
      goals: current.goals.filter((goal) => goal.id !== id),
    }))
  }

  async function submitReport() {
    if (!serverSnapshot || submissionInFlightRef.current || phase === 'SUBMITTING') {
      return
    }

    const invalidGoal = fields.goals.find((goal) => !goal.scorer.trim())
    if (invalidGoal) {
      await Taro.showToast({ title: '请补全进球球员', icon: 'none' })
      return
    }

    submissionInFlightRef.current = true
    try {
      dirtyRef.current = true
      await persistDraft()

      const confirmation = await Taro.showModal({
        title: '确认提交快速报告',
        content: `${serverSnapshot.homeTeamName} ${fields.homeScore} : ${fields.awayScore} ${serverSnapshot.awayTeamName}`,
        confirmText: '确认提交',
      })
      if (!confirmation.confirm) {
        return
      }

      const submittedDraft = createCurrentDraft()
      setPhase('SUBMITTING')
      setSaveMessage('正在提交报告…')

      const result = await quickReportRepository.submit({
        matchId: MATCH_ID,
        expectedVersion: submittedDraft.baseVersion,
        fields: cloneFields(submittedDraft.fields),
      })

      const currentState = getCurrentClientState()
      if (!currentState) {
        serverSnapshotRef.current = result.snapshot
        fieldsRef.current = cloneFields(result.snapshot.fields)
        baseFieldsRef.current = cloneFields(result.snapshot.fields)
        baseVersionRef.current = result.submittedVersion
        dirtyRef.current = false
      }

      const nextState = applySubmissionOutcome(
        currentState ?? {
          snapshot: result.snapshot,
          fields: result.snapshot.fields,
          baseFields: result.snapshot.fields,
          baseVersion: result.submittedVersion,
          dirty: false,
        },
        {
          type: 'SUCCESS',
          result,
        },
      )
      recordClientState(nextState)

      const cleanupFailed = await cleanupSubmittedDraft(submittedDraft, result)
      const presentation: PendingPresentation = {
        type: 'SUBMISSION_SUCCESS',
        cleanupFailed,
        result,
      }

      if (!isActiveRef.current) {
        pendingPresentationRef.current = presentation
        needsRefreshRef.current = true
        return
      }

      renderClientState(nextState)
      setConflict(null)
      setPhase('SUBMITTED')
      setSaveMessage(createSubmissionSuccessMessage(presentation))
      await Taro.showToast({
        title: cleanupFailed ? '已提交，草稿待清理' : '提交成功，草稿已删除',
        icon: cleanupFailed ? 'none' : 'success',
      })
    } catch (error) {
      if (error instanceof MockNetworkError) {
        const currentState = getCurrentClientState()
        if (currentState) {
          recordClientState(applySubmissionOutcome(currentState, { type: 'NETWORK_FAILURE' }))
        } else {
          dirtyRef.current = true
        }
        await persistDraft()

        if (!isActiveRef.current) {
          pendingPresentationRef.current = { type: 'NETWORK_FAILURE' }
          needsRefreshRef.current = true
          return
        }

        setPhase('NETWORK_ERROR')
        setSaveMessage('网络失败，输入已保存在本地草稿')
        await Taro.showToast({ title: '网络失败，草稿已保留', icon: 'none' })
        return
      }

      if (error instanceof MockVersionConflictError) {
        const draft = createCurrentDraft()
        await runDraftTask(() => quickReportDraftRepository.write(draft))

        if (!isActiveRef.current) {
          needsRefreshRef.current = true
          return
        }

        showConflict(draft, error.current)
        return
      }

      if (!isActiveRef.current) {
        needsRefreshRef.current = true
        return
      }

      setPhase('EDITING')
      setSaveMessage('提交失败，请稍后重试')
      await Taro.showToast({ title: '提交失败', icon: 'none' })
    } finally {
      submissionInFlightRef.current = false
    }
  }

  async function toggleNetworkFailure() {
    if (submissionInFlightRef.current || phase === 'SUBMITTING') {
      return
    }

    const nextMode: MockNetworkMode = networkMode === 'ONLINE' ? 'FAIL_SUBMIT' : 'ONLINE'
    quickReportRepository.setNetworkMode(nextMode)
    setNetworkMode(nextMode)
    await Taro.showToast({
      title: nextMode === 'FAIL_SUBMIT' ? '已模拟提交断网' : '网络已恢复',
      icon: 'none',
    })
  }

  async function toggleRemoveFailure() {
    if (submissionInFlightRef.current || phase === 'SUBMITTING') {
      return
    }

    const nextValue = !removeFailure
    quickReportDraftRepository.setRemoveFailure(nextValue)
    setRemoveFailure(nextValue)
    await Taro.showToast({
      title: nextValue ? '已模拟草稿删除失败' : '草稿删除已恢复',
      icon: 'none',
    })
  }

  async function simulateRemoteChange() {
    if (submissionInFlightRef.current || phase === 'SUBMITTING') {
      return
    }

    dirtyRef.current = true
    await persistDraft()
    setSaveMessage('正在模拟另一位信息员提交…')
    const current = await quickReportRepository.simulateRemoteChange(MATCH_ID)

    if (!isActiveRef.current) {
      needsRefreshRef.current = true
      return
    }

    const draft = createCurrentDraft()
    await quickReportDraftRepository.write(draft)
    showConflict(draft, current)
  }

  async function mergeConflict() {
    if (!conflict || submissionInFlightRef.current || phase === 'SUBMITTING') {
      return
    }

    const result = mergeNonConflictingChanges(
      conflict.draft.baseFields,
      conflict.draft.fields,
      conflict.current.fields,
    )
    const mergedFields = cloneFields(result.merged)
    const currentFields = cloneFields(conflict.current.fields)

    setFields(mergedFields)
    setBaseFields(currentFields)
    setBaseVersion(conflict.current.version)
    fieldsRef.current = mergedFields
    baseFieldsRef.current = currentFields
    baseVersionRef.current = conflict.current.version
    dirtyRef.current = true
    setConflict(null)
    setPhase('EDITING')

    const nextDraft = createCurrentDraft()
    await runDraftTask(() => quickReportDraftRepository.write(nextDraft))
    setSaveMessage(
      result.conflicts.length === 0
        ? '已合并双方修改，请复核后提交'
        : `已保留无冲突修改；${result.conflicts.map((field) => CONFLICT_LABELS[field]).join('、')}采用当前数据`,
    )
  }

  async function discardLocalChanges() {
    if (submissionInFlightRef.current || phase === 'SUBMITTING') {
      return
    }

    const current = conflict?.current ?? serverSnapshot
    if (!current) {
      return
    }

    const confirmation = await Taro.showModal({
      title: '丢弃本地草稿',
      content: '此操作会删除本地输入，并恢复为当前服务端数据。',
      confirmText: '确认丢弃',
      confirmColor: '#b33b31',
    })
    if (!confirmation.confirm) {
      return
    }

    applySnapshot(current)
    dirtyRef.current = false
    setConflict(null)
    setPhase('EDITING')
    setSaveMessage('本地草稿已删除')
    await runDraftTask(() => quickReportDraftRepository.remove(DRAFT_CONTEXT))
  }

  async function resetDemo() {
    if (submissionInFlightRef.current || phase === 'SUBMITTING') {
      return
    }

    const confirmation = await Taro.showModal({
      title: '重置 Spike 数据',
      content: '将清除本地草稿和 mock 服务端变更。',
      confirmText: '重置',
    })
    if (!confirmation.confirm) {
      return
    }

    quickReportDraftRepository.setRemoveFailure(false)
    setRemoveFailure(false)
    await runDraftTask(() => quickReportDraftRepository.remove(DRAFT_CONTEXT))
    const snapshot = await quickReportRepository.reset(MATCH_ID)
    applySnapshot(snapshot)
    dirtyRef.current = false
    setConflict(null)
    setNetworkMode('ONLINE')
    setPhase('EDITING')
    setSaveMessage('Spike 数据已重置')
  }

  if (!serverSnapshot) {
    return (
      <View className="report-page report-page--loading">
        <Text className="loading-title">正在准备快速报告</Text>
        <Text className="loading-copy">{saveMessage}</Text>
      </View>
    )
  }

  const interactionsLocked = phase === 'SUBMITTING'

  return (
    <View className="report-page">
      <View className="match-header">
        <View className="match-header__meta">
          <Text>快速报告 Spike</Text>
          <Text>服务端 v{baseVersion}</Text>
        </View>
        <View className="match-header__teams">
          <Text className="team-name">{serverSnapshot.homeTeamName}</Text>
          <Text className="match-versus">VS</Text>
          <Text className="team-name team-name--away">{serverSnapshot.awayTeamName}</Text>
        </View>
        <Text className={`save-state save-state--${phase.toLowerCase()}`}>{saveMessage}</Text>
      </View>

      <View className="scenario-panel">
        <View>
          <Text className="section-kicker">验证场景</Text>
          <Text className="scenario-copy">切换断网或制造远端更新，观察草稿与冲突处理。</Text>
        </View>
        <View className="scenario-actions">
          <Button
            className={`scenario-button ${networkMode === 'FAIL_SUBMIT' ? 'scenario-button--active' : ''}`}
            disabled={interactionsLocked}
            onClick={() => void toggleNetworkFailure()}
          >
            {networkMode === 'FAIL_SUBMIT' ? '恢复网络' : '模拟提交断网'}
          </Button>
          <Button
            className="scenario-button"
            disabled={interactionsLocked}
            onClick={() => void simulateRemoteChange()}
          >
            模拟他人提交
          </Button>
          <Button
            className={`scenario-button ${removeFailure ? 'scenario-button--active' : ''}`}
            disabled={interactionsLocked}
            onClick={() => void toggleRemoveFailure()}
          >
            {removeFailure ? '恢复草稿删除' : '模拟草稿删除失败'}
          </Button>
          <Button
            className="scenario-button scenario-button--quiet"
            disabled={interactionsLocked}
            onClick={() => void resetDemo()}
          >
            重置
          </Button>
        </View>
      </View>

      {conflict ? (
        <ConflictPanel
          conflict={conflict}
          disabled={interactionsLocked}
          onMerge={() => void mergeConflict()}
          onDiscard={() => void discardLocalChanges()}
        />
      ) : null}

      <View className="form-section">
        <View className="section-heading">
          <View>
            <Text className="section-kicker">01 比分</Text>
            <Text className="section-title">主客队比分</Text>
          </View>
          <Text className="required-mark">必填</Text>
        </View>

        <View className="score-board">
          <View className="score-side">
            <Text className="score-team">{serverSnapshot.homeTeamName}</Text>
            <Input
              className="score-input"
              type="number"
              value={String(fields.homeScore)}
              disabled={interactionsLocked}
              onInput={(event) => updateScore('HOME', event.detail.value)}
            />
          </View>
          <Text className="score-divider">:</Text>
          <View className="score-side">
            <Text className="score-team">{serverSnapshot.awayTeamName}</Text>
            <Input
              className="score-input"
              type="number"
              value={String(fields.awayScore)}
              disabled={interactionsLocked}
              onInput={(event) => updateScore('AWAY', event.detail.value)}
            />
          </View>
        </View>
      </View>

      <View className="form-section">
        <View className="section-heading">
          <View>
            <Text className="section-kicker">02 赛果</Text>
            <Text className="section-title">比赛状态或异常结果</Text>
          </View>
        </View>
        <View className="choice-grid">
          {OUTCOME_OPTIONS.map((option) => (
            <Button
              className={`choice-button ${fields.outcome === option.value ? 'choice-button--active' : ''}`}
              disabled={interactionsLocked}
              key={option.value}
              onClick={() =>
                updateFields((current) => ({
                  ...current,
                  outcome: option.value,
                }))
              }
            >
              {option.label}
            </Button>
          ))}
        </View>
      </View>

      <View className="form-section">
        <View className="section-heading">
          <View>
            <Text className="section-kicker">03 事件</Text>
            <Text className="section-title">进球事件</Text>
          </View>
          <Button className="add-button" disabled={interactionsLocked} onClick={addGoal}>
            + 添加
          </Button>
        </View>

        {fields.goals.length === 0 ? (
          <View className="empty-goals">
            <Text>暂无进球事件，可直接提交 0 : 0 或异常赛果。</Text>
          </View>
        ) : (
          <View className="goal-list">
            {fields.goals.map((goal, index) => (
              <View className="goal-card" key={goal.id}>
                <View className="goal-card__header">
                  <Text className="goal-card__title">
                    进球 {String(index + 1).padStart(2, '0')}
                  </Text>
                  <Button
                    className="remove-button"
                    disabled={interactionsLocked}
                    onClick={() => removeGoal(goal.id)}
                  >
                    删除
                  </Button>
                </View>
                <View className="team-toggle">
                  <Button
                    className={`team-toggle__button ${goal.team === 'HOME' ? 'team-toggle__button--active' : ''}`}
                    disabled={interactionsLocked}
                    onClick={() => updateGoal(goal.id, { team: 'HOME' })}
                  >
                    主队
                  </Button>
                  <Button
                    className={`team-toggle__button ${goal.team === 'AWAY' ? 'team-toggle__button--active' : ''}`}
                    disabled={interactionsLocked}
                    onClick={() => updateGoal(goal.id, { team: 'AWAY' })}
                  >
                    客队
                  </Button>
                </View>
                <View className="field-row">
                  <View className="field-block field-block--minute">
                    <Text className="field-label">分钟</Text>
                    <Input
                      className="text-input"
                      type="number"
                      value={String(goal.minute)}
                      disabled={interactionsLocked}
                      onInput={(event) =>
                        updateGoal(goal.id, {
                          minute: Math.max(1, Number.parseInt(event.detail.value, 10) || 1),
                        })
                      }
                    />
                  </View>
                  <View className="field-block">
                    <Text className="field-label">进球球员</Text>
                    <Input
                      className="text-input"
                      placeholder="例：7 号 陈昊"
                      value={goal.scorer}
                      disabled={interactionsLocked}
                      onInput={(event) => updateGoal(goal.id, { scorer: event.detail.value })}
                    />
                  </View>
                </View>
              </View>
            ))}
          </View>
        )}
      </View>

      <View className="form-section">
        <View className="section-heading">
          <View>
            <Text className="section-kicker">04 备注</Text>
            <Text className="section-title">现场补充说明</Text>
          </View>
          <Text className="character-count">{fields.notes.length}/300</Text>
        </View>
        <Textarea
          className="notes-input"
          maxlength={300}
          placeholder="记录中止原因、争议情况或待管理员复核的信息。"
          value={fields.notes}
          disabled={interactionsLocked}
          onInput={(event) =>
            updateFields((current) => ({
              ...current,
              notes: event.detail.value,
            }))
          }
        />
      </View>

      <View className="page-spacer" />
      <View className="action-bar">
        <Button
          className="discard-button"
          disabled={interactionsLocked}
          onClick={() => void discardLocalChanges()}
        >
          丢弃草稿
        </Button>
        <Button
          className="submit-button"
          disabled={phase === 'SUBMITTING' || phase === 'CONFLICT'}
          loading={phase === 'SUBMITTING'}
          onClick={() => void submitReport()}
        >
          {phase === 'SUBMITTING' ? '提交中' : '确认提交'}
        </Button>
      </View>
    </View>
  )
}

function ConflictPanel({
  conflict,
  disabled,
  onMerge,
  onDiscard,
}: {
  conflict: ConflictState
  disabled: boolean
  onMerge: () => void
  onDiscard: () => void
}) {
  const changedLabels = conflict.changedFields.map((field) => CONFLICT_LABELS[field])

  return (
    <View className="conflict-panel">
      <Text className="conflict-panel__eyebrow">409 VERSION CONFLICT</Text>
      <Text className="conflict-panel__title">当前数据已被其他人员更新</Text>
      <Text className="conflict-panel__copy">
        草稿基于 v{conflict.draft.baseVersion}，服务端现为 v{conflict.current.version}。
        {changedLabels.length > 0 ? `差异字段：${changedLabels.join('、')}。` : ''}
      </Text>
      <View className="comparison-grid">
        <ReportPreview title="我的提交" fields={conflict.draft.fields} tone="local" />
        <ReportPreview title="当前数据" fields={conflict.current.fields} tone="server" />
      </View>
      <View className="conflict-actions">
        <Button
          className="conflict-button conflict-button--primary"
          disabled={disabled}
          onClick={onMerge}
        >
          保留无冲突修改
        </Button>
        <Button className="conflict-button" disabled={disabled} onClick={onDiscard}>
          放弃本地修改
        </Button>
      </View>
      <Text className="conflict-panel__hint">
        双方都修改的字段不会自动覆盖；选择合并后采用当前数据，并保留仅在本地修改的字段。
      </Text>
    </View>
  )
}

function ReportPreview({
  title,
  fields,
  tone,
}: {
  title: string
  fields: QuickReportFields
  tone: 'local' | 'server'
}) {
  const outcome = OUTCOME_OPTIONS.find((option) => option.value === fields.outcome)?.label
  const goals =
    fields.goals.length === 0
      ? '无'
      : fields.goals
          .map(
            (goal) =>
              `${goal.team === 'HOME' ? '主' : '客'} ${goal.minute}' ${goal.scorer || '未填写'}`,
          )
          .join('；')

  return (
    <View className={`report-preview report-preview--${tone}`}>
      <Text className="report-preview__title">{title}</Text>
      <Text className="report-preview__score">
        {fields.homeScore} : {fields.awayScore}
      </Text>
      <Text className="report-preview__line">赛果：{outcome}</Text>
      <Text className="report-preview__line">进球：{goals}</Text>
      <Text className="report-preview__line">备注：{fields.notes || '无'}</Text>
    </View>
  )
}

function formatClock(iso: string): string {
  const date = new Date(iso)
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}:${String(date.getSeconds()).padStart(2, '0')}`
}

function createSubmissionSuccessMessage(
  presentation: Extract<PendingPresentation, { type: 'SUBMISSION_SUCCESS' }>,
): string {
  const { cleanupFailed, result } = presentation
  if (cleanupFailed) {
    return `服务端已提交成功（${result.submissionId}，v${result.submittedVersion}），本地草稿将在恢复时重试清理`
  }

  return `提交成功（${result.submissionId}），服务端版本已更新为 v${result.submittedVersion}`
}
