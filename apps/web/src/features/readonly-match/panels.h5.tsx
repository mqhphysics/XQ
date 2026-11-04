import { useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import { TeamCrest } from '../../components/product-ui'
import { PlayerAvatar } from '../../components/player-avatar.h5'
import { eventLabel, positionLabel } from '../product/product.format'
import { openPlayer } from '../product/player-navigation'
import type { MatchExperienceResponse } from '../product/product.types'
import {
  collectPlayerEvents,
  eventSide,
  lineupHasAppearances,
  lineupSections,
  mergeAppearanceEvents,
  minuteLabel,
  orderedEvents,
  playerEventDetails,
  playerAppearanceLabel,
  unavailableReason,
  type MatchLineup,
  type PlayerMatchEvents,
} from './lineup.logic'
import './panels.h5.scss'
import { MatchIcon, type MatchIconKind } from './match-icons.h5'
import { createLineupDisplay, type PitchLane } from './lineup-display.h5'
import { PlayerTrigger } from '../../components/player-trigger/index.h5'
import { GoalMedia, useMatchGoalMedia } from '../managed-media/index.h5'
import type { MediaAsset } from '../managed-media/repository.h5'
import { isGoalEventType } from './goal-celebrations.h5'
import { DesktopEventTimeline, SubArrow, useDesktopLayout } from './event-timeline.h5'

export function LineupsPanel({ match }: { match: MatchExperienceResponse }) {
  return (
    <section className="match-tab-content match-lineups" aria-label="双方阵容">
      {match.lineups.length === 0 ? (
        <p className="match-lineups__empty">阵容尚未公布</p>
      ) : (
        <DualLineups match={match} />
      )}
      <p className="match-lineups__footnote">点击头像查看本场事件，点击姓名查看球员资料。</p>
      {!!match.officials?.length && <section className="match-officials" aria-label="裁判组">
        <h3>裁判组</h3><div>{match.officials.map(official => <article key={official.role}>
          <span>{{ REFEREE: '主裁判', ASSISTANT_REFEREE_1: '第一助理', ASSISTANT_REFEREE_2: '第二助理', FOURTH_OFFICIAL: '第四官员' }[official.role]}</span>
          <strong>{official.displayName}</strong>
        </article>)}</div>
      </section>}
    </section>
  )
}

const PITCH_LENGTH = 105
const PITCH_WIDTH = 68

/**
 * Lineup points are 0–100 in each team's own half: `y` is depth from its goal line towards
 * halfway, `x` is lateral. Map them to metres so every starter stands inside his half's lines:
 * keeper ~7.5 m off the goal line, the most advanced row ~7 m short of halfway, 6 m touchline margin.
 */
function pitchMetres(point: { x: number; y: number }, side: number) {
  const depth = 1.5 + (Math.min(100, Math.max(0, point.y)) / 100) * 50
  const lateral = 5 + (Math.min(100, Math.max(0, point.x)) / 100) * (PITCH_WIDTH - 10)
  return { x: side === 0 ? depth : PITCH_LENGTH - depth, y: lateral }
}

const LANE_DEPTH: Record<PitchLane, number> = {
  GOALKEEPER: 6,
  DEFENDER: 17,
  MIDFIELDER: 31.5,
  FORWARD: 44,
}

/** Distance from the touchline of the outermost player in a row of `count`. */
function rowMargin(lane: PitchLane, count: number) {
  if (lane === 'FORWARD') return count >= 3 ? 8 : 22
  if (lane === 'MIDFIELDER') return count >= 4 ? 7 : count === 3 ? 8.5 : 20
  return count >= 4 ? 6.5 : count === 3 ? 11 : 19
}

/**
 * Default (unpublished) shape in metres on a 105×68 pitch: rows use the full width, so
 * full-backs and wide midfielders/wingers sit near the touchlines; wide defenders and wide
 * midfielders push on a little, a lone central midfielder sits deeper and wingers tuck in
 * behind a centre-forward. Everything stays inside the half and the lines.
 */
function defaultMetres(lane: PitchLane, index: number, count: number, side: number) {
  const margin = rowMargin(lane, count)
  const lateral =
    count <= 1 ? PITCH_WIDTH / 2 : margin + (index * (PITCH_WIDTH - margin * 2)) / (count - 1)
  const edge = count >= 3 && (index === 0 || index === count - 1)
  const centre = count >= 3 && count % 2 === 1 && index === (count - 1) / 2
  let depth = LANE_DEPTH[lane]
  if (lane === 'DEFENDER' && edge) depth += count >= 4 ? 4 : 1.5
  if (lane === 'MIDFIELDER' && edge) depth += 3
  if (lane === 'MIDFIELDER' && centre) depth -= 2.5
  if (lane === 'FORWARD' && edge) depth -= 3
  return { x: side === 0 ? depth : PITCH_LENGTH - depth, y: lateral }
}

function playerMetres(
  display: ReturnType<typeof createLineupDisplay>,
  entry: ReturnType<typeof createLineupDisplay>['players'][number],
  side: number,
) {
  if (display.source === 'PUBLISHED') return pitchMetres(entry.point, side)
  const row = display.players.filter((item) => item.lane === entry.lane)
  const ordered = [...row].sort((a, b) => a.point.x - b.point.x)
  return defaultMetres(entry.lane, ordered.indexOf(entry), row.length, side)
}

function DualLineups({ match }: { match: MatchExperienceResponse }) {
  const [selected, setSelected] = useState<string | null>(null)
  const lineups = [...match.lineups].sort(
    (a, b) => Number(b.team.id === match.homeTeam?.id) - Number(a.team.id === match.homeTeam?.id),
  )
  const events = useMemo(
    () =>
      new Map(
        lineups.map((lineup) => [
          lineup.team.id,
          mergeAppearanceEvents(
            collectPlayerEvents(match.events, lineup.team.id),
            lineup,
            (match.periodMinutes ?? 45) * 2,
          ),
        ]),
      ),
    [match.events, match.lineups, match.periodMinutes],
  )
  const selectedLineup = lineups.find((lineup) =>
    lineup.players.some((player) => player.id === selected),
  )
  const selectedPlayer = selectedLineup?.players.find((player) => player.id === selected)
  return (
    <div className="match-horizontal-lineups">
      <div className="match-horizontal-lineups__heading">
        {lineups.map((lineup) => (
          <div key={lineup.team.id}>
            <TeamCrest team={lineup.team} size="small" />
            <strong>{lineup.team.name}</strong>
            <span>
              {lineup.lineupSource === 'TEAM_DEFAULT'
                ? `默认阵容 · ${lineup.formation}`
                : lineup.lineupSource === 'TEAM_ROSTER'
                  ? '球队名单'
                  : lineup.formation
                    ? `阵型 ${lineup.formation}`
                    : '本场阵容'}
            </span>
          </div>
        ))}
      </div>
      <div className="match-horizontal-pitch" aria-label="双方首发横向球场">
        <svg
          className="match-horizontal-pitch__lines"
          viewBox="0 0 105 68"
          aria-hidden="true"
          fill="none"
        >
          <rect x=".5" y=".5" width="104" height="67" />
          <path d="M52.5 .5v67M.5 13.84H16.5v40.32H.5M104.5 13.84H88.5v40.32h16M.5 24.84h5v18.32h-5M104.5 24.84h-5v18.32h5" />
          <circle cx="52.5" cy="34" r="9.15" />
          <circle cx="52.5" cy="34" r=".6" fill="currentColor" />
          <circle cx="11" cy="34" r=".5" fill="currentColor" />
          <circle cx="94" cy="34" r=".5" fill="currentColor" />
          <path d="M16.5 26.68a9.15 9.15 0 0 1 0 14.64M88.5 26.68a9.15 9.15 0 0 0 0 14.64M.5 1.5a1 1 0 0 0 1-1M103.5 .5a1 1 0 0 0 1 1M.5 66.5a1 1 0 0 1 1 1M103.5 67.5a1 1 0 0 1 1-1" />
        </svg>
        {lineups.map((lineup, side) => {
          const { starters } = lineupSections(lineup)
          const teamEvents = events.get(lineup.team.id)
          const display = createLineupDisplay(starters, true, teamEvents)
          return (
            <div
              key={lineup.team.id}
              className="match-pitch-half match-pitch-half--positioned"
              data-side={side}
              data-position-source={display.source}
              aria-label={`${lineup.team.name}${lineup.lineupSource === 'TEAM_DEFAULT' ? '默认阵容' : display.source === 'PUBLISHED' ? '已公布首发站位' : '按球员位置默认排布'}`}
            >
              {display.players.length === 8 && (
                <span className="match-pitch-formation">
                  {(display.source === 'PUBLISHED' ? lineup.formation : null) ||
                    (['DEFENDER', 'MIDFIELDER', 'FORWARD'] as const)
                      .map((lane) => display.players.filter((entry) => entry.lane === lane).length)
                      .filter(Boolean)
                      .join('-')}
                </span>
              )}
              {starters.length ? (
                display.players.map((entry) => {
                  const { player, point, lane } = entry
                  const metres = playerMetres(display, entry, side)
                  const playerEvents = teamEvents?.get(player.id)
                  return (
                    <div
                      key={player.id}
                      className={`pitch-player ${lane === 'GOALKEEPER' ? 'pitch-player--goalkeeper' : ''}`}
                      style={
                        {
                          left: `${side === 0 ? 7 + point.y * 0.86 : 93 - point.y * 0.86}%`,
                          top: `${8 + point.x * 0.84}%`,
                          // Desktop: true pitch coordinates (metres on a 105×68 pitch).
                          '--pitch-x': `${(metres.x / PITCH_LENGTH) * 100}%`,
                          '--pitch-y': `${(metres.y / PITCH_WIDTH) * 100}%`,
                        } as CSSProperties
                      }
                    >
                      <button
                        type="button"
                        className="pitch-player__hit"
                        aria-pressed={selected === player.id}
                        aria-label={`${player.displayName}，${player.shirtNumber ?? '无'}号，${positionLabel(player.position)}，查看本场事件`}
                        onClick={() => setSelected(selected === player.id ? null : player.id)}
                      >
                        <span className="pitch-player__avatar">
                          {player.identityPending ? (
                            <span
                              className="user-avatar user-avatar--small"
                              aria-label="待确认姓名的球员"
                            >
                              {player.shirtNumber}
                            </span>
                          ) : (
                            <PlayerAvatar
                              {...(player.avatarUrl ? { avatarUrl: player.avatarUrl } : {})}
                              name={player.displayName}
                              color={player.profileColor ?? lineup.team.primaryColor}
                              size="small"
                            />
                          )}
                          <SubCorner {...(playerEvents ? { events: playerEvents } : {})} />
                          <PitchIcons {...(playerEvents ? { events: playerEvents } : {})} />
                          {player.isCaptain && (
                            <span className="pitch-player__captain" title="队长" aria-label="队长">
                              C
                            </span>
                          )}
                        </span>
                        <span className="pitch-player__number">{player.shirtNumber ?? '—'}</span>
                      </button>
                      {player.identityPending ? (
                        <span className="pitch-player__name">{player.displayName}</span>
                      ) : (
                        <PlayerTrigger
                          playerId={player.id}
                          tournamentId={match.tournamentId}
                          name={player.displayName}
                        >
                          <span className="pitch-player__name">{player.displayName}</span>
                        </PlayerTrigger>
                      )}
                    </div>
                  )
                })
              ) : (
                <p className="match-horizontal-pitch__empty">本场首发尚未确认</p>
              )}
            </div>
          )
        })}
      </div>
      {selectedPlayer && selectedLineup && (
        <div className="match-player-detail" aria-live="polite">
          <strong>
            {selectedPlayer.shirtNumber ?? '—'}号 · {selectedPlayer.displayName}
          </strong>
          <span>
            {positionLabel(selectedPlayer.position)} ·{' '}
            {playerAppearanceLabel(
              selectedPlayer,
              lineupHasAppearances(selectedLineup),
              events.get(selectedLineup.team.id)?.get(selectedPlayer.id),
            )}
          </span>
          <span>
            {playerEventDetails(events.get(selectedLineup.team.id)?.get(selectedPlayer.id)).join(
              ' · ',
            ) || '暂无已公布比赛事件'}
          </span>
          {!selectedPlayer.identityPending && (
            <button
              type="button"
              data-match-resource="player"
              className="match-player-detail__profile"
              onClick={() => void openPlayer(selectedPlayer.id, match.tournamentId)}
            >
              查看球员资料 ↗
            </button>
          )}
        </div>
      )}
      <div className="match-bench" aria-label="替补阵容">
        <h3>
          {lineups.some((lineup) =>
            ['TEAM_DEFAULT', 'TEAM_ROSTER'].includes(lineup.lineupSource ?? ''),
          )
            ? '其余队员'
            : '替补阵容'}
        </h3>
        <div className="match-bench__teams">
          {lineups.map((lineup) => {
            const { bench } = lineupSections(lineup)
            return (
              <div key={lineup.team.id} className="match-bench__team">
                <header>
                  <TeamCrest team={lineup.team} size="small" />
                  <strong>{lineup.team.shortName}</strong>
                </header>
                {bench.length ? (
                  bench.map((player) => (
                    <BenchRow
                      key={player.id}
                      player={player}
                      lineup={lineup}
                      events={events.get(lineup.team.id)?.get(player.id)}
                      selected={selected === player.id}
                      onSelect={() => setSelected(selected === player.id ? null : player.id)}
                    />
                  ))
                ) : (
                  <p className="match-bench__empty">暂无替补名单</p>
                )}
              </div>
            )
          })}
        </div>
      </div>
      {lineups.some((lineup) => lineupSections(lineup).unavailable.length > 0) && (
        <div className="match-unavailable" aria-label="伤停信息">
          <h3>伤停信息</h3>
          <div className="match-unavailable__teams">
            {lineups.map((lineup) => {
              const { unavailable } = lineupSections(lineup)
              return (
                <div key={lineup.team.id} className="match-unavailable__team">
                  <header>
                    <TeamCrest team={lineup.team} size="small" />
                    <strong>{lineup.team.shortName}</strong>
                  </header>
                  {unavailable.map((player) => (
                    <div className="match-unavailable__row" key={player.id}>
                      <span className="match-unavailable__cross" aria-hidden="true">
                        +
                      </span>
                      <span>
                        <strong>{player.displayName}</strong>
                        <small>{unavailableReason(player)}</small>
                      </span>
                    </div>
                  ))}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

function BenchRow({
  player,
  lineup,
  events,
  selected,
  onSelect,
}: {
  player: MatchLineup['players'][number]
  lineup: MatchLineup
  events: PlayerMatchEvents | undefined
  selected: boolean
  onSelect: () => void
}) {
  const minute = events?.on[0] ?? events?.off[0]
  const incoming = Boolean(events?.on.length)
  return (
    <button type="button" className="match-bench-row" aria-pressed={selected} onClick={onSelect}>
      <span
        className="match-bench-row__number"
        style={numberStyle(lineup.team.primaryColor, lineup.team.secondaryColor)}
      >
        {player.shirtNumber ?? '—'}
        {player.isCaptain && (
          <span className="pitch-player__captain" title="队长" aria-label="队长">
            C
          </span>
        )}
      </span>
      <span className="match-bench-row__copy">
        <strong>{player.displayName}</strong>
        <small>{positionLabel(player.position)}</small>
      </span>
      {minute ? (
        <span className={`match-bench-row__sub ${incoming ? 'is-on' : 'is-off'}`}>
          <SubArrow up={incoming} />
          {minute}
        </span>
      ) : null}
    </button>
  )
}

function numberStyle(primary: string | null, secondary: string | null): CSSProperties {
  return {
    background: primary || '#254c34',
    color: secondary || '#fff9df',
  }
}

function SubCorner({ events }: { events?: PlayerMatchEvents | undefined }) {
  if (!events) return null
  const chips: Array<{ kind: 'ON' | 'OFF'; minute: string }> = [
    ...events.off.map((minute) => ({ kind: 'OFF' as const, minute })),
    ...events.on.map((minute) => ({ kind: 'ON' as const, minute })),
  ]
  if (!chips.length) return null
  return (
    <span className="pitch-player__subs">
      {chips.map((chip, index) => (
        <span
          key={`${chip.kind}-${index}`}
          className={`pitch-player__sub pitch-player__sub--${chip.kind.toLowerCase()}`}
          title={chip.kind === 'ON' ? `换上 ${chip.minute}` : `换下 ${chip.minute}`}
        >
          <SubArrow up={chip.kind === 'ON'} />
          {chip.minute}
        </span>
      ))}
    </span>
  )
}

function PitchIcons({ events }: { events?: PlayerMatchEvents | undefined }) {
  if (!events) return null
  const icons: Array<{ kind: MatchIconKind; key: string }> = [
    ...events.goals.map((_, index) => ({ kind: 'GOAL' as const, key: `g${index}` })),
    ...events.assists.map((_, index) => ({ kind: 'ASSIST' as const, key: `a${index}` })),
    ...events.ownGoals.map((_, index) => ({ kind: 'OWN_GOAL' as const, key: `og${index}` })),
  ]
  if (!icons.length) return null
  return (
    <span className="pitch-player__icons">
      {icons.map((icon) => (
        <MatchIcon key={icon.key} kind={icon.kind} />
      ))}
    </span>
  )
}

export function EventsPanel({ match }: { match: MatchExperienceResponse }) {
  const media = useMatchGoalMedia(match.id)
  const desktop = useDesktopLayout()
  const goalMedia = new Map<string, (typeof media.items)[number]>()
  for (const item of media.items)
    if (!goalMedia.has(item.targetId)) goalMedia.set(item.targetId, item)
  const homeId = match.homeTeam?.id
  if (desktop)
    return (
      <section className="match-tab-content match-events" aria-label="比赛事件">
        {match.events.length ? (
          <DesktopEventTimeline match={match} media={goalMedia} />
        ) : (
          <p className="match-lineups__empty">暂无已公布比赛事件</p>
        )}
      </section>
    )
  return (
    <section className="match-tab-content match-events" aria-label="比赛事件">
      {match.events.length ? (
        <ol className="match-events__list">
          {orderedEvents(match.events).map((event) => {
            const side = eventSide(event, homeId)
            const uploaded = goalMedia.get(event.id)
            const body = (
              <EventBody event={event} match={match} {...(uploaded ? { uploaded } : {})} />
            )
            return (
              <li
                key={event.id}
                className={`match-event match-event--${side}`}
                data-event-type={event.type}
                data-side={side}
                title={event.description ?? event.team.name}
              >
                {side === 'home' ? body : <span className="match-event__spacer" />}
                <div className="match-event__axis">
                  <time>{minuteLabel(event)}</time>
                  <span className="match-events__type" title={eventLabel(event.type)}>
                    <MatchIcon kind={event.type as MatchIconKind} />
                  </span>
                </div>
                {side === 'away' ? body : <span className="match-event__spacer" />}
              </li>
            )
          })}
        </ol>
      ) : (
        <p className="match-lineups__empty">暂无已公布比赛事件</p>
      )}
      {media.error ? <p role="status">{media.error}</p> : null}
    </section>
  )
}

function EventBody({
  event,
  match,
  uploaded,
}: {
  event: MatchExperienceResponse['events'][number]
  match: MatchExperienceResponse
  uploaded?: MediaAsset | undefined
}) {
  const goal = isGoalEventType(event.type)
  return (
    <div className="match-event__side">
      <div className="match-event__copy">
        {event.type === 'SUBSTITUTION' && <MatchIcon kind="OFF" />}
        <EventPlayerLink player={event.player} tournamentId={match.tournamentId}>
          {event.player?.displayName ?? event.team.shortName}
        </EventPlayerLink>
        {event.relatedPlayer && (event.type === 'GOAL' || event.type === 'SUBSTITUTION') ? (
          <>
            <MatchIcon kind={event.type === 'SUBSTITUTION' ? 'ON' : 'ASSIST'} />
            <EventPlayerLink player={event.relatedPlayer} tournamentId={match.tournamentId}>
              {event.relatedPlayer.displayName}
            </EventPlayerLink>
          </>
        ) : null}
      </div>
      {goal && uploaded ? (
        <div className="match-event__media">
          <GoalMedia asset={uploaded} />
        </div>
      ) : null}
    </div>
  )
}

function EventPlayerLink({
  player,
  tournamentId,
  children,
}: {
  player: MatchExperienceResponse['events'][number]['player']
  tournamentId: string
  children: ReactNode
}) {
  if (!player) return <>{children}</>
  return (
    <span className="match-event-player" data-match-resource="player">
      <PlayerTrigger playerId={player.id} tournamentId={tournamentId} name={player.displayName}>
        {children}
      </PlayerTrigger>
    </span>
  )
}
