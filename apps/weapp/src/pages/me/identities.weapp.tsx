import { Button, Input, Picker, Text, Textarea, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  guidePlayerEvent,
  type GuidePlayerCommand,
} from '../../features/getting-started/flow.logic.weapp'
import { NativeDialog } from '../../components/native-ui/index.weapp'
import { productRepository, createClientActionId } from '../../features/product/product.repository'
import { readSession } from '../../features/product/session'
import {
  selfPlayerProfile,
  type SelfPlayerProfile,
} from '../../features/product/self-player-profile.h5'
import { campusRepository, type ReporterQuality } from '../../features/campus/campus.repository.h5'
import { NativePlayerMedia } from '../../components/native-ui/player-media.weapp'
import { NativeReporterMatches } from '../../features/technical-statistics/entry.weapp'
import type { AuthUser, PlayerDetailResponse } from '../../features/product/product.types'
import { nativeIdentityKinds, type NativeIdentityKind } from './identity-panels.logic.weapp'
import { openPlayer } from '../../features/product/player-navigation'
import './profile.weapp.scss'
import { NativePlayerFace } from '../../components/native-ui/player-face.weapp'
import { positionLabel } from '../../features/product/product.format.weapp'
import { useNativePreferences } from '../../components/native-ui/preferences.weapp'
import { qualityChanges, type QualitySeen } from './reporter-quality.logic'

export function NativeMyIdentities({
  user,
  tournamentId,
  onClose,
}: {
  user: AuthUser
  tournamentId: string
  onClose: () => void
}) {
  const [kinds, setKinds] = useState(() => nativeIdentityKinds(user))
  const [selected, setSelected] = useState<NativeIdentityKind | null>(
    () => nativeIdentityKinds(user)[0] || null,
  )
  const [error, setError] = useState('')
  const [identityPlayer, setIdentityPlayer] = useState<PlayerDetailResponse | null>(null)
  useEffect(() => {
    let active = true
    setIdentityPlayer(null)
    if (user.linkedPlayer)
      void productRepository
        .getPlayer(user.linkedPlayer.id, tournamentId)
        .then((player) => {
          if (active) setIdentityPlayer(player)
        })
        .catch(() => {
          if (active) setError('球员资料暂未刷新，可关闭后重试')
        })
    return () => {
      active = false
    }
  }, [user.linkedPlayer?.id, tournamentId])
  useEffect(() => {
    let current = true
    void productRepository
      .getBadgePreference()
      .then((data) => {
        if (!current) return
        const available = nativeIdentityKinds(user, data.availableKinds)
        setKinds(available)
        setSelected((kind) => (kind && available.includes(kind) ? kind : available[0] || null))
      })
      .catch(() => {
        if (current) setError('身份信息暂未刷新，可关闭后重试')
      })
    return () => {
      current = false
    }
  }, [user.id, user.organizationId])
  return (
    <NativeDialog
      title={kinds.length === 1 ? (kinds[0] === 'player' ? '球员身份' : '信息管理员') : '我的身份'}
      compact={selected === 'player'}
      bodyHeight={selected === 'player' ? 210 : 380}
      onClose={onClose}
    >
      {kinds.length > 1 && (
        <View className="native-identity-tabs">
          {kinds.map((kind) => (
            <Button
              key={kind}
              className={selected === kind ? 'is-active' : ''}
              onClick={() => setSelected(kind)}
            >
              {kind === 'player' ? '球员' : '信息管理员'}
            </Button>
          ))}
        </View>
      )}
      {error && <Text className="native-note">{error}</Text>}
      {!kinds.length && <Text className="native-note">暂无已启用身份</Text>}
      {selected === 'player' &&
        (user.linkedPlayer ? (
          <>
            <View className="native-identity-player-summary">
              <NativePlayerFace
                playerId={user.linkedPlayer.id}
                tournamentId={tournamentId}
                avatarUrl={identityPlayer?.avatarUrl ?? null}
                portraitUrl={identityPlayer?.portraitUrl ?? null}
                preferProvided
                useSessionAvatar={false}
                name={identityPlayer?.displayName || user.linkedPlayer.displayName}
                large
              />
              <View>
                <Text className="native-identity-player-summary__name">
                  {identityPlayer?.displayName || user.linkedPlayer.displayName}
                </Text>
                <Text>{positionLabel(user.linkedPlayer.position)}</Text>
              </View>
            </View>
            <Button
              className="native-button native-button--primary"
              onClick={() => {
                onClose()
                void openPlayer(user.linkedPlayer!.id, tournamentId)
              }}
            >
              查看我的球员主页
            </Button>
          </>
        ) : (
          <Text className="native-note">暂无关联球员档案</Text>
        ))}
      {selected === 'reporter' && (
        <>
          <NativeReporterMatches tournamentId={tournamentId} onSelect={onClose} />
          <NativeReporterQuality />
        </>
      )}
    </NativeDialog>
  )
}

