import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { productRepository } from '../../features/product/product.repository'
import { readSession } from '../../features/product/session'
import { openTeam } from '../../features/product/team-navigation'
import type { TeamDashboardResponse } from '../../features/product/product.types'
import { TeamCrest } from '../product-ui'
import { TeamIcon } from './icons.h5'
import { useTeamFollow } from './follow.h5'
import { teamBackgroundUrl } from '../../features/managed-media/backgrounds.h5'

export interface TeamHoverRequest {
  teamId: string
  tournamentId: string
  anchor: HTMLElement
}
const reads = new Map<string, Promise<TeamDashboardResponse>>()
function readTeam(request: TeamHoverRequest) {
  const key = JSON.stringify([
    request.teamId,
    request.tournamentId,
    readSession()?.user.id ?? 'guest',
  ])
  let read = reads.get(key)
  if (!read) {
    read = productRepository
      .getTeamDashboard(request.teamId, request.tournamentId)
      .finally(() => reads.delete(key))
    reads.set(key, read)
  }
  return read
}

export function TeamHoverCard({
  request,
  onClose,
  onEnter,
  onLeave,
}: {
  request: TeamHoverRequest
  onClose: () => void
  onEnter: () => void
  onLeave: () => void
}) {
  const [data, setData] = useState<TeamDashboardResponse | null>(null)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)
  const follow = useTeamFollow(request.teamId)
  const card = useRef<HTMLElement>(null)
  const [position, setPosition] = useState({ left: 16, top: 16 })
  useEffect(() => {
    let active = true
    setData(null)
    setError('')
    void readTeam(request)
      .then((result) => {
        if (active) setData(result)
      })
      .catch((issue) => {
        if (active) setError(issue instanceof Error ? issue.message : '球队信息暂不可用')
      })
    return () => {
      active = false
    }
  }, [request.teamId, request.tournamentId, retry])
  useLayoutEffect(() => {
    const anchor = request.anchor.getBoundingClientRect()
    const rect = card.current?.getBoundingClientRect()
    const width = rect?.width ?? 336
    const height = rect?.height ?? 240
    const left = Math.max(16, Math.min(anchor.left - 16, window.innerWidth - width - 16))
    const below = anchor.bottom + 10
    const top =
      below + height <= window.innerHeight - 16 ? below : Math.max(16, anchor.top - height - 10)
    setPosition({ left, top })
  }, [request.anchor, data, error, follow.error])
  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopImmediatePropagation()
        onClose()
      }
    }
    const outside = (event: PointerEvent) => {
      if (
        event.target instanceof Element &&
        !event.target.closest('.team-hover-card') &&
        !request.anchor.contains(event.target)
      )
        onClose()
    }
    document.addEventListener('keydown', escape, true)
    document.addEventListener('pointerdown', outside)
    return () => {
      document.removeEventListener('keydown', escape, true)
      document.removeEventListener('pointerdown', outside)
    }
  }, [onClose, request.anchor])
  return createPortal(
    <aside
      ref={card}
      className="team-hover-card"
      aria-label="球队信息预览"
      style={position}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      onFocus={onEnter}
      onBlur={(event) => {
        if (
          !event.currentTarget.contains(event.relatedTarget) &&
          !event.currentTarget.matches(':hover')
        )
          onLeave()
      }}
    >
      {data ? (
        <>
          <div className="team-hover-card__cover">
            <img
              className="team-hover-card__banner"
              src={teamBackgroundUrl(data.team.coverUrl)}
              alt=""
              draggable={false}
            />
            <button
              data-team-control
              type="button"
              className="team-hover-card__follow"
              aria-pressed={follow.followed}
              aria-busy={follow.busy || follow.loading}
              disabled={follow.busy || follow.loading || follow.primary}
              onClick={(event) => {
                event.stopPropagation()
                void follow.toggle()
              }}
            >
              <TeamIcon name="heart" />
              {follow.followed ? '已关注' : '关注'}
            </button>
            <button
              data-team-action
              type="button"
              className="team-hover-card__identity"
              aria-label={`查看${data.team.name}详细资料`}
              onClick={() => void openTeam(request.teamId, request.tournamentId)}
            >
              <TeamCrest team={data.team} size="large" interactive={false} />
              <div>
                <strong>{data.team.name}</strong>
                <span>{data.team.collegeName ?? '校园球队'}</span>
                {data.team.motto ? <small>{data.team.motto}</small> : null}
              </div>
            </button>
          </div>
          <div className="team-hover-card__stats">
            <div>
              <strong>{data.roster.length}</strong>
              <span>球员</span>
            </div>
            <div>
              <strong>{data.stats.played}</strong>
              <span>比赛</span>
            </div>
            <div>
              <strong>{data.stats.won}</strong>
              <span>胜场</span>
            </div>
            <div>
              <strong>{data.stats.goalsFor}</strong>
              <span>进球</span>
            </div>
          </div>
          <p>
            {data.team.coachName ? `教练 ${data.team.coachName}` : '教练暂未登记'}
            {data.team.captainName ? ` · 队长 ${data.team.captainName}` : ''}
          </p>
          {follow.error ? (
            <p className="team-hover-card__error" role="alert">
              {follow.error}
              <button data-team-control type="button" onClick={follow.retry}>
                重试读取
              </button>
            </p>
          ) : null}
        </>
      ) : error ? (
        <div className="team-hover-card__state" role="alert">
          <span>{error}</span>
          <button data-team-control type="button" onClick={() => setRetry((value) => value + 1)}>
            重试
          </button>
        </div>
      ) : (
        <div className="team-hover-card__state" role="status">
          正在读取球队信息…
        </div>
      )}
    </aside>,
    document.body,
  )
}
