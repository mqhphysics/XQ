import Taro from '@tarojs/taro'
import { openCaptainManage } from '../../features/captain-roster/captain-manage-navigation.h5'
import { useCallback, useEffect, useRef, useState } from 'react'
import { DataState } from '../public-ui'
import { TeamContent, TeamHero } from './content.h5'
import { useTeamData } from './data.h5'
import { TeamIcon } from './icons.h5'
import { JoinTeamDialog } from './join-dialog.h5'
import { saveTeamPreference } from './follow.h5'
import { productRepository } from '../../features/product/product.repository'
import { readSession } from '../../features/product/session'
import type {
  TeamPreferencesResponse,
  TeamRelationshipResponse,
  TeamSummary,
} from '../../features/product/product.types'
import { TEAM_PREFERENCES_EVENT } from '../../features/product/team-navigation.h5'
import './detail-layout.h5.scss'

export function TeamDetailView({
  teamId,
  tournamentId: requestedTournamentId,
}: {
  teamId: string
  tournamentId?: string | undefined
}) {
  const [initialTournament, setInitialTournament] = useState(requestedTournamentId ?? '')
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    let active = true
    if (requestedTournamentId) {
      setInitialTournament(requestedTournamentId)
      return
    }
    setError('')
    void productRepository
      .getHome()
      .then((home) => {
        if (active) setInitialTournament(home.tournament.id)
      })
      .catch((issue) => {
        if (active) setError(issue instanceof Error ? issue.message : '赛事信息加载失败')
      })
    return () => {
      active = false
    }
  }, [requestedTournamentId, attempt])
  if (!teamId) return <DataState kind="error" title="缺少球队参数" />
  if (error)
    return (
      <DataState
        kind="error"
        title="球队详情暂不可用"
        description={error}
        onRetry={() => setAttempt((current) => current + 1)}
      />
    )
  return initialTournament ? (
    <LoadedDetail
      key={`${teamId}:${initialTournament}`}
      teamId={teamId}
      initialTournament={initialTournament}
    />
  ) : (
    <DataState kind="loading" title="正在读取球队档案" />
  )
}

function LoadedDetail({
  teamId,
  initialTournament,
}: {
  teamId: string
  initialTournament: string
}) {
  const [tournamentId, setTournamentId] = useState(initialTournament)
  const state = useTeamData(teamId, tournamentId)
  if (state.loading && !state.data) return <DataState kind="loading" title="正在读取球队档案" />
  if (state.error || !state.data)
    return (
      <>
        <DataState
          kind="error"
          title="球队详情暂不可用"
          description={state.error}
          onRetry={() => void state.reload()}
        />
        {tournamentId !== initialTournament ? (
          <button
            data-team-control
            type="button"
            className="th-soft-button"
            onClick={() => setTournamentId(initialTournament)}
          >
            返回原赛事
          </button>
        ) : null}
      </>
    )
  return (
    <>
      {state.loading ? <DataState kind="loading" title="正在读取赛事数据" /> : null}
      <div
        className="th-detail-body"
        style={{ display: state.loading ? 'none' : undefined }}
        aria-busy={state.loading}
      >
        <TeamHero data={state.data}>
          <TeamActions team={state.data.team} teamId={teamId} tournamentId={tournamentId} />
        </TeamHero>
        <TeamContent
          data={state.data}
          competition={state.competition}
          competitionError={state.competitionError}
          tournamentId={tournamentId}
          onTournamentChange={setTournamentId}
          onReload={() => void state.reload()}
          onPostPublished={(post) =>
            state.setData((current) =>
              current ? { ...current, posts: [post, ...current.posts] } : current,
            )
          }
        />
      </div>
    </>
  )
}

