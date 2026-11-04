import { Button, Text, View } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { useEffect, useRef, useState } from 'react'
import { NativeDialog } from '../native-ui/index.weapp'
import { NativePlayerFace } from '../native-ui/player-face.weapp'
import {
  useNativeCurrentUser,
  refreshNativeCurrentUser,
} from '../../features/product/current-user.weapp'
import { readSession, saveSession } from '../../features/product/session'
import {
  nativeBack,
  openNativeDetail,
  switchNativeSection,
  useNativeTournamentId,
} from '../../features/native-navigation/index.weapp'
import { useNativeBackLayer } from '../../features/native-navigation/leave-guard.weapp'
import type { NativeSection } from '../../features/native-navigation/history.logic.weapp'
import {
  gettingStartedApi,
  gettingStartedEvent,
  gettingStartedId,
  type GettingStartedData,
} from '../../features/getting-started/repository.weapp'
import {
  guideAudience,
  guidePlayerEvent,
  guideSteps,
} from '../../features/getting-started/flow.logic.weapp'
import {
  NativeGuidePrompt,
  NativeGuideSpotlight,
} from '../../features/getting-started/spotlight.weapp'
import {
  nativeHomeScrollEvent,
  useNativeHomeReady,
} from '../../features/getting-started/home-ready.weapp'
import { NativeWelcomeCard } from './welcome-card.weapp'
const read = <T,>(key: string): T | undefined => {
  try {
    return Taro.getStorageSync<T>(key)
  } catch {
    return undefined
  }
}
const store = (key: string, value: unknown) => {
  try {
    Taro.setStorageSync(key, value)
  } catch {
    /* Browsing never depends on saving a guide preference. */
  }
}
/**
 * QA accounts that get the whole first-use flow (welcome, identity, prompt, tour) on every login.
 * Nothing about them is saved on the device or sent to the server: "seen" lives only for the
 * current login session, keyed by its access token, so the next login starts fresh again.
 */
const freshOnboardingUsernames: readonly string[] = ['xq']
const sessionFlags = new Set<string>()
const freshEveryLogin = (session: ReturnType<typeof readSession>) =>
  !!session && freshOnboardingUsernames.includes(session.user.username)

