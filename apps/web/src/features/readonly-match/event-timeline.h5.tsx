import { useEffect, useMemo, useState, type ReactNode } from 'react'
import type { MatchExperienceResponse } from '../product/product.types'
import { eventLabel } from '../product/product.format'
import { PlayerTrigger } from '../../components/player-trigger/index.h5'
import { EventMediaThumb, MediaUploadButton } from '../managed-media/index.h5'
import type { MediaAsset } from '../managed-media/repository.h5'
import { MatchIcon, type MatchIconKind } from './match-icons.h5'
import { eventSide, minuteLabel, orderedEvents } from './lineup.logic'
import { isGoalEventType } from './goal-celebrations.h5'
import { hasCompleteGoalTimeline } from './match-bulletin.logic'
import './event-timeline.h5.scss'

type MatchEvent = MatchExperienceResponse['events'][number]
type Row =
  | { kind: 'pill'; key: string; label: string; tone: 'start' | 'half' | 'full' }
  | {
      kind: 'event'
      key: string
      side: 'home' | 'away'
      events: MatchEvent[]
      score: [number, number] | null
    }

const FINISHED = ['FINISHED', 'CONFIRMED', 'COMPLETED']

/** Desktop (≥721px) media query, live. */
export function useDesktopLayout() {
  const query = '(min-width: 721px)'
  const [desktop, setDesktop] = useState(() => window.matchMedia(query).matches)
  useEffect(() => {
    const list = window.matchMedia(query)
    const change = () => setDesktop(list.matches)
    list.addEventListener('change', change)
    return () => list.removeEventListener('change', change)
  }, [])
  return desktop
}

/** Chronological rows: kickoff, events (simultaneous same-team subs grouped), half-time, full-time. */
export function buildTimeline(match: MatchExperienceResponse): Row[] {
  const homeId = match.homeTeam?.id
  const rows: Row[] = [{ kind: 'pill', key: 'start', label: '比赛开始', tone: 'start' }]
  let home = 0
  let away = 0
  let halfShown = false
  const events = orderedEvents(match.events)
  const halfMinutes = match.periodMinutes ?? 45
  const completeGoals = hasCompleteGoalTimeline(match)
  const secondHalf = events.some((event) => event.minute > halfMinutes)
  for (const event of events) {
    if (!halfShown && event.minute > halfMinutes) {
      rows.push({
        kind: 'pill',
        key: 'half',
        label: completeGoals ? `半场 ${home}-${away}` : '中场 · 事件待补',
        tone: 'half',
      })
      halfShown = true
    }
    const side = eventSide(event, homeId)
    const previous = rows[rows.length - 1]
    if (
      event.type === 'SUBSTITUTION' &&
      previous?.kind === 'event' &&
      previous.side === side &&
      previous.events[0]!.type === 'SUBSTITUTION' &&
      previous.events[0]!.minute === event.minute &&
      previous.events[0]!.stoppageMinute === event.stoppageMinute
    ) {
      previous.events.push(event)
      continue
    }
    let score: [number, number] | null = null
    if (isGoalEventType(event.type) && event.type !== 'PENALTY_MISSED') {
      // An own goal is recorded against the scorer's team; the point goes to the other side.
      const forHome = event.type === 'OWN_GOAL' ? side === 'away' : side === 'home'
      if (forHome) home += 1
      else away += 1
      score = completeGoals ? [home, away] : null
    }
    rows.push({ kind: 'event', key: event.id, side, events: [event], score })
  }
  const finished = FINISHED.includes(match.status)
  if (!halfShown && (secondHalf || finished))
    rows.push({
      kind: 'pill',
      key: 'half',
      label: completeGoals ? `半场 ${home}-${away}` : '中场 · 事件待补',
      tone: 'half',
    })
  if (finished) {
    const finalHome = match.homeScore ?? home
    const finalAway = match.awayScore ?? away
    rows.push({ kind: 'pill', key: 'full', label: `全场 ${finalHome}-${finalAway}`, tone: 'full' })
  }
  return rows
}

export function DesktopEventTimeline({
  match,
  media,
}: {
  match: MatchExperienceResponse
  media: Map<string, MediaAsset>
}) {
  const rows = useMemo(() => buildTimeline(match), [match])
  return (
    <ol className="mt" aria-label="比赛事件时间线">
      {rows.map((row) =>
        row.kind === 'pill' ? (
          <li key={row.key} className={`mt-pill mt-pill--${row.tone}`}>
            <span>{row.label}</span>
          </li>
        ) : (
          <TimelineRow key={row.key} row={row} match={match} media={media} />
        ),
      )}
    </ol>
  )
}