export function NativeSelfPlayerDialog({
  playerId,
  user,
  tournamentId,
  onClose,
  onSaved,
}: {
  playerId: string
  user: AuthUser
  tournamentId: string
  onClose: () => void
  onSaved: () => void
}) {
  const [dirty, setDirty] = useState(false),
    [busy, setBusy] = useState(false),
    [focus, setFocus] = useState<string | undefined>()
  /* The first-use guide scrolls the editor to the part it is explaining. */
  useEffect(() => {
    const command = (kind: GuidePlayerCommand, id?: string) => {
      if (kind === 'focus') setFocus(id)
    }
    Taro.eventCenter.on(guidePlayerEvent, command)
    return () => {
      Taro.eventCenter.off(guidePlayerEvent, command)
    }
  }, [])
  const changed = useCallback((nextDirty: boolean, nextBusy: boolean) => {
    setDirty(nextDirty)
    setBusy(nextBusy)
  }, [])
  return (
    <NativeDialog
      title="编辑球员资料"
      compact={false}
      busy={busy}
      unsavedChanges={dirty}
      onClose={onClose}
      focusId={focus}
    >
      <NativeSelfPlayer
        playerId={playerId}
        user={user}
        tournamentId={tournamentId}
        onEditorState={changed}
        onSaved={onSaved}
      />
    </NativeDialog>
  )
}

