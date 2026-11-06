import { Button, Input, Picker, Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useEffect, useRef, useState } from 'react'
import {
  FORMATIONS,
  assignPlayer,
  createFormation,
  fillByPosition,
  restoreDraft,
  selectSavedLineupPlan,
  type LineupDraft,
  type LineupPlayer,
} from '../../features/captain-roster/lineup.logic'
import {
  lineupPlanRepository,
  type LineupPlanView,
} from '../../features/captain-roster/lineup-plan.repository'
import { createClientActionId } from '../../features/product/product.repository'
import { NativePlayerPortrait } from '../../components/native-ui/match-lineups.weapp'
import { NativePlayerPicker } from './player-picker.weapp'
import { readSession } from '../../features/product/session'
import {
  readPendingLineup,
  submitPendingLineup,
  type PendingLineupSubmission,
} from '../../features/captain-roster/lineup-submission'
import { openPlayer } from '../../features/product/player-navigation'
import {
  compactNativeFormation,
  nativeLineupBackupKey,
  readNativeLineupBackup,
  nativeLineupName,
} from '../../features/captain-roster/lineup-native.logic.weapp'
import {
  confirmNativeDiscard,
  useNativeLeaveProtection,
} from '../../features/native-navigation/leave-guard.weapp'

export function NativeManageLineup({
  teamId,
  tournamentId,
  players,
}: {
  teamId: string
  tournamentId: string
  players: LineupPlayer[]
}) {
  const user = readSession()?.user
  const backupKey = user
    ? nativeLineupBackupKey(user.organizationId, user.id, teamId, tournamentId)
    : ''
  const clearBackup = () => {
    if (backupKey) Taro.removeStorageSync(backupKey)
  }
  const [selectingSlot, setSelectingSlot] = useState<string | null>(null)
  const [plans, setPlans] = useState<LineupPlanView[]>([]),
    [plan, setPlan] = useState<LineupPlanView | null>(null),
    [draft, setDraft] = useState<LineupDraft>(() =>
      compactNativeFormation(createFormation('3-2-2')),
    )
  const [name, setName] = useState('默认阵容'),
    [dirty, setDirty] = useState(false),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(''),
    [attempt, setAttempt] = useState(0),
    [conflict, setConflict] = useState(false),
    [waiting, setWaiting] = useState(false),
    [submissionError, setSubmissionError] = useState(false)
  const pending = useRef<PendingLineupSubmission | null>(null),
    saving = useRef(false)
  const submissionKey = backupKey + ':submission'
  const checkpoint = (command: PendingLineupSubmission) => {
    if (!backupKey) throw new Error('请先登录后保存阵容')
    Taro.setStorageSync(submissionKey, command)
    pending.current = command
    setWaiting(true)
  }
  const discard = () => {
    clearBackup()
    setDirty(false)
    setConflict(false)
    const saved = plans.find((p) => p.id === plan?.id)
    if (saved) restore(saved)
    else {
      setPlan(null)
      setDraft(compactNativeFormation(createFormation('3-2-2')))
      setName('默认阵容')
    }
  }
  useNativeLeaveProtection(dirty && !waiting, busy, discard, true)
  useEffect(() => {
    if (loading || !dirty || !backupKey) return
    try {
      const previous = readNativeLineupBackup(Taro.getStorageSync(backupKey))
      Taro.setStorageSync(backupKey, {
        schemaVersion: 1,
        planId: conflict ? previous?.planId || null : plan?.id || null,
        baseVersion: conflict ? previous?.baseVersion || 0 : plan?.version || 0,
        name,
        draft,
      })
    } catch {
      setError('本机草稿暂时无法保存，请在离开前保存阵容')
    }
  }, [draft, name, dirty, loading, backupKey, plan, conflict])
  const restore = (target: LineupPlanView) => {
    const restored = restoreDraft(
      {
        schemaVersion: 1,
        formation: target.payload.formation,
        name: target.name,
        custom: !FORMATIONS.some((f) => f.name === target.payload.formation),
        slots: target.payload.slots.map((s) => ({ ...s, id: s.slotId })),
        benchPlayerIds: target.payload.benchPlayerIds,
      },
      players,
    )
    if (!restored) {
      setError('阵容记录无法读取，请重新加载')
      return
    }
    setPlan(target)
    setDraft(compactNativeFormation(restored))
    setName(nativeLineupName(target.name))
    setDirty(false)
    setConflict(false)
    setError('')
  }
  useEffect(() => {
    let active = true
    setLoading(true)
    setSubmissionError(false)
    try {
      const stored = Taro.getStorageSync(submissionKey)
      pending.current = readPendingLineup(stored)
      setWaiting(Boolean(pending.current))
      if (stored && !pending.current)
        throw new Error('未确认提交记录无法读取，请保留本机数据并联系管理员')
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : '本机提交记录无法读取')
      setLoading(false)
      setSubmissionError(true)
      return
    }
    void lineupPlanRepository
      .list(teamId)
      .then((result) => {
        if (!active) return
        const tactics = result.items.filter((item) => item.kind === 'TACTIC')
        setPlans(tactics)
        setError('')
        const backup = backupKey ? readNativeLineupBackup(Taro.getStorageSync(backupKey)) : null
        const recovered = backup && restoreDraft(backup.draft, players)
        if (backup && recovered) {
          const source = tactics.find((p) => p.id === backup.planId)
          const changed = !!backup.planId && (!source || source.version !== backup.baseVersion)
          setPlan(source ? { ...source, version: backup.baseVersion } : null)
          setDraft(compactNativeFormation(recovered))
          setName(nativeLineupName(backup.name))
          setDirty(true)
          setConflict(changed)
          if (changed)
            setError('本机草稿已恢复，但云端阵容已更新。请另存为新阵容，或重新读取云端版本。')
        } else {
          const preferred = selectSavedLineupPlan(tactics, tournamentId, '')
          if (preferred) restore(preferred)
        }
      })
      .catch((issue: Error) => {
        if (active) setError(issue.message)
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [teamId, tournamentId, attempt])
  const change = (next: LineupDraft) => {
    setDraft(next)
    setDirty(true)
    setError('')
  }
  const persist = async (makeDefault = false) => {
    if (saving.current || loading || (conflict && !pending.current)) return
    saving.current = true
    setBusy(true)
    setError('')
    const token = readSession()?.accessToken
    try {
      if (!pending.current) {
        if (dirty || !plan) {
          const used = new Set(
            draft.slots.flatMap((slot) => (slot.playerId ? [slot.playerId] : [])),
          )
          checkpoint({
            phase: 'SAVE',
            key: createClientActionId('lineup'),
            defaultKey: makeDefault ? createClientActionId('lineup-default') : null,
            input: {
              ...(plan ? { planId: plan.id } : {}),
              name: name.trim() || '默认阵容',
              kind: 'TACTIC',
              expectedVersion: plan?.version || 0,
              tournamentId: plan?.tournamentId || null,
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
                benchPlayerIds: players
                  .filter((player) => !used.has(player.id))
                  .map((player) => player.id),
              },
            },
          })
        } else if (makeDefault) {
          checkpoint({ phase: 'DEFAULT', key: createClientActionId('lineup-default'), plan })
        } else return
      }
      const command = pending.current!
      const publishing = command.phase === 'DEFAULT' || Boolean(command.defaultKey)
      const result = await submitPendingLineup(
        command,
        {
          save: (input, key) => lineupPlanRepository.save(teamId, input, key),
          publish: (saved, key) =>
            lineupPlanRepository.publish(teamId, saved.id, 'DEFAULT', saved.version, key),
        },
        checkpoint,
      )
      if (readSession()?.accessToken !== token) return
      Taro.removeStorageSync(submissionKey)
      pending.current = null
      setWaiting(false)
      restore(result)
      setPlans((previous) => [
        ...previous
          .filter((item) => item.id !== result.id)
          .map((item) => (publishing ? { ...item, isDefault: false } : item)),
        result,
      ])
      setDirty(false)
      setConflict(false)
      clearBackup()
      void Taro.showToast({ title: publishing ? '已设为默认阵容' : '阵容已保存', icon: 'success' })
    } catch (issue) {
      const status = (issue as { statusCode?: number }).statusCode
      if (
        status &&
        status >= 400 &&
        status < 500 &&
        status !== 408 &&
        readSession()?.accessToken === token
      ) {
        // The server rejected this step; keep the editable draft and any successful save result.
        const saved = pending.current?.phase === 'DEFAULT' ? pending.current.plan : null
        try {
          Taro.removeStorageSync(submissionKey)
          pending.current = null
          setWaiting(false)
          if (saved) restore(saved)
          if (status === 409) setConflict(true)
        } catch {
          /* Retain the original request until its local record can be updated. */
        }
      }
      setError(issue instanceof Error ? issue.message : '保存结果未确认，请重试原操作')
    } finally {
      saving.current = false
      setBusy(false)
    }
  }
  if (submissionError)
    return (
      <View className="native-manage-card">
        <Text className="native-error">{error}</Text>
        <Button className="native-button" onClick={() => setAttempt((value) => value + 1)}>
          重试读取本机提交记录
        </Button>
      </View>
    )
  if (waiting)
    return (
      <View className="native-manage-card">
        <Text className="native-note">
          上次提交的结果尚未确认，本机已保留原操作。请先重试确认，再继续编辑。
        </Text>
        {error && <Text className="native-error">{error}</Text>}
        <Button
          className="native-button native-button--primary"
          loading={busy}
          disabled={busy || loading}
          onClick={() => void persist()}
        >
          重试原提交
        </Button>
      </View>
    )
  return (
    <View className="native-manage-card">
      {loading && <Text className="native-note">正在读取阵容</Text>}
      {error && (
        <>
          <Text className="native-error">{error}</Text>
          <Button
            className="native-button"
            disabled={busy}
            onClick={async () => {
              if (await confirmNativeDiscard(dirty, busy)) {
                clearBackup()
                setDirty(false)
                setAttempt((n) => n + 1)
              }
            }}
          >
            重新读取
          </Button>
        </>
      )}
      {conflict && (
        <Button
          className="native-button"
          onClick={() => {
            setPlan(null)
            setConflict(false)
            setError('')
            setDirty(true)
          }}
        >
          另存为新阵容
        </Button>
      )}
      <View className="native-lineup-choice-row">
        <Text className="native-manage-title">球队阵容</Text>
        <Picker
          range={['新建阵容', ...plans.map((p) => nativeLineupName(p.name))]}
          value={plan ? plans.findIndex((p) => p.id === plan.id) + 1 : 0}
          disabled={busy || loading}
          onChange={async (e) => {
            if (!(await confirmNativeDiscard(dirty, busy))) return
            clearBackup()
            setConflict(false)
            const next = plans[Number(e.detail.value) - 1]
            if (next) restore(next)
            else {
              setPlan(null)
              setDraft(compactNativeFormation(createFormation('3-2-2')))
              setName('默认阵容')
              setDirty(false)
            }
          }}
        >
          <View className="native-select native-lineup-choice">
            <Text>{plan ? nativeLineupName(plan.name) : '新建阵容'}</Text>
            <View className="native-select__chevron" />
          </View>
        </Picker>
      </View>
      <View className="native-lineup-edit-row">
        <View className="native-lineup-name-field">
          <Text className="native-label">阵容名称</Text>
          <Input
            className="native-field"
            disabled={busy || loading}
            value={name}
            maxlength={60}
            onInput={(e) => {
              setName(e.detail.value)
              setDirty(true)
            }}
          />
        </View>
        <View className="native-lineup-formation-field">
          <Text className="native-label">阵型</Text>
          <Picker
            range={FORMATIONS.map((f) => f.name)}
            disabled={busy || loading}
            value={Math.max(
              0,
              FORMATIONS.findIndex((f) => f.name === draft.formation),
            )}
            onChange={(e) =>
              change(
                compactNativeFormation(
                  createFormation(FORMATIONS[Number(e.detail.value)]!.name, draft),
                ),
              )
            }
          >
            <View className="native-select">
              <Text>{draft.formation}</Text>
              <View className="native-select__chevron" />
            </View>
          </Picker>
        </View>
      </View>
      <View className="native-manage-lineup-pitch" style="margin-top:20rpx;">
        <View className="native-pitch-border" />
        <View className="native-pitch-midline" />
        <View className="native-pitch-circle" />
        <View className="native-pitch-penalty native-pitch-penalty--top" />
        <View className="native-pitch-penalty native-pitch-penalty--bottom" />
        <View className="native-pitch-goal native-pitch-goal--top" />
        <View className="native-pitch-goal native-pitch-goal--bottom" />
        {draft.slots.map((slot) => {
          const player = players.find((p) => p.id === slot.playerId)
          return (
            <Button
              key={slot.id}
              className="native-manage-slot"
              style={`left:${slot.x}%;top:${slot.y}%;`}
              disabled={busy || loading}
              onClick={() => setSelectingSlot(slot.id)}
            >
              <View>
                <NativePlayerPortrait
                  player={player || { shirtNumber: null }}
                  color="#254a37"
                  keeper={slot.label === 'GK'}
                  empty={!player}
                />
                {player && <Text className="native-manage-slot__name">{player.displayName}</Text>}
              </View>
            </Button>
          )
        })}
      </View>
      {dirty && !error && (
        <Text className="native-note native-lineup-save-note">
          修改已保留在本机，切到其他应用后可继续编辑
        </Text>
      )}
      <View className="native-manage-toolbar">
        <Button
          className="native-button"
          disabled={busy || loading || !players.length}
          onClick={() => change(fillByPosition(draft, players))}
        >
          按位置补全
        </Button>
        <Button
          className="native-button"
          disabled={busy || loading || conflict}
          onClick={() => void persist(true)}
        >
          设为默认阵容
        </Button>
      </View>
      <Button
        className="native-button native-button--primary"
        loading={busy}
        disabled={busy || loading || conflict}
        onClick={() => void persist()}
      >
        保存阵容
      </Button>
      {selectingSlot && (
        <NativePlayerPicker
          players={players}
          selectedId={draft.slots.find((slot) => slot.id === selectingSlot)?.playerId || null}
          onClose={() => setSelectingSlot(null)}
          onInspect={(id) => {
            setSelectingSlot(null)
            void openPlayer(id, tournamentId)
          }}
          onConfirm={(id) => {
            change(
              id
                ? assignPlayer(draft, id, selectingSlot)
                : {
                    ...draft,
                    slots: draft.slots.map((slot) =>
                      slot.id === selectingSlot ? { ...slot, playerId: null } : slot,
                    ),
                  },
            )
            setSelectingSlot(null)
          }}
        />
      )}
    </View>
  )
}