function TimelineRow({
  row,
  match,
  media,
}: {
  row: Extract<Row, { kind: 'event' }>
  match: MatchExperienceResponse
  media: Map<string, MediaAsset>
}) {
  const first = row.events[0]!
  const goal = isGoalEventType(first.type)
  const asset = row.events.map((event) => media.get(event.id)).find(Boolean)
  const label = `${minuteLabel(first)} ${eventLabel(first.type)}${first.player ? ` · ${first.player.displayName}` : ''}`
  return (
    <li className={`mt-row mt-row--${row.side}`} data-event-type={first.type}>
      <div className="mt-side">
        <div className="mt-media">
          {asset ? (
            <EventMediaThumb asset={asset} label={label} />
          ) : (
            <AddMedia eventId={first.id} label={label} />
          )}
        </div>
        <div className={`mt-card ${goal ? 'mt-card--goal' : ''}`}>
          <EventCard events={row.events} score={row.score} tournamentId={match.tournamentId} />
        </div>
      </div>
      <div className={`mt-node ${goal ? 'mt-node--goal' : ''}`}>
        <time>{minuteLabel(first)}</time>
      </div>
    </li>
  )
}

function AddMedia({
  eventId,
  label,
  corner = false,
}: {
  eventId: string
  label: string
  corner?: boolean
}) {
  return (
    <MediaUploadButton
      purpose="EVENT_CLIP"
      targetId={eventId}
      renderTrigger={({ open, busy }) => (
        <button
          type="button"
          data-media-control
          className={`mt-add ${corner ? 'mt-add--corner' : ''}`}
          aria-label={`为「${label}」上传 GIF 或短视频`}
          title="上传 GIF / 短视频"
          aria-busy={busy}
          disabled={busy}
          onClick={(event) => {
            event.stopPropagation()
            open()
          }}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 5v14M5 12h14" />
          </svg>
        </button>
      )}
    />
  )
}

function EventCard({
  events,
  score,
  tournamentId,
}: {
  events: MatchEvent[]
  score: [number, number] | null
  tournamentId: string
}) {
  const first = events[0]!
  if (first.type === 'SUBSTITUTION') {
    return (
      <div className="mt-subs">
        {events.map((event) => (
          <div className="mt-sub" key={event.id}>
            <span className="mt-line">
              <SubArrow up />
              <Person
                player={event.relatedPlayer}
                tournamentId={tournamentId}
                fallback="换上球员"
              />
            </span>
            <span className="mt-line mt-line--muted">
              <SubArrow />
              <Person player={event.player} tournamentId={tournamentId} fallback="换下球员" />
            </span>
          </div>
        ))}
      </div>
    )
  }
  if (isGoalEventType(first.type)) {
    return (
      <>
        <span className="mt-line mt-line--main">
          <MatchIcon kind={first.type as MatchIconKind} />
          <Person
            player={first.player}
            tournamentId={tournamentId}
            fallback={first.team.shortName}
          />
          {first.type === 'OWN_GOAL' ? <small className="mt-tag">乌龙</small> : null}
          {first.type === 'PENALTY_SCORED' ? <small className="mt-tag">点球</small> : null}
          {score ? <b className="mt-score">{`${score[0]}-${score[1]}`}</b> : null}
        </span>
        {first.relatedPlayer ? (
          <span className="mt-line mt-line--muted">
            <MatchIcon kind="ASSIST" />
            <span className="mt-assist">
              助攻 <Person player={first.relatedPlayer} tournamentId={tournamentId} />
            </span>
          </span>
        ) : null}
      </>
    )
  }
  const reason = cardReason(first)
  return (
    <>
      <span className="mt-line mt-line--main">
        <MatchIcon kind={first.type as MatchIconKind} />
        <Person player={first.player} tournamentId={tournamentId} fallback={first.team.shortName} />
      </span>
      {reason ? <span className="mt-line mt-line--muted">{reason}</span> : null}
    </>
  )
}

/** "邓屹辰战术犯规" → "战术犯规": the reason without the player's own name. */
function cardReason(event: MatchEvent): string {
  const text = event.description?.trim() ?? ''
  if (!text) return ['YELLOW_CARD', 'RED_CARD'].includes(event.type) ? '' : eventLabel(event.type)
  const name = event.player?.displayName ?? ''
  const stripped = name && text.startsWith(name) ? text.slice(name.length).trim() : text
  return stripped.replace(/^[，,、:：\s]+/, '')
}

function Person({
  player,
  tournamentId,
  fallback = '',
}: {
  player: MatchEvent['player']
  tournamentId: string
  fallback?: string
}): ReactNode {
  if (!player) return <span className="mt-person">{fallback}</span>
  return (
    <span className="mt-person match-event-player" data-match-resource="player">
      <PlayerTrigger playerId={player.id} tournamentId={tournamentId} name={player.displayName}>
        {player.displayName}
      </PlayerTrigger>
    </span>
  )
}

export function SubArrow({ up = false }: { up?: boolean }) {
  return (
    <span
      className={`mt-sub-arrow ${up ? 'mt-sub-arrow--on' : 'mt-sub-arrow--off'}`}
      role="img"
      aria-label={up ? '换上' : '换下'}
    >
      <svg viewBox="0 0 16 16" aria-hidden="true">
        <path d={up ? 'M8 12V4M4.5 7.5 8 4l3.5 3.5' : 'M8 4v8M4.5 8.5 8 12l3.5-3.5'} />
      </svg>
    </span>
  )
}