function TeamActions({
  team,
  teamId,
  tournamentId,
}: {
  team: TeamSummary
  teamId: string
  tournamentId: string
}) {
  const [preferences, setPreferences] = useState<TeamPreferencesResponse | null>(null)
  const [relationship, setRelationship] = useState<TeamRelationshipResponse | null>(null)
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [join, setJoin] = useState(false)
  const [joinError, setJoinError] = useState('')
  const locked = useRef(false)
  const signedIn = Boolean(readSession())
  const load = useCallback(async () => {
    if (!readSession()) {
      setLoading(false)
      return
    }
    setLoading(true)
    setError('')
    try {
      const [prefs, relation] = await Promise.all([
        productRepository.getTeamPreferences(),
        productRepository.getTeamRelationship(teamId),
      ])
      setPreferences(prefs)
      setRelationship(relation)
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : '球队关系加载失败')
    } finally {
      setLoading(false)
    }
  }, [teamId])
  useEffect(() => {
    void load()
  }, [load])
  useEffect(() => {
    const changed = (event: Event) =>
      setPreferences((event as CustomEvent<TeamPreferencesResponse>).detail)
    window.addEventListener(TEAM_PREFERENCES_EVENT, changed)
    return () => window.removeEventListener(TEAM_PREFERENCES_EVENT, changed)
  }, [])
  const primary = preferences?.primaryTeam?.id === teamId
  const followed = primary || Boolean(preferences?.followedTeams.some((team) => team.id === teamId))
  const save = async (mode: 'primary' | 'follow') => {
    if (!signedIn) {
      await Taro.reLaunch({ url: '/pages/login/index' })
      return
    }
    if (locked.current) return
    locked.current = true
    setBusy(true)
    setError('')
    try {
      setPreferences(await saveTeamPreference(teamId, mode, { team, preferences }))
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : '保存失败，请重试')
    } finally {
      locked.current = false
      setBusy(false)
    }
  }
  const apply = async (position: string, message: string) => {
    if (locked.current) return
    locked.current = true
    setBusy(true)
    setJoinError('')
    try {
      setRelationship(await productRepository.applyToTeam(teamId, position, message))
      setJoin(false)
      void Taro.showToast({ title: '入队申请已提交', icon: 'success' })
    } catch (issue) {
      setJoinError(issue instanceof Error ? issue.message : '申请失败，请重试')
    } finally {
      locked.current = false
      setBusy(false)
    }
  }
  return (
    <div className="th-actions">
      <button
        data-team-control
        type="button"
        className="th-soft-button"
        disabled={busy || loading || primary}
        onClick={() => void save('primary')}
      >
        {primary ? '已设为主队' : '设为我的主队'}
      </button>
      <button
        data-team-control
        type="button"
        className="th-outline-button"
        disabled={busy || loading || primary}
        onClick={() => void save('follow')}
      >
        <TeamIcon name="heart" />
        {followed ? '已关注' : '关注球队'}
      </button>
      {relationship?.isCaptain ? (
        <button
          data-team-control
          type="button"
          className="th-text-button"
          onClick={() => openCaptainManage({ teamId, tournamentId })}
        >
          进入球队管理
          <TeamIcon name="arrow" />
        </button>
      ) : relationship?.membershipStatus === 'ACTIVE' ? (
        <span className="th-muted">已是球队成员</span>
      ) : relationship?.application?.status === 'PENDING' ? (
        <span className="th-muted">入队申请待审批</span>
      ) : signedIn && relationship ? (
        <button
          data-team-control
          type="button"
          className="th-text-button"
          onClick={() => {
            setJoinError('')
            setJoin(true)
          }}
        >
          申请加入球队
        </button>
      ) : null}
      {join ? (
        <JoinTeamDialog
          team={team}
          busy={busy}
          error={joinError}
          onCancel={() => setJoin(false)}
          onSubmit={(position, message) => void apply(position, message)}
        />
      ) : null}
      {error ? (
        <p className="th-inline-error" role="alert">
          {error}
          <button
            data-team-control
            type="button"
            disabled={busy || loading}
            onClick={() => void load()}
          >
            重试读取
          </button>
        </p>
      ) : null}
    </div>
  )
}
