import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useOverlayFocus } from '../../components/overlay-focus'
import { TeamCrest } from '../../components/product-ui'
import { DataState } from '../../components/public-ui'
import { productRepository } from '../product/product.repository'
import type { CaptainWorkspaceResponse, TeamDashboardResponse } from '../product/product.types'
import {
  OPEN_CAPTAIN_MANAGE_EVENT,
  openCaptainManage,
  type CaptainManagePickerRequest,
  type CaptainManageRequest,
} from './captain-manage-navigation.h5'
import type { LineupPlayer } from './lineup.logic'
import { rosterRepository, type RosterWorkflowView } from './roster.repository'
import { teamManagementRepository, type CaptainTeamProfile } from './team-management.repository'
import { Icon } from './manage-icons.h5'
import { ManageProfileSection } from './manage-profile.h5'
import { ManageLineupSection } from './manage-lineup.h5'
import { ManageSquadSection } from './manage-squad.h5'
import './manage-modal.h5.scss'

type HostDetail = CaptainManageRequest | { picker: CaptainManagePickerRequest }
type Workspace = CaptainWorkspaceResponse & { team: CaptainTeamProfile }
const SECTIONS = [
  { id: 'profile', label: '球队主页' },
  { id: 'lineup', label: '阵容' },
  { id: 'squad', label: '大名单' },
] as const
type SectionId = (typeof SECTIONS)[number]['id']

export function CaptainManageHost() {
  const [request, setRequest] = useState<CaptainManageRequest | null>(null)
  const [picker, setPicker] = useState<CaptainManagePickerRequest | null>(null)

  useEffect(() => {
    const onOpen = (event: Event) => {
      const detail = (event as CustomEvent<HostDetail>).detail
      if (!detail) return
      if ('picker' in detail) {
        setPicker(detail.picker)
        setRequest(null)
        return
      }
      setPicker(null)
      setRequest(detail)
    }
    window.addEventListener(OPEN_CAPTAIN_MANAGE_EVENT, onOpen)
    return () => window.removeEventListener(OPEN_CAPTAIN_MANAGE_EVENT, onOpen)
  }, [])

  if (picker) return <CaptainTeamPicker picker={picker} onClose={() => setPicker(null)} />
  if (!request) return null
  return (
    <CaptainManageModal
      teamId={request.teamId}
      tournamentId={request.tournamentId ?? ''}
      {...(request.teamName ? { teamName: request.teamName } : {})}
      onClose={() => setRequest(null)}
    />
  )
}

function CaptainTeamPicker({
  picker,
  onClose,
}: {
  picker: CaptainManagePickerRequest
  onClose: () => void
}) {
  useOverlayFocus(true, '.cm-picker', onClose)
  return createPortal(
    <div
      className="cm-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <section
        className="cm-picker xq-dialog cmx"
        role="dialog"
        aria-modal="true"
        aria-label="选择球队"
        tabIndex={-1}
      >
        <header className="cmx-header xq-dialog__header">
          <h2 className="cmx-header__title">选择要管理的球队</h2>
          <button type="button" className="cmx-close" aria-label="关闭" onClick={onClose}>
            <Icon name="close" />
          </button>
        </header>
        <div className="cmx-picker xq-dialog__body">
          {picker.teams.map((team) => (
            <button
              type="button"
              key={team.id}
              className="cmx-picker__item"
              onClick={() => {
                onClose()
                openCaptainManage({
                  teamId: team.id,
                  ...(picker.tournamentId ? { tournamentId: picker.tournamentId } : {}),
                  teamName: team.name,
                })
              }}
            >
              <strong>{team.name}</strong>
              <Icon name="chevron" size={14} />
            </button>
          ))}
        </div>
      </section>
    </div>,
    document.body,
  )
}