const ratings = [
  ['ratingShooting', '射门'],
  ['ratingSpeed', '速度'],
  ['ratingDribbling', '盘带'],
  ['ratingPassing', '传球'],
  ['ratingDefending', '防守'],
] as const
const positions = [
  ['', '未填写'],
  ['GOALKEEPER', '门将'],
  ['DEFENDER', '后卫'],
  ['MIDFIELDER', '中场'],
  ['FORWARD', '前锋'],
] as const
function NativeSelfPlayer({
  playerId,
  user,
  tournamentId,
  onEditorState,
  onSaved,
}: {
  playerId: string
  user: AuthUser
  tournamentId: string
  onEditorState: (dirty: boolean, busy: boolean) => void
  onSaved: () => void
}) {
  const [original, setOriginal] = useState<SelfPlayerProfile | null>(null)
  const [data, setData] = useState<SelfPlayerProfile | null>(null)
  const [detail, setDetail] = useState<PlayerDetailResponse | null>(null)
  const [busy, setBusy] = useState(false),
    [photoBusy, setPhotoBusy] = useState(false),
    [error, setError] = useState('')
  const pendingSave = useRef<{ fingerprint: string; key: string } | null>(null)
  const lock = useRef(false)
  useEffect(() => {
    onEditorState(
      Boolean(data && original && JSON.stringify(data) !== JSON.stringify(original)),
      busy || photoBusy,
    )
  }, [data, original, busy, photoBusy, onEditorState])
  useEffect(() => () => onEditorState(false, false), [onEditorState])
  useEffect(() => {
    let current = true
    void selfPlayerProfile
      .read()
      .then((profile) => {
        if (profile.id !== playerId)
          throw new Error('当前账号未关联此球员，请先在身份管理中确认关联')
        if (current) {
          setData(profile)
          setOriginal(profile)
        }
      })
      .catch((issue: Error) => {
        if (current) setError(issue.message)
      })
    void productRepository
      .getPlayer(playerId, tournamentId)
      .then((profile) => {
        if (current) setDetail(profile)
      })
      .catch(() => {})
    return () => {
      current = false
    }
  }, [playerId, tournamentId])
  const change = (key: keyof SelfPlayerProfile, value: string, number = false) =>
    setData((current) =>
      current
        ? { ...current, [key]: value === '' ? null : number ? Number(value) : value }
        : current,
    )
  const save = async () => {
    if (!data || !original || lock.current || photoBusy) return
    for (const [key, label] of ratings)
      if (
        data[key] !== null &&
        (!Number.isFinite(data[key]) || data[key]! < 0 || data[key]! > 100)
      ) {
        setError(`${label}应为0–100之间的数值`)
        return
      }
    const patch = Object.fromEntries(
      Object.entries(data).filter(
        ([key, value]) =>
          key !== 'id' && key !== 'updatedAt' && value !== original[key as keyof SelfPlayerProfile],
      ),
    )
    if (!Object.keys(patch).length) {
      void Taro.showToast({ title: '资料未更改', icon: 'none' })
      return
    }
    if (readSession()?.user.id !== user.id) {
      setError('账号已切换，请重新打开')
      return
    }
    const fingerprint = JSON.stringify([original.updatedAt, patch])
    if (pendingSave.current?.fingerprint !== fingerprint)
      pendingSave.current = { fingerprint, key: createClientActionId('self-profile') }
    lock.current = true
    setBusy(true)
    setError('')
    try {
      const updated = await selfPlayerProfile.save(
        original.id,
        original.updatedAt,
        patch,
        pendingSave.current.key,
      )
      if (readSession()?.user.id !== user.id) throw new Error('账号已切换，请重新打开')
      setData(updated)
      setOriginal(updated)
      pendingSave.current = null
      onSaved()
      void Taro.showToast({ title: '球员资料已保存', icon: 'success' })
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : '保存失败')
    } finally {
      lock.current = false
      setBusy(false)
    }
  }
  const mediaSaved = async () => {
    if (readSession()?.user.id !== user.id) throw Error('账号已切换，请重新打开')
    const refreshed = await selfPlayerProfile.read()
    const sameFields =
      original &&
      Object.entries(original).every(
        ([key, value]) =>
          key === 'updatedAt' || value === refreshed[key as keyof SelfPlayerProfile],
      )
    if (sameFields) {
      setOriginal(refreshed)
      setData((current) => (current ? { ...current, updatedAt: refreshed.updatedAt } : current))
    } else setError('球员资料已在其他位置更新，请关闭后重新打开再编辑。图片已保存。')
    setDetail(await productRepository.getPlayer(playerId, tournamentId))
    onSaved()
  }
  return (
    <View className="native-self-player">
      {error && <Text className="native-error">{error}</Text>}
      {!data && !error && <Text className="native-note">正在读取球员资料…</Text>}
      {data && (
        <>
          <NativePlayerMedia
            playerId={playerId}
            tournamentId={tournamentId}
            name={data.displayName}
            avatarUrl={detail?.avatarUrl}
            portraitUrl={detail?.portraitUrl}
            coverUrl={detail?.coverUrl}
            onSaved={mediaSaved}
            onEditingChange={setPhotoBusy}
          />
          {detail && (
            <View className="native-player-summary">
              {[
                [detail.stats.appearances, '出场'],
                [detail.stats.goals, '进球'],
                [detail.stats.assists, '助攻'],
              ].map(([value, label]) => (
                <View key={String(label)}>
                  <Text>{value}</Text>
                  <Text>{label}</Text>
                </View>
              ))}
            </View>
          )}
          <Text className="native-section-title">球员资料</Text>
          {(
            [
              ['displayName', '球员姓名'],
              ['jerseyName', '球衣显示名'],
              ['heightCm', '身高（厘米）'],
              ['academicYear', '年级'],
              ['major', '专业'],
              ['hometown', '家乡'],
            ] as const
          ).map(([key, label]) => (
            <View key={key}>
              <Text className="native-label">{label}</Text>
              <Input
                className="native-field"
                type={key === 'heightCm' ? 'number' : 'text'}
                maxlength={120}
                value={String(data[key] ?? '')}
                onInput={(event) => change(key, event.detail.value, key === 'heightCm')}
              />
            </View>
          ))}
          {(['position', 'secondaryPosition'] as const).map((key) => (
            <View key={key}>
              <Text className="native-label">{key === 'position' ? '主要位置' : '第二位置'}</Text>
              <Picker
                range={positions.map((entry) => entry[1])}
                value={Math.max(
                  0,
                  positions.findIndex(([value]) => value === data[key]),
                )}
                onChange={(event) => change(key, positions[Number(event.detail.value)]![0])}
              >
                <View className="native-select">
                  <Text>{positions.find(([value]) => value === data[key])?.[1] || '未填写'}</Text>
                  <View className="native-select__chevron" />
                </View>
              </Picker>
            </View>
          ))}
          <Text className="native-label">惯用脚</Text>
          <Picker
            range={['未填写', '左脚', '右脚', '双脚']}
            value={Math.max(0, ['', 'LEFT', 'RIGHT', 'BOTH'].indexOf(data.dominantFoot || ''))}
            onChange={(event) =>
              change('dominantFoot', ['', 'LEFT', 'RIGHT', 'BOTH'][Number(event.detail.value)]!)
            }
          >
            <View className="native-select">
              <Text>
                {({ LEFT: '左脚', RIGHT: '右脚', BOTH: '双脚' } as Record<string, string>)[
                  data.dominantFoot || ''
                ] || '未填写'}
              </Text>
              <View className="native-select__chevron" />
            </View>
          </Picker>
          <Text className="native-label">球员简介</Text>
          <Textarea
            className="native-field"
            maxlength={600}
            value={data.bio || ''}
            onInput={(event) => change('bio', event.detail.value)}
          />
          <View id="native-guide-player-ratings">
            <Text className="native-section-title">个人技术自评</Text>
            <View className="native-player-ratings">
              {ratings.map(([key, label]) => (
                <View key={key}>
                  <Text>{label}</Text>
                  <Input
                    className="native-field"
                    type="number"
                    maxlength={3}
                    placeholder="未填写"
                    value={data[key] === null ? '' : String(data[key])}
                    onInput={(event) => change(key, event.detail.value, true)}
                  />
                </View>
              ))}
            </View>
          </View>
          <Button
            className="native-button native-button--primary native-self-player-save"
            loading={busy}
            disabled={busy || photoBusy}
            onClick={() => void save()}
          >
            保存球员资料
          </Button>
        </>
      )}
    </View>
  )
}

