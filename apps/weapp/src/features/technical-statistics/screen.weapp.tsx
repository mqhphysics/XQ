import { Button, Picker, Text, View } from '@tarojs/components'
import { nativeBack } from '../native-navigation/index.weapp'
import { useMemo, useRef, useState } from 'react'
import { DataState } from '../../components/public-ui'
import { useNativePreferences } from '../../components/native-ui/preferences.weapp'
import { useNativeRefreshTask } from '../product/native-refresh.weapp'
import { useTechnicalRecorder } from './use-recorder.weapp'
import {
  TECHNICAL_METRICS,
  technicalId,
  technicalLabels,
  technicalState,
  technicalSummary,
  type TechnicalMetric,
  type TechnicalOutcome,
} from './repository.weapp'
import { NativeTechnicalSummary } from './summary.weapp'
import { NativeTechnicalBoard } from './board.weapp'
import './technical.weapp.scss'
export function NativeTechnicalScreen({ matchId }: { matchId: string }) {
  const recorder = useTechnicalRecorder(matchId),
    { workspace, error, busy, unsynced } = recorder
  const [side, setSide] = useState(0),
    [playerId, setPlayerId] = useState<string | null>(null),
    [metric, setMetric] = useState<TechnicalMetric>('PASS'),
    [mode, setMode] = useState<'board' | 'live' | 'summary'>('board')
  const { reduceMotion } = useNativePreferences(),
    feedbackId = useRef(0)
  const [feedback, setFeedback] = useState<{
    id: number
    kind: 'primary' | 'secondary' | 'special' | 'undo'
  } | null>(null)
  useNativeRefreshTask(recorder.refresh)
  const derived = useMemo(() => {
    if (!workspace || mode === 'board') return null
    const team = workspace.teams[side] || workspace.teams[0]!
    return {
      state: technicalState(workspace.operations),
      rows: technicalSummary(workspace.operations, team.id, playerId),
    }
  }, [workspace?.operations, workspace?.teams, side, playerId, mode])
  if (!workspace)
    return (
      <>
        <Button className="native-button native-button--quiet" onClick={() => void nativeBack()}>
          ‹ 返回
        </Button>
        <DataState
          kind={error ? 'error' : 'loading'}
          title={error ? '技术统计暂不可用' : '正在读取技术统计'}
          description={error}
          onRetry={recorder.refresh}
        />
      </>
    )
  if (mode === 'board') return <NativeTechnicalBoard recorder={recorder} onMode={setMode} />
  const team = workspace.teams[side] || workspace.teams[0]!,
    state = derived!.state,
    row = derived!.rows.find((x) => x.metric === metric)!
  const player = team.players.find((p) => p.id === playerId),
    names = [
      '全队（不指定球员）',
      ...team.players.map((p) => `${p.shirtNumber || '—'}号 · ${p.displayName}`),
    ]
  const base = () => ({ id: technicalId(), occurredAt: new Date().toISOString() })
  const count = (outcome: TechnicalOutcome, kind: 'primary' | 'secondary' | 'special') => {
    if (recorder.append({ ...base(), kind: 'COUNT', teamId: team.id, playerId, metric, outcome }))
      setFeedback({ id: ++feedbackId.current, kind })
  }
  const primary =
    metric === 'SHOT'
      ? { value: row.success, label: '射门（射正）', outcome: 'ON_TARGET' as const }
      : metric === 'FOUL'
        ? { value: row.total, label: '犯规', outcome: 'FOUL' as const }
        : {
            value: row.success,
            label: metric === 'CHANCE' ? '绝佳机会（创造）' : `${technicalLabels[metric]}（成功）`,
            outcome: 'SUCCESS' as const,
          }
  const secondary =
    metric === 'SHOT'
      ? { value: row.failure, label: '射门（射偏）', outcome: 'OFF_TARGET' as const }
      : metric === 'FOUL'
        ? { value: row.yellowCards, label: '犯规（黄牌）', outcome: 'YELLOW_CARD' as const }
        : {
            value: row.failure,
            label: metric === 'CHANCE' ? '机会（错失）' : `${technicalLabels[metric]}（失败）`,
            outcome: 'FAILURE' as const,
          }
  const special =
    metric === 'SHOT'
      ? { label: '进球', value: row.goals, outcome: 'GOAL' as const }
      : metric === 'FOUL'
        ? { label: '红牌', value: row.redCards, outcome: 'RED_CARD' as const }
        : null
  const flash = (kind: NonNullable<typeof feedback>['kind']) =>
    feedback?.kind === kind ? (
      <View key={feedback.id} className="native-technical__flash" aria-hidden />
    ) : null
  return (
    <View className={`native-technical${reduceMotion ? ' native-technical--reduced' : ''}`}>
      <Button className="native-button native-button--quiet" onClick={() => setMode('board')}>
        ‹ 全部项目同屏记录
      </Button>
      <View className="native-technical__heading">
        <Text>技术统计</Text>
        <Text>{workspace.teams.map((t) => t.shortName).join(' vs ')}</Text>
      </View>
      <View className="native-technical__sync">
        <View className={error ? 'is-warning' : unsynced ? 'is-pending' : 'is-saved'} />
        <Text>
          {unsynced
            ? `${unsynced} 项已存本机，${busy ? '正在同步' : '等待同步'}`
            : busy
              ? '正在同步'
              : '已同步云端'}
        </Text>
        <Button disabled={busy || !unsynced} onClick={() => void recorder.sync()}>
          重试同步
        </Button>
      </View>
      {error && (
        <View className="native-technical__error">
          <Text>{error}</Text>
          {unsynced > 0 && (
            <Button onClick={() => void recorder.discardPending()}>采用云端记录</Button>
          )}
        </View>
      )}
      {!workspace.canRecord && (
        <Text className="native-error">{workspace.reason || '当前不能记录'}</Text>
      )}
      <View className="native-technical__mode">
        {(['live', 'summary'] as const).map((value) => (
          <Button
            key={value}
            className={mode === value ? 'is-selected' : ''}
            onClick={() => setMode(value)}
          >
            {value === 'live' ? '实时记录' : '汇总填写'}
          </Button>
        ))}
      </View>
      <View className="native-technical__teams">
        {workspace.teams.map((t, i) => (
          <Button
            key={t.id}
            className={side === i ? 'is-selected' : ''}
            onClick={() => {
              setSide(i)
              setPlayerId(null)
            }}
          >
            {t.shortName}
          </Button>
        ))}
      </View>
      <Picker
        range={names}
        value={Math.max(0, team.players.findIndex((p) => p.id === playerId) + 1)}
        onChange={(e) => setPlayerId(team.players[Number(e.detail.value) - 1]?.id || null)}
      >
        <View className="native-technical__player">
          <Text>
            {player
              ? `${player.shirtNumber || '—'}号 · ${player.displayName}`
              : '全队 · 不指定球员'}
          </Text>
          <Text>选择球员⌄</Text>
        </View>
      </Picker>
      {mode === 'summary' ? (
        <NativeTechnicalSummary
          key={team.id + ':' + playerId}
          workspace={workspace}
          teamId={team.id}
          playerId={playerId}
          name={player?.displayName || team.name}
          onSave={(operation) => recorder.append(operation)}
        />
      ) : (
        <>
          <View className="native-technical__metrics">
            {TECHNICAL_METRICS.map((value) => (
              <Button
                key={value}
                className={metric === value ? 'is-selected' : ''}
                onClick={() => setMetric(value)}
              >
                {technicalLabels[value]}
              </Button>
            ))}
          </View>
          <View className="native-technical__totals">
            <Text>
              {metric === 'FOUL'
                ? `犯规 ${row.total} · 黄牌 ${row.yellowCards} · 红牌 ${row.redCards}`
                : metric === 'CHANCE'
                  ? `创造 ${row.success} · 错失 ${row.failure}`
                  : `共 ${row.total} 次${technicalLabels[metric]}`}
            </Text>
            <Text>
              {metric === 'SHOT'
                ? `进球 ${row.goals}（计入射正）`
                : metric === 'FOUL' || metric === 'CHANCE'
                  ? ''
                  : `成功 ${row.success} · 失败 ${row.failure}`}
            </Text>
          </View>
          <View className="native-technical__controls">
            <Button
              className="native-technical__primary"
              disabled={!workspace.canRecord}
              hoverClass="is-pressed"
              hoverStartTime={0}
              hoverStayTime={80}
              onClick={() => count(primary.outcome, 'primary')}
            >
              {flash('primary')}
              <Text className="native-technical__count">{primary.value}</Text>
              <Text>{primary.label}</Text>
              <Text className="native-technical__increment">点按 ＋1</Text>
            </Button>
            <View className="native-technical__minor">
              <Button
                className="native-technical__secondary"
                disabled={!workspace.canRecord}
                hoverClass="is-pressed"
                hoverStartTime={0}
                hoverStayTime={80}
                onClick={() => count(secondary.outcome, 'secondary')}
              >
                {flash('secondary')}
                <Text className="native-technical__count">{secondary.value}</Text>
                <Text>{secondary.label}</Text>
              </Button>
              {special && (
                <Button
                  className={`native-technical__special native-technical__special--${metric.toLowerCase()}`}
                  disabled={!workspace.canRecord}
                  hoverClass="is-pressed"
                  hoverStartTime={0}
                  onClick={() => count(special.outcome, 'special')}
                >
                  {flash('special')}
                  {special.label} ＋1
                </Button>
              )}
              <Button
                className="native-technical__undo"
                disabled={!workspace.canRecord || !state.undoTarget}
                hoverClass="is-pressed"
                hoverStartTime={0}
                onClick={() => {
                  if (
                    state.undoTarget &&
                    recorder.append({ ...base(), kind: 'UNDO', targetId: state.undoTarget })
                  )
                    setFeedback({ id: ++feedbackId.current, kind: 'undo' })
                }}
              >
                {flash('undo')}↶ 撤回
              </Button>
            </View>
          </View>
          <Text className="native-technical__instruction">
            {metric === 'SHOT'
              ? '每次射门只点一种结果；进球自动计入射正'
              : metric === 'FOUL'
                ? '犯规与黄、红牌分别计数'
                : '每次动作只点左、右其中一个'}
          </Text>
        </>
      )}
    </View>
  )
}