function CaptainManageModal({
  teamId,
  tournamentId,
  teamName,
  onClose,
}: {
  teamId: string
  tournamentId: string
  teamName?: string
  onClose: () => void
}) {
  useOverlayFocus(true, '.cm-dialog', onClose)
  const [captain, setCaptain] = useState<Workspace | null>(null)
  const [dashboard, setDashboard] = useState<TeamDashboardResponse | null>(null)
  const [roster, setRoster] = useState<RosterWorkflowView | null>(null)
  const [rosterError, setRosterError] = useState('')
  const [resolvedTournament, setResolvedTournament] = useState(tournamentId)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [active, setActive] = useState<SectionId>('profile')
  const sequence = useRef(0)
  const bodyRef = useRef<HTMLDivElement | null>(null)
  const sectionRefs = useRef<Record<SectionId, HTMLElement | null>>({
    profile: null,
    lineup: null,
    squad: null,
  })
  const scrollingTo = useRef<SectionId | null>(null)

  const load = useCallback(async () => {
    const id = ++sequence.current
    setLoading(true)
    setError('')
    try {
      const [workspace, dash, home] = await Promise.all([
        teamManagementRepository.read(teamId),
        productRepository.getTeamDashboard(teamId, tournamentId || undefined).catch(() => null),
        tournamentId ? Promise.resolve(null) : productRepository.getHome().catch(() => null),
      ])
      const nextTournament = tournamentId || home?.tournament.id || ''
      let nextRoster: RosterWorkflowView | null = null
      let nextRosterError = ''
      if (nextTournament) {
        try {
          nextRoster = await rosterRepository.read(nextTournament, teamId)
        } catch (issue) {
          nextRosterError = issue instanceof Error ? issue.message : '赛事名单暂不可用'
        }
      }
      if (id !== sequence.current) return
      setCaptain(workspace)
      setDashboard(dash)
      setRoster(nextRoster)
      setRosterError(nextRosterError)
      setResolvedTournament(nextTournament)
    } catch (issue) {
      if (id === sequence.current)
        setError(issue instanceof Error ? issue.message : '球队管理加载失败')
    } finally {
      if (id === sequence.current) setLoading(false)
    }
  }, [teamId, tournamentId])

  useEffect(() => {
    void load()
    return () => {
      sequence.current += 1
    }
  }, [load])

  const onScroll = () => {
    const body = bodyRef.current
    if (!body) return
    if (scrollingTo.current) return
    const top = body.scrollTop
    let current: SectionId = 'profile'
    for (const section of SECTIONS) {
      const element = sectionRefs.current[section.id]
      if (element && element.offsetTop - 120 <= top) current = section.id
    }
    if (top + body.clientHeight >= body.scrollHeight - 4) current = 'squad'
    setActive(current)
  }

  const jump = (id: SectionId) => {
    const body = bodyRef.current
    const element = sectionRefs.current[id]
    if (!body || !element) return
    setActive(id)
    scrollingTo.current = id
    body.scrollTo({ top: Math.max(0, element.offsetTop - 16), behavior: 'smooth' })
    window.setTimeout(() => {
      scrollingTo.current = null
    }, 600)
  }

  const lineupPool = useMemo<{ players: LineupPlayer[]; label: string }>(() => {
    const locked = roster?.lockedSnapshot
    if (locked?.players.length)
      return {
        players: locked.players,
        label: `大名单 v${locked.version} · ${locked.players.length} 人`,
      }
    const players = (dashboard?.roster ?? []).map((player) => ({
      id: player.id,
      displayName: player.displayName,
      shirtNumber: player.shirtNumber,
      avatarUrl: player.avatarUrl,
      position: player.position,
    }))
    return { players, label: `球队成员 · ${players.length} 人` }
  }, [roster, dashboard])

  const team = captain?.team
  const title = team?.name ?? teamName ?? '球队管理'
  const pendingApps = captain?.applications.filter((item) => item.status === 'PENDING').length ?? 0

  return createPortal(
    <div
      className="cm-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <section
        className="cm-dialog xq-dialog xq-dialog--wide cmx"
        role="dialog"
        aria-modal="true"
        aria-label={`${title} · 球队管理`}
        tabIndex={-1}
      >
        <header className="cmx-header xq-dialog__header">
          <div className="cmx-header__team">
            {team ? <TeamCrest team={team} size="small" interactive={false} /> : null}
            <div>
              <h2 className="cmx-header__title">{title}</h2>
              <span className="cmx-header__sub">球队管理</span>
            </div>
          </div>
          <nav className="cmx-tabs" aria-label="管理分区">
            {SECTIONS.map((section) => (
              <button
                type="button"
                key={section.id}
                className={`cmx-tab ${active === section.id ? 'is-active' : ''}`}
                aria-current={active === section.id ? 'true' : undefined}
                disabled={!captain}
                onClick={() => jump(section.id)}
              >
                {section.label}
                {section.id === 'squad' && pendingApps ? (
                  <i className="cmx-tab__dot" aria-label={`${pendingApps} 条申请`} />
                ) : null}
              </button>
            ))}
          </nav>
          <button type="button" className="cmx-close" aria-label="关闭球队管理" onClick={onClose}>
            <Icon name="close" />
          </button>
        </header>
        <div className="cmx-body xq-dialog__body" ref={bodyRef} onScroll={onScroll}>
          {loading ? (
            <DataState kind="loading" title="正在打开球队管理" />
          ) : error ? (
            <DataState
              kind="error"
              title="球队管理暂不可用"
              description={error}
              onRetry={() => void load()}
            />
          ) : captain && team ? (
            <>
              <section
                className="cmx-section cmx-section--profile"
                ref={(element) => {
                  sectionRefs.current.profile = element
                }}
                aria-label="球队主页"
              >
                <ManageProfileSection
                  teamId={teamId}
                  team={team}
                  dashboard={dashboard}
                  onSaved={(saved) => {
                    setCaptain((current) =>
                      current ? { ...current, team: { ...current.team, ...saved } } : current,
                    )
                    setDashboard((current) =>
                      current ? { ...current, team: { ...current.team, ...saved } } : current,
                    )
                  }}
                />
              </section>
              <section
                className="cmx-section cmx-section--lineup"
                ref={(element) => {
                  sectionRefs.current.lineup = element
                }}
                aria-label="阵容"
              >
                <ManageLineupSection
                  teamId={teamId}
                  tournamentId={resolvedTournament}
                  players={lineupPool.players}
                  poolLabel={lineupPool.label}
                  toolbarTarget={(toolbar) => (
                    <div className="cmx-section__head">
                      <h3>阵容</h3>
                      {toolbar}
                    </div>
                  )}
                />
              </section>
              <section
                className="cmx-section cmx-section--squad"
                ref={(element) => {
                  sectionRefs.current.squad = element
                }}
                aria-label="大名单"
              >
                <div className="cmx-section__head">
                  <h3>大名单</h3>
                </div>
                <ManageSquadSection
                  teamId={teamId}
                  tournamentId={resolvedTournament}
                  captain={captain}
                  dashboard={dashboard}
                  roster={roster}
                  rosterError={rosterError}
                  onCaptainChange={(next) =>
                    setCaptain((current) =>
                      current ? { ...current, ...next, team: current.team } : current,
                    )
                  }
                  onRosterChange={setRoster}
                />
              </section>
            </>
          ) : null}
        </div>
      </section>
    </div>,
    document.body,
  )
}