export function NativeCampusWelcome({ section = 'home' }: { section?: NativeSection }) {
  const user = useNativeCurrentUser(),
    identity = user ? `${user.organizationId}:${user.id}` : '',
    prefix = `xiaoqiu:getting-started:v1:${identity}`,
    tournamentId = useNativeTournamentId(),
    homeReady = useNativeHomeReady()
  const [data, setData] = useState<GettingStartedData | null>(null),
    [phase, setPhase] = useState<
      'welcome' | 'player' | 'captain' | 'prompt' | 'guide' | 'result' | 'error' | 'waiting' | null
    >(null),
    [index, setIndex] = useState(0),
    [selected, setSelected] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('')
  const currentSection = useRef(section),
    queued = useRef<'guide' | 'match' | null>(null)
  currentSection.current = section
  const alive = useRef(true),
    loading = useRef(false),
    lock = useRef(false),
    navigating = useRef(false),
    attempted = useRef(''),
    last = useRef(0),
    manual = useRef(false),
    claimKey = useRef<{ playerId: string; id: string } | null>(null)
  const owner = () => {
    const session = readSession()
    return alive.current &&
      session &&
      `${session.user.organizationId}:${session.user.id}` === identity
      ? session
      : null
  }
  /** Device-saved guide flags; QA accounts keep them for the current login only. */
  const flag = (key: string) => {
    const session = readSession()
    return freshEveryLogin(session)
      ? sessionFlags.has(session!.accessToken + key)
      : !!read<boolean>(prefix + key)
  }
  const setFlag = (key: string, value: boolean) => {
    const session = readSession()
    if (!freshEveryLogin(session)) store(prefix + key, value)
    else if (value) sessionFlags.add(session!.accessToken + key)
    else sessionFlags.delete(session!.accessToken + key)
  }
  /** The server's "completed" is ignored for QA accounts so every login starts over. */
  const serverCompleted = (value: GettingStartedData) =>
    value.completed && !freshEveryLogin(readSession())
  const fresh = (value: GettingStartedData) => !serverCompleted(value) && !flag(':done')
  const captainAck = (value: GettingStartedData) =>
    ':captain:' +
    value.captainTeams
      .map((team) => team.id)
      .sort()
      .join(',')
  const update = (value: GettingStartedData, token: string) => {
    const current = owner()
    if (!current || current.accessToken !== token) return false
    saveSession({ ...current, user: value.user })
    setData(value)
    return true
  }
  /* First use asks before touring; a replay from 设置 starts the tour at once. */
  const begin = async (value: GettingStartedData, replay = false) => {
    if (!owner()) return
    setData(value)
    setIndex(0)
    setPhase(replay ? 'guide' : 'prompt')
    await switchNativeSection('home', tournamentId)
  }
  const afterIdentity = async (value: GettingStartedData) => {
    if (!manual.current && currentSection.current !== 'home') {
      setPhase('waiting')
      return
    }
    if (
      value.captainTeams.length &&
      (!serverCompleted(value) || value.newlyInheritedTeamIds.length > 0) &&
      !flag(captainAck(value))
    ) {
      setPhase('captain')
      return
    }
    if (fresh(value)) await begin(value)
    else if (manual.current) setPhase('result')
    else setPhase(null)
  }
  const checkIdentity = async (value: GettingStartedData) => {
    if (
      !value.user.linkedPlayer &&
      value.players.length &&
      (manual.current || !flag(':deferred'))
    ) {
      setSelected(value.players.length === 1 ? value.players[0]!.id : '')
      setPhase('player')
      return
    }
    await afterIdentity(value)
  }
  const load = async (force = false, replay = false) => {
    const session = owner()
    if (!session) return
    if (loading.current || lock.current) {
      if (force) queued.current = replay ? 'guide' : 'match'
      return
    }
    if (!force && phase) return
    loading.current = true
    manual.current = force
    setError('')
    try {
      await refreshNativeCurrentUser().catch(() => {})
      const pending = freshEveryLogin(session)
        ? undefined
        : read<{ id: string; outcome: 'DONE' | 'SKIPPED' }>(prefix + ':completion')
      if (pending)
        void gettingStartedApi
          .complete(pending.id, pending.outcome)
          .then(() => store(prefix + ':completion', null))
          .catch(() => {})
      const value = await gettingStartedApi.match()
      if (!update(value, session.accessToken)) return
      attempted.current = identity
      last.current = Date.now()
      if (replay) {
        await begin(value, true)
        return
      }
      /* A brand-new account first sees the welcome card, once home has content behind it. */
      if (!force && fresh(value) && !flag(':welcome')) {
        setPhase('welcome')
        return
      }
      await checkIdentity(value)
    } catch (issue) {
      if (owner() && force) {
        setError(issue instanceof Error ? issue.message : '暂时无法匹配，请稍后重试')
        setPhase('error')
      }
    } finally {
      loading.current = false
      const next = queued.current
      queued.current = null
      if (next && owner()) void load(true, next === 'guide')
    }
  }
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])
  useEffect(() => {
    setPhase(null)
    setData(null)
    attempted.current = ''
    loading.current = false
    lock.current = false
    claimKey.current = null
  }, [identity])
  useEffect(() => {
    if (identity && section === 'home' && attempted.current !== identity) void load()
  }, [identity, section, phase])
  useEffect(() => {
    if (phase === 'waiting' && section === 'home' && data) void afterIdentity(data)
  }, [phase, section])
  useDidShow(() => {
    if (identity && section === 'home' && Date.now() - last.current > 60000) void load()
  })
  useEffect(() => {
    const request = (mode: 'guide' | 'match') => {
      void load(true, mode === 'guide')
    }
    Taro.eventCenter.on(gettingStartedEvent, request)
    return () => {
      Taro.eventCenter.off(gettingStartedEvent, request)
    }
  }, [identity, section, phase, tournamentId])
  const claim = async () => {
    const session = owner()
    if (!session || !selected || lock.current) return
    lock.current = true
    setBusy(true)
    setError('')
    if (claimKey.current?.playerId !== selected)
      claimKey.current = { playerId: selected, id: gettingStartedId() }
    try {
      const value = await gettingStartedApi.claim(selected, claimKey.current.id)
      if (update(value, session.accessToken)) {
        setFlag(':deferred', false)
        await afterIdentity(value)
      }
    } catch (issue) {
      if (owner()) setError(issue instanceof Error ? issue.message : '关联暂未完成，请重试')
    } finally {
      lock.current = false
      setBusy(false)
    }
  }
  /* Ending the tour leaves the user where it stopped; nothing opens or gets clicked for them. */
  const finish = async (outcome: 'DONE' | 'SKIPPED') => {
    const session = owner()
    if (!session || lock.current) return
    setFlag(':done', true)
    setPhase(null)
    if (freshEveryLogin(session)) return
    const completion = { id: gettingStartedId(), outcome }
    store(prefix + ':completion', completion)
    void gettingStartedApi
      .complete(completion.id, outcome)
      .then(() => store(prefix + ':completion', null))
      .catch(() => {})
  }
  const closeWelcome = () => {
    setFlag(':welcome', true)
    if (data && owner()) void checkIdentity(data)
    else setPhase(null)
  }
  useNativeBackLayer(async () => {
    if (navigating.current) return false
    if (phase === 'welcome') {
      closeWelcome()
      return true
    }
    if (phase !== 'guide' && phase !== 'prompt') return false
    await finish('SKIPPED')
    return true
  })
  const steps = guideSteps(
      data ? guideAudience(data.user, data.captainTeams) : 'student',
      !!data?.user.linkedPlayer,
    ),
    step = steps[index]
  const action = async () => {
    if (lock.current || !data || !step || !owner()) return
    if (step.action === 'finish') {
      await finish('DONE')
      return
    }
    lock.current = true
    navigating.current = true
    setBusy(true)
    try {
      const next = steps[index + 1]
      if (step.action === 'next') {
        /* A page's steps all finish before the guide slides to the next tab. */
        if (next && next.section !== step.section)
          await switchNativeSection(next.section, tournamentId)
      } else if (step.action === 'player' && data.user.linkedPlayer)
        await openNativeDetail(
          `/pages/player-detail/index?playerId=${encodeURIComponent(data.user.linkedPlayer.id)}&tournamentId=${encodeURIComponent(tournamentId)}`,
        )
      else if (step.action === 'edit') {
        /* The player page opens its own profile editor; give the dialog a moment to mount. */
        Taro.eventCenter.trigger(guidePlayerEvent, 'edit')
        await new Promise((resolve) => setTimeout(resolve, 320))
      } else if (step.action === 'manage' && data.captainTeams[0])
        await openNativeDetail(
          `/pages/team-manage/index?teamId=${encodeURIComponent(data.captainTeams[0].id)}&tournamentId=${encodeURIComponent(tournamentId)}`,
        )
      else if (step.action === 'back') {
        /* Back from the detail page straight into the next tab of the tour. */
        Taro.eventCenter.trigger(guidePlayerEvent, 'close')
        await new Promise((resolve) => setTimeout(resolve, 120))
        await nativeBack()
        await switchNativeSection(next?.section ?? 'me', tournamentId)
      }
      if (next?.scroll) Taro.eventCenter.trigger(nativeHomeScrollEvent, next.scroll)
      if (next?.focus) Taro.eventCenter.trigger(guidePlayerEvent, 'focus', next.focus)
      if (owner()) setIndex((value) => Math.min(steps.length - 1, value + 1))
    } finally {
      lock.current = false
      navigating.current = false
      setBusy(false)
    }
  }
  if (phase === 'guide' && step)
    return (
      <NativeGuideSpotlight
        step={step}
        busy={busy}
        onAction={action}
        onSkip={() => finish('SKIPPED')}
      />
    )
  if (!phase || phase === 'waiting' || (!manual.current && section !== 'home')) return null
  /* No mask of any kind until the home page has real content behind it. */
  if ((phase === 'welcome' || phase === 'prompt') && (!homeReady || section !== 'home')) return null
  if (phase === 'welcome') return <NativeWelcomeCard onClose={closeWelcome} />
  if (phase === 'prompt')
    return (
      <NativeGuidePrompt
        onStart={() => {
          if (owner()) setPhase('guide')
        }}
        onSkip={() => finish('SKIPPED')}
      />
    )
  if (phase === 'player' && data)
    return (
      <NativeDialog
        title="这是你的球员档案吗？"
        compact={false}
        busy={busy}
        onClose={() => {
          setFlag(':deferred', true)
          void afterIdentity(data)
        }}
        footer={
          <>
            <Button
              className="native-button"
              disabled={busy}
              onClick={() => {
                setFlag(':deferred', true)
                void afterIdentity(data)
              }}
            >
              暂不关联
            </Button>
            <Button
              className="native-button native-button--primary"
              disabled={busy || !selected}
              loading={busy}
              onClick={() => void claim()}
            >
              确认，是我
            </Button>
          </>
        }
      >
        <Text className="native-note">
          确认本人后即可关联，不需要等待人工确认。队长身份会随球员自动识别。
        </Text>
        {data.players.map((player) => (
          <Button
            key={player.id}
            className={`native-player-claim__choice${selected === player.id ? ' is-selected' : ''}`}
            aria-pressed={selected === player.id}
            onClick={() => setSelected(player.id)}
          >
            <NativePlayerFace
              name={player.name}
              avatarUrl={player.avatarUrl}
              portraitUrl={player.portraitUrl}
              large
            />
            <View>
              <Text>{player.name}</Text>
              <Text>{[player.collegeName, player.academicYear].filter(Boolean).join(' · ')}</Text>
              <Text>{player.teamNames.join('、')}</Text>
            </View>
          </Button>
        ))}
        {error && <Text className="native-error">{error}</Text>}
      </NativeDialog>
    )
  if (phase === 'captain' && data)
    return (
      <NativeDialog
        title="已识别你的队长身份"
        onClose={() => {
          setFlag(captainAck(data), true)
          void (fresh(data)
            ? begin(data)
            : Promise.resolve(setPhase(manual.current ? 'result' : null)))
        }}
        footer={
          <Button
            className="native-button native-button--primary"
            onClick={() => {
              setFlag(captainAck(data), true)
              void (fresh(data)
                ? begin(data)
                : Promise.resolve(setPhase(manual.current ? 'result' : null)))
            }}
          >
            继续
          </Button>
        }
      >
        <Text className="native-section-title">
          {data.captainTeams.map((team) => team.name).join('、')}
        </Text>
        <Text className="native-note">
          现在可以在「我的」管理球队、阵容和大名单，无需再申请关联队长。
        </Text>
      </NativeDialog>
    )
  return (
    <NativeDialog
      title={phase === 'error' ? '暂时无法更新身份' : '身份匹配已完成'}
      onClose={() => setPhase(null)}
      footer={
        phase === 'error' ? (
          <Button className="native-button native-button--primary" onClick={() => void load(true)}>
            重新匹配
          </Button>
        ) : (
          <Button className="native-button native-button--primary" onClick={() => setPhase(null)}>
            完成
          </Button>
        )
      }
    >
      <Text className="native-note">
        {error ||
          (data?.user.linkedPlayer
            ? `已关联球员${data.user.linkedPlayer.displayName || ''}${data.captainTeams.length ? '，队长身份已同步' : ''}。`
            : '暂未发现可关联的球员档案。仍可正常查看赛程、关注球队和浏览动态。')}
      </Text>
    </NativeDialog>
  )
}
