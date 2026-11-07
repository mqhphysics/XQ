import { Button, Input, Picker, Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useRef, useState } from 'react'
import { recordingComplete } from '@xiaoqiu/contracts'
import type { WriteMatchReportDto } from '../../../../../packages/api-client/src/generated/index'
import { NativeDialog } from '../../components/native-ui/index.weapp'
import { readSession } from '../product/session'
import { productRepository } from '../product/product.repository'
import type { MatchExperienceResponse } from '../product/product.types'
import {
  nativeReportApi,
  reportId,
  type ReportWorkspace,
  type ReportFields,
  type ReportEvent,
} from './repository.weapp'
import { resizeGoals, creditedSide } from './form.logic'
import './editor.weapp.scss'
const labels = {
  GOAL: '进球',
  OWN_GOAL: '乌龙球',
  YELLOW_CARD: '黄牌',
  RED_CARD: '红牌',
  SUBSTITUTION: '换人',
}
type Draft = { baseVersion: number; fields: ReportFields; pending: WriteMatchReportDto | null }
function initial(match: MatchExperienceResponse, ws: ReportWorkspace): ReportFields {
  const f = ws.latest?.fields
  const fields: ReportFields = {
    homeScore: f?.homeScore ?? (match.homeScore === null ? '' : String(match.homeScore)),
    awayScore: f?.awayScore ?? (match.awayScore === null ? '' : String(match.awayScore)),
    homePenaltyScore:
      f?.homePenaltyScore ??
      (match.homePenaltyScore === null ? '' : String(match.homePenaltyScore)),
    awayPenaltyScore:
      f?.awayPenaltyScore ??
      (match.awayPenaltyScore === null ? '' : String(match.awayPenaltyScore)),
    outcome: f?.outcome || 'FINISHED',
    notes: f?.notes || '',
    events: f
      ? f.events.map((e) => ({ ...e }))
      : match.events
          .filter((e) => e.type in labels)
          .map((e) => ({
            clientEventId: e.id,
            kind: e.type as ReportEvent['kind'],
            side: e.team.id === match.homeTeam?.id ? 'HOME' : 'AWAY',
            minute: String(e.minute),
            addedMinute: e.stoppageMinute === null ? '' : String(e.stoppageMinute),
            playerId: e.player?.id || '',
            relatedPlayerId: e.relatedPlayer?.id || '',
          })),
  }
  return resizeGoals(
    resizeGoals(fields, 'HOME', fields.homeScore, reportId),
    'AWAY',
    fields.awayScore,
    reportId,
  )
}
export function NativeMatchReportEntry({
  match,
  onUpdated,
  compact = false,
}: {
  match: MatchExperienceResponse
  onUpdated: (m: MatchExperienceResponse) => void
  compact?: boolean
}) {
  const [open, setOpen] = useState(false),
    [workspace, setWorkspace] = useState<ReportWorkspace | null>(null),
    [fields, setFields] = useState<ReportFields | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [reason, setReason] = useState(''),
    [waiting, setWaiting] = useState(false)
  const lock = useRef(false),
    pending = useRef<WriteMatchReportDto | null>(null)
  const user = readSession()?.user,
    key = user ? `xiaoqiu.report.native-draft.v1:${user.organizationId}:${user.id}:${match.id}` : ''
  const store = (
    f: ReportFields,
    command: WriteMatchReportDto | null = null,
    version = workspace?.reportVersion || 0,
  ) => {
    if (key)
      Taro.setStorageSync(key, {
        baseVersion: version,
        fields: f,
        pending: command,
      } satisfies Draft)
  }
  const load = async (clear = false) => {
    if (lock.current) return
    lock.current = true
    setOpen(true)
    setBusy(true)
    setError('')
    setFields(null)
    pending.current = null
    setWaiting(false)
    try {
      let ws = await nativeReportApi.load(match.id)
      setWorkspace(ws)
      let draft: Draft | undefined = key ? Taro.getStorageSync<Draft>(key) : undefined
      if (clear) {
        if (key) Taro.removeStorageSync(key)
        draft = undefined
      }
      if (draft?.pending) {
        pending.current = draft.pending
        setFields(draft.fields)
        setWaiting(true)
        return
      }
      if (!ws.inline?.canStart) {
        setError(ws.blockingReasons?.[0] || '本场记录已锁定，请按原流程申请修改')
        return
      }
      if (draft && draft.baseVersion !== ws.reportVersion) {
        setError('云端记录已更新，本机草稿已保留。可核对后读取云端版本。')
        return
      }
      ws = await nativeReportApi.begin(match.id)
      if (!ws.editorToken) throw Error('未取得编辑凭据，请重试')
      setWorkspace(ws)
      const next = draft?.fields || initial(match, ws)
      setFields(next)
      store(next, null, ws.reportVersion || 0)
    } catch (e) {
      setError(e instanceof Error ? e.message : '读取录入信息失败')
    } finally {
      lock.current = false
      setBusy(false)
    }
  }
  const edit = (next: ReportFields) => {
    if (lock.current || pending.current) return
    try {
      store(next)
      setFields(next)
      setError('')
    } catch {
      setError('本机草稿暂时无法保存，请稍后重试')
    }
  }
  const patch = (event: ReportEvent, value: Partial<ReportEvent>) =>
    fields &&
    edit({
      ...fields,
      events: fields.events.map((e) =>
        e.clientEventId === event.clientEventId ? { ...e, ...value } : e,
      ),
    })
  const save = async (action: 'SAVE_SCORE' | 'COMPLETE') => {
    if (!fields || !workspace || lock.current) return
    if (
      !pending.current &&
      action === 'COMPLETE' &&
      !recordingComplete(fields.homeScore, fields.awayScore, fields.events)
    ) {
      setError('请补齐双方比分、每个进球的球员和分钟，并核对进球数与比分一致')
      return
    }
    const command = pending.current || {
      clientActionId: reportId(),
      action,
      expectedVersion: workspace.reportVersion || 0,
      ...(workspace.editorToken ? { editorToken: workspace.editorToken } : {}),
      reason: '信息管理员录入比赛信息',
      fields,
      homeRosterSnapshotId: workspace.homeTeam.rosterSnapshotId!,
      awayRosterSnapshotId: workspace.awayTeam.rosterSnapshotId!,
      ruleVersionId: workspace.ruleVersionId!,
    }
    if (command.action !== action) return
    lock.current = true
    setBusy(true)
    setError('')
    pending.current = command
    setWaiting(true)
    try {
      store(fields, command)
      await nativeReportApi.save(match.id, command)
      pending.current = null
      setWaiting(false)
      if (key) Taro.removeStorageSync(key)
      setOpen(false)
      void Taro.showToast({
        title: action === 'COMPLETE' ? '录入已完成' : '比分已保存，可继续补全',
        icon: 'none',
      })
      void productRepository
        .getMatch(match.id)
        .then(onUpdated)
        .catch(() => {
          void Taro.showToast({ title: '已保存，比赛页暂时未刷新', icon: 'none' })
        })
    } catch (e) {
      const status = (e as { statusCode?: number }).statusCode
      if (status && status < 500) {
        pending.current = null
        setWaiting(false)
        store(fields)
      }
      setError(e instanceof Error ? e.message : '保存结果未确认，请重试原操作')
    } finally {
      lock.current = false
      setBusy(false)
    }
  }
  const replace = async () => {
    if (
      (
        await Taro.showModal({
          title: '读取云端版本',
          content: '将使用云端版本替换这场比赛的本机草稿，继续吗？',
          confirmText: '读取云端',
          cancelText: '保留草稿',
        })
      ).confirm
    )
      await load(true)
  }
  return (
    <>
      <Button
        className={
          compact
            ? 'native-recording-tool'
            : 'native-button native-button--primary native-match-report-entry'
        }
        loading={busy}
        disabled={busy}
        onClick={() => void load()}
      >
        {compact && <View className="native-recording-tool__pen" aria-hidden />}
        <Text>{compact ? '录入信息' : '录入比赛信息'}</Text>
      </Button>
      {open && (
        <NativeDialog
          title="录入比赛信息"
          compact={false}
          busy={busy}
          onClose={() => setOpen(false)}
          footer={
            fields ? (
              <>
                <Button
                  className="native-button"
                  disabled={busy || (waiting && pending.current?.action !== 'SAVE_SCORE')}
                  onClick={() => void save('SAVE_SCORE')}
                >
                  保存比分
                </Button>
                <Button
                  className="native-button native-button--primary"
                  disabled={busy || (waiting && pending.current?.action !== 'COMPLETE')}
                  onClick={() => void save('COMPLETE')}
                >
                  {waiting ? '重试原保存' : '完成录入'}
                </Button>
              </>
            ) : undefined
          }
        >
          {error && <Text className="native-error">{error}</Text>}
          {!fields && (
            <Button className="native-button" disabled={busy} onClick={() => void replace()}>
              读取云端版本
            </Button>
          )}
          {!fields && workspace?.inline?.editor && workspace.inline.completed && (
            <>
              <Input
                className="native-field"
                placeholder="修改原因"
                value={reason}
                maxlength={240}
                onInput={(e) => setReason(e.detail.value)}
              />
              <Button
                className="native-button"
                disabled={busy || reason.trim().length < 2}
                onClick={() => {
                  setBusy(true)
                  void nativeReportApi
                    .requestChange(match.id, reason.trim())
                    .then((ws) => {
                      setWorkspace(ws)
                      setError('修改申请已提交')
                    })
                    .catch((e) => setError(e.message))
                    .finally(() => setBusy(false))
                }}
              >
                申请修改
              </Button>
            </>
          )}
          {fields && workspace && (
            <View className="native-report-form">
              <View className="native-report-score-row">
                {(['HOME', 'AWAY'] as const).map((side) => (
                  <View key={side}>
                    <Text>
                      {side === 'HOME' ? workspace.homeTeam.name : workspace.awayTeam.name}
                    </Text>
                    <Input
                      className="native-field"
                      type="number"
                      maxlength={2}
                      placeholder="比分"
                      value={side === 'HOME' ? fields.homeScore : fields.awayScore}
                      disabled={busy || waiting}
                      onInput={(e) =>
                        edit(
                          resizeGoals(
                            fields,
                            side,
                            e.detail.value.replace(/\D/g, '').slice(0, 2),
                            reportId,
                          ),
                        )
                      }
                    />
                  </View>
                ))}
              </View>
              {workspace.isKnockout && (
                <View className="native-report-penalty">
                  {(['HOME', 'AWAY'] as const).map((side) => (
                    <Input
                      key={side}
                      className="native-field"
                      type="number"
                      maxlength={2}
                      placeholder={side === 'HOME' ? '主队点球（选填）' : '客队点球（选填）'}
                      value={side === 'HOME' ? fields.homePenaltyScore : fields.awayPenaltyScore}
                      disabled={busy || waiting}
                      onInput={(e) =>
                        edit({
                          ...fields,
                          [side === 'HOME' ? 'homePenaltyScore' : 'awayPenaltyScore']:
                            e.detail.value.replace(/\D/g, '').slice(0, 2),
                        })
                      }
                    />
                  ))}
                </View>
              )}
              {fields.events.map((event, index) => {
                const team = event.side === 'HOME' ? workspace.homeTeam : workspace.awayTeam,
                  players = team.players,
                  beneficiary =
                    creditedSide(event) === 'HOME' ? workspace.homeTeam : workspace.awayTeam
                return (
                  <View className="native-report-event" key={event.clientEventId}>
                    <View className="native-report-event-heading">
                      <Text>
                        {beneficiary.name} · {labels[event.kind]} {index + 1}
                      </Text>
                      {(event.kind === 'GOAL' || event.kind === 'OWN_GOAL') && (
                        <Picker
                          range={['进球', '乌龙球']}
                          value={event.kind === 'OWN_GOAL' ? 1 : 0}
                          disabled={busy || waiting}
                          onChange={(e) => {
                            const own = Number(e.detail.value) === 1,
                              credit = creditedSide(event)
                            patch(event, {
                              kind: own ? 'OWN_GOAL' : 'GOAL',
                              side: own ? (credit === 'HOME' ? 'AWAY' : 'HOME') : credit,
                              playerId: '',
                              relatedPlayerId: '',
                            })
                          }}
                        >
                          <View className="native-select">
                            <Text>{labels[event.kind]}</Text>
                            <View className="native-select__chevron" />
                          </View>
                        </Picker>
                      )}
                    </View>
                    <View className="native-report-event-clock">
                      <Input
                        className="native-field"
                        type="number"
                        maxlength={3}
                        placeholder="分钟"
                        value={event.minute}
                        disabled={busy || waiting}
                        onInput={(e) =>
                          patch(event, { minute: e.detail.value.replace(/\D/g, '').slice(0, 3) })
                        }
                      />
                      <Text>+</Text>
                      <Input
                        className="native-field"
                        type="number"
                        maxlength={2}
                        placeholder="补时"
                        value={event.addedMinute}
                        disabled={busy || waiting}
                        onInput={(e) =>
                          patch(event, {
                            addedMinute: e.detail.value.replace(/\D/g, '').slice(0, 2),
                          })
                        }
                      />
                    </View>
                    <Picker
                      range={[
                        '选择球员',
                        ...players.map((p) => `${p.shirtNumber || '—'} · ${p.displayName}`),
                      ]}
                      value={Math.max(0, players.findIndex((p) => p.id === event.playerId) + 1)}
                      disabled={busy || waiting}
                      onChange={(e) => {
                        const id = players[Number(e.detail.value) - 1]?.id || ''
                        patch(event, {
                          playerId: id,
                          relatedPlayerId:
                            event.relatedPlayerId === id ? '' : event.relatedPlayerId,
                        })
                      }}
                    >
                      <View className="native-select">
                        <Text>
                          {players.find((p) => p.id === event.playerId)?.displayName || '选择球员'}
                        </Text>
                        <View className="native-select__chevron" />
                      </View>
                    </Picker>
                    {(event.kind === 'GOAL' || event.kind === 'SUBSTITUTION') && (
                      <Picker
                        range={[
                          event.kind === 'GOAL' ? '助攻（选填）' : '选择换上球员',
                          ...players.map((p) => p.displayName),
                        ]}
                        value={Math.max(
                          0,
                          players.findIndex((p) => p.id === event.relatedPlayerId) + 1,
                        )}
                        disabled={busy || waiting}
                        onChange={(e) =>
                          patch(event, {
                            relatedPlayerId: players[Number(e.detail.value) - 1]?.id || '',
                          })
                        }
                      >
                        <View className="native-select">
                          <Text>
                            {players.find((p) => p.id === event.relatedPlayerId)?.displayName ||
                              (event.kind === 'GOAL' ? '助攻（选填）' : '选择换上球员')}
                          </Text>
                          <View className="native-select__chevron" />
                        </View>
                      </Picker>
                    )}
                  </View>
                )
              })}
            </View>
          )}
        </NativeDialog>
      )}
    </>
  )
}