function NativeReporterQuality() {
  const [data, setData] = useState<ReporterQuality | null>(null),
    [error, setError] = useState(''),
    [rules, setRules] = useState(false)
  const [displayScore, setDisplayScore] = useState<number | null>(null),
    [scoreDelta, setScoreDelta] = useState<number | null>(null)
  const { reduceMotion } = useNativePreferences()
  const actor = readSession()?.user
  const seenKey = actor ? `xiaoqiu.reporter-score-seen.v1:${actor.organizationId}:${actor.id}` : ''
  const load = () => {
    setError('')
    void campusRepository
      .quality()
      .then(setData)
      .catch((issue: Error) => setError(issue.message))
  }
  useEffect(load, [])
  useEffect(() => {
    if (!data?.profile || !seenKey) return
    const profile = data.profile
    let seen: QualitySeen | null = null
    try {
      seen = Taro.getStorageSync<QualitySeen>(seenKey) || null
    } catch {
      /* Optional local presentation state. */
    }
    const changes = qualityChanges(profile, data.entries, seen)
    const timers = new Set<ReturnType<typeof setTimeout>>()
    let stopped = false
    const later = (work: () => void, ms: number) => {
      const timer = setTimeout(() => {
        timers.delete(timer)
        if (!stopped) work()
      }, ms)
      timers.add(timer)
    }
    const finish = () => {
      setDisplayScore(profile.score)
      setScoreDelta(null)
      try {
        Taro.setStorageSync(seenKey, {
          profileId: profile.id,
          entryId: data.entries[0]?.id || null,
          score: profile.score,
        } satisfies QualitySeen)
      } catch {
        /* Score authority remains the API. */
      }
    }
    const play = (index: number) => {
      const change = changes[index]
      if (!change) return finish()
      setDisplayScore(change.from)
      setScoreDelta(change.delta)
      later(() => {
        const steps = reduceMotion ? 1 : 12
        const tick = (step: number) => {
          const fraction = step / steps
          setDisplayScore(
            Math.round(change.from + (change.to - change.from) * (1 - (1 - fraction) ** 3)),
          )
          if (step < steps) later(() => tick(step + 1), 30)
          else
            later(() => {
              setScoreDelta(null)
              later(() => play(index + 1), 30)
            }, 100)
        }
        tick(1)
      }, 650)
    }
    setScoreDelta(null)
    if (changes.length) play(0)
    else finish()
    return () => {
      stopped = true
      timers.forEach(clearTimeout)
    }
  }, [data, seenKey, reduceMotion])
  const labels: Record<string, string> = {
    ACTIVE: '正常记录',
    PROBATION: '复训考察中',
    FROZEN: '已冻结',
    COOLDOWN: '等待解冻',
    BANNED: '资格已封禁',
  }
  return (
    <View className="native-reporter-quality">
      {error && (
        <>
          <Text className="native-error">{error}</Text>
          <Button className="native-button" onClick={load}>
            重试
          </Button>
        </>
      )}
      {!data && !error && <Text className="native-note">正在读取记录质量分…</Text>}
      {data && !data.profile && <Text className="native-note">当前没有信息管理员质量记录。</Text>}
      {data?.profile && (
        <>
          <View className="native-reporter-scoreboard">
            <View className="native-reporter-score-column">
              <Text>我的质量分</Text>
              <Text className="native-reporter-score-value">
                {displayScore ?? data.profile.score}
                <Text> / 100</Text>
              </Text>
              {scoreDelta !== null && (
                <Text
                  key={`${scoreDelta}:${displayScore === null ? 'initial' : 'score'}`}
                  className={`native-reporter-score-delta ${scoreDelta > 0 ? 'is-gain' : 'is-loss'}${reduceMotion ? ' is-reduced' : ''}`}
                >
                  {scoreDelta > 0 ? '+' : '−'}
                  {Math.abs(scoreDelta)}
                </Text>
              )}
            </View>
            <View>
              <Text>已录入</Text>
              <Text className="native-reporter-match-count">
                {data.recordedMatchCount ?? '—'} 场
              </Text>
            </View>
          </View>
          {data.profile.status !== 'ACTIVE' && (
            <Text className="native-reporter-status">
              {labels[data.profile.status] || data.profile.status}
            </Text>
          )}
          <Button className="native-button" onClick={() => setRules(!rules)}>
            评分说明
          </Button>
          {rules && (
            <NativeDialog title="评分说明" onClose={() => setRules(false)}>
              <View className="native-quality-rule is-gain">
                <Text>
                  连续 {data.rules.qualifiedMatchesForReward} 场合格（
                  {Math.min(
                    data.profile.consecutiveQualified,
                    data.rules.qualifiedMatchesForReward,
                  )}
                  /{data.rules.qualifiedMatchesForReward}）
                </Text>
                <Text>+{data.rules.reward} 分</Text>
              </View>
              <View className="native-quality-rule is-loss">
                <Text>经确认的记录差错</Text>
                <Text>−{data.rules.initialPenalty} 分</Text>
              </View>
              <View className="native-quality-rule is-loss">
                <Text>复训考察期内差错</Text>
                <Text>−{data.rules.reinstatedPenalty} 分</Text>
              </View>
              <View className="native-quality-rule">
                <Text>初始分／最高分</Text>
                <Text>{data.rules.initialScore} 分</Text>
              </View>
              <View className="native-quality-rule">
                <Text>身份冻结线</Text>
                <Text>低于 {data.rules.freezeBelow} 分</Text>
              </View>
            </NativeDialog>
          )}
        </>
      )}
    </View>
  )
}
