import { Button, Input, Picker, Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useEffect, useState } from 'react'
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
import { openPlayer } from '../../features/product/player-navigation'
import {
  compactNativeFormation,
  nativeLineupBackupKey,
  readNativeLineupBackup,
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
  const [name, setName] = useState('球队主阵容'),
    [dirty, setDirty] = useState(false),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(''),
    [attempt, setAttempt] = useState(0),
    [conflict, setConflict] = useState(false)
  const discard = () => {
    clearBackup()
    setDirty(false)
    setConflict(false)
    const saved = plans.find((p) => p.id === plan?.id)
    if (saved) restore(saved)
    else {
      setPlan(null)
      setDraft(compactNativeFormation(createFormation('3-2-2')))
      setName('球队主阵容')
    }
  }
  useNativeLeaveProtection(dirty, busy, discard, true)
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
    setName(target.name)
    setDirty(false)
    setConflict(false)
    setError('')
  }
  useEffect(() => {
    let active = true
    setLoading(true)
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
          setName(backup.name)
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
    if (busy || loading || conflict) return
    setBusy(true)
    setError('')
    try {
      const used = new Set(draft.slots.flatMap((s) => (s.playerId ? [s.playerId] : [])))
      let saved = plan
      if (dirty || !saved) {
        saved = await lineupPlanRepository.save(
          teamId,
          {
            ...(plan ? { planId: plan.id } : {}),
            name: name.trim() || '球队主阵容',
            kind: 'TACTIC',
            expectedVersion: plan?.version || 0,
            tournamentId: plan?.tournamentId || null,
            matchId: null,
            rosterSnapshotId: null,
            payload: {
              formation: draft.formation,
              format: 8,
              slots: draft.slots.map((s) => ({
                slotId: s.id,
                label: s.label,
                x: s.x,
                y: s.y,
                playerId: s.playerId,
              })),
              benchPlayerIds: players.filter((p) => !used.has(p.id)).map((p) => p.id),
            },
          },
          createClientActionId('lineup'),
        )
        const persisted = saved
        setPlan(persisted)
        setPlans((previous) => [...previous.filter((p) => p.id !== persisted.id), persisted])
        setDirty(false)
        clearBackup()
      }
      if (makeDefault)
        saved = await lineupPlanRepository.publish(
          teamId,
          saved.id,
          'DEFAULT',
          saved.version,
          createClientActionId('lineup-default'),
        )
      const result = saved
      setPlan(result)
      setPlans((prev) => [
        ...prev
          .filter((p) => p.id !== result.id)
          .map((p) => (makeDefault ? { ...p, isDefault: false } : p)),
        result,
      ])
      setDirty(false)
      clearBackup()
      void Taro.showToast({ title: makeDefault ? '已设为默认阵容' : '阵容已保存', icon: 'success' })
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : '阵容保存失败')
    } finally {
      setBusy(false)
    }
  }
  return (
    <View className="native-manage-card">
      <Text className="native-manage-title">球队阵容</Text>
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
      {dirty && !error && (
        <Text className="native-note">修改已保留在本机，切到其他应用后可继续编辑</Text>
      )}
      <Picker
        range={['新建阵容', ...plans.map((p) => `${p.name}${p.isDefault ? ' · 默认' : ''}`)]}
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
            setName('球队主阵容')
            setDirty(false)
          }
        }}
      >
        <View className="native-select">
          {plan ? `${plan.name}${plan.isDefault ? ' · 默认' : ''}` : '新建阵容'}
          <View className="native-select__chevron" />
        </View>
      </Picker>
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
          阵型 {draft.formation}
          <View className="native-select__chevron" />
        </View>
      </Picker>
      <Text className="native-note">点击球场上的位置选择球员 · {players.length} 名可用球员</Text>
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
