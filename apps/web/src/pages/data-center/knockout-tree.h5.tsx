import { useLayoutEffect, useRef, useState } from 'react'
import { useExpandingTagShift } from '../../components/interactions/expanding-tags.h5'
import { openMatchFromUrl } from '../../features/product/match-navigation'
import { TeamCrest, TeamName } from '../../components/product-ui'

import { matchStatusLabel } from '../../features/product/product.format'
import { matchDetailUrl } from '../../features/competition/competition.logic'
import type {
  CompetitionDataResponse,
  MatchSummary,
  TeamSummary,
} from '../../features/product/product.types'
import { knockoutMatchTime, matchWinnerId, knockoutRounds } from './knockout-display.logic'
import { TbdCrest, TBD_LABEL } from '../../components/tbd-team'

type Props = {
  data: CompetitionDataResponse & { resultsMode?: string }
  expanded: boolean
  onExpand: (event: React.MouseEvent<HTMLButtonElement>) => void
}

export function scrollPanelColumn(event: React.WheelEvent<HTMLElement>) {
  const scroller = event.currentTarget.parentElement?.querySelector<HTMLElement>(
    '.data-desktop__panel-scroll',
  )
  if (!scroller) return
  scroller.scrollTop += event.deltaY
  scroller.scrollLeft += event.deltaX
}

type Orientation = 'vertical' | 'horizontal'
const ORIENTATION_KEY = 'xiaoqiu.bracket.orientation'

function readOrientation(): Orientation {
  try {
    return localStorage.getItem(ORIENTATION_KEY) === 'horizontal' ? 'horizontal' : 'vertical'
  } catch {
    return 'vertical'
  }
}

export function KnockoutPanel({ data, expanded, onExpand }: Props) {
  const { rounds, thirdPlace, eightTeam } = knockoutRounds(data)
  const structured =
    rounds.length === 0 ||
    eightTeam ||
    (rounds.length === 2 && rounds[0]?.matches.length === 2 && rounds[1]?.matches.length === 1)
  const displayedRounds: Round[] = rounds.length
    ? rounds
    : [4, 2, 1].map((count, index) => ({
        id: `pending-${index}`,
        name: ['八强', '半决赛', '决赛'][index]!,
        matches: Array.from({ length: count }, () => null),
      }))
  const [orientation, setOrientationState] = useState<Orientation>(readOrientation)
  const orientationRef = useRef<HTMLDivElement>(null)
  useExpandingTagShift(orientationRef, orientation)
  const setOrientation = (next: Orientation) => {
    setOrientationState(next)
    try {
      localStorage.setItem(ORIENTATION_KEY, next)
    } catch {
      /* private mode: keep in memory */
    }
  }
  return (
    <section
      className={
        'data-desktop__card data-desktop__panel data-desktop__knockout-panel ' +
        (expanded ? 'is-expanded' : 'is-collapsed')
      }
      aria-label="淘汰赛面板"
    >
      <div className="data-desktop__card-head">
        <button
          type="button"
          className="data-desktop__panel-toggle"
          aria-expanded={expanded}
          aria-controls="data-knockout-content"
          onClick={onExpand}
        >
          <h2>淘汰赛</h2>
          <span aria-hidden="true">{expanded ? '完整对阵' : '展开 ↗'}</span>
        </button>
        {expanded && structured ? (
          <div
            ref={orientationRef}
            className="data-bracket-switch"
            role="radiogroup"
            aria-label="晋级图方向"
          >
            {(['vertical', 'horizontal'] as const).map((value) => (
              <button
                key={value}
                type="button"
                role="radio"
                data-xq-tag={value}
                aria-checked={orientation === value}
                className={
                  'data-bracket-switch__option' + (orientation === value ? ' is-active' : '')
                }
                onClick={() => setOrientation(value)}
              >
                <svg viewBox="0 0 16 16" aria-hidden="true">
                  {value === 'vertical' ? (
                    <path d="M2 3h3M6.5 3h3M11 3h3M3.5 3v3.5h9V3M8 6.5V10M5 10h6M8 10v3" />
                  ) : (
                    <path d="M3 2v3M3 6.5v3M3 11v3M3 3.5h3.5v9H3M6.5 8H10M10 5v6M10 8h3" />
                  )}
                </svg>
                {value === 'vertical' ? '竖版' : '横版'}
              </button>
            ))}
          </div>
        ) : (
          <span className="data-desktop__knockout-caption">
            {eightTeam ? '八强晋级图' : '晋级图'}
          </span>
        )}
      </div>
      <div id="data-knockout-content" className="data-desktop__panel-scroll">
        {rounds.length === 0 || (structured && expanded) ? (
          orientation === 'vertical' ? (
            <VerticalBracket rounds={displayedRounds} thirdPlace={thirdPlace ?? null} />
          ) : (
            <HorizontalBracket rounds={displayedRounds} thirdPlace={thirdPlace ?? null} />
          )
        ) : eightTeam ? (
          <div className="data-desktop__knockout-map" aria-label="八强、半决赛和决赛晋级图">
            <svg
              className="data-desktop__knockout-lines"
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
              aria-hidden="true"
            >
              <g fill="none" stroke="currentColor" strokeWidth="0.45">
                <g data-branch="q0">
                  <polyline points="10,14 10,19 25,19 25,22" />
                  <polyline points="40,14 40,19 25,19" />
                </g>
                <g data-branch="q1">
                  <polyline points="60,14 60,19 75,19 75,22" />
                  <polyline points="90,14 90,19 75,19" />
                </g>
                <g data-branch="s0">
                  <polyline points="25,36 25,40 50,40 50,44" />
                  <polyline points="75,36 75,40 50,40" />
                </g>
                <g data-branch="s1">
                  <polyline points="50,61 50,63 25,63 25,65" />
                  <polyline points="50,63 75,63 75,65" />
                </g>
                <g data-branch="q2">
                  <polyline points="25,79 25,82 10,82 10,83" />
                  <polyline points="25,82 40,82 40,83" />
                </g>
                <g data-branch="q3">
                  <polyline points="75,79 75,82 60,82 60,83" />
                  <polyline points="75,82 90,82 90,83" />
                </g>
              </g>
            </svg>
            {rounds[0]!.matches.map((match, index) => (
              <TreeMatch
                key={match.id}
                match={match}
                expanded={expanded}
                className={`data-desktop__tree-match--quarter data-desktop__tree-match--q${index}`}
              />
            ))}
            {rounds[1]!.matches.map((match, index) => (
              <TreeMatch
                key={match.id}
                match={match}
                expanded={expanded}
                className={`data-desktop__tree-match--semi data-desktop__tree-match--s${index}`}
              />
            ))}
            <TreeMatch
              match={rounds[2]!.matches[0]!}
              expanded={expanded}
              className="data-desktop__tree-match--final"
            />
          </div>
        ) : (
          <div className="data-desktop__knockout-rounds">
            {rounds.map((round) => (
              <div className="data-desktop__knockout-round" key={round.id}>
                <h3>{round.name}</h3>
                {round.matches.map((match) => (
                  <TreeMatch key={match.id} match={match} expanded={expanded} />
                ))}
              </div>
            ))}
          </div>
        )}
        {thirdPlace && !(structured && expanded) && (
          <section className="data-desktop__third-place" aria-label="季军赛">
            <h3>季军赛</h3>
            <TreeMatch
              match={thirdPlace}
              expanded={expanded}
              className="data-desktop__tree-match--third"
            />
          </section>
        )}
      </div>
      <div className="data-desktop__knockout-foot">
        <span>{eightTeam ? '八强 → 半决赛 → 决赛' : '淘汰赛晋级路线'}</span>
      </div>
      {!expanded && (
        <button
          type="button"
          className="data-desktop__panel-cover"
          aria-label="展开淘汰赛"
          onClick={onExpand}
          onWheel={scrollPanelColumn}
        >
          <span className="sr-only">展开淘汰赛</span>
        </button>
      )}
    </section>
  )
}

function TreeMatch({
  match,
  expanded,
  className = '',
}: {
  match: MatchSummary
  expanded: boolean
  className?: string
}) {
  const winner = matchWinnerId(match)
  return (
    <div className={'data-desktop__tree-match ' + className} data-match-id={match.id}>
      <div className="data-desktop__tree-pair">
        <TreeTeam
          team={match.homeTeam}
          placeholder={match.homePlaceholder}
          winner={winner}
          expanded={expanded}
          tournamentId={match.tournamentId}
        />
        <a
          className="data-desktop__tree-score"
          tabIndex={expanded ? 0 : -1}
          href={matchDetailUrl(match.id)}
          onClick={openMatch}
          aria-label={`${match.homeTeam?.name ?? TBD_LABEL} 对 ${match.awayTeam?.name ?? TBD_LABEL}，${scoreLabel(match)}，查看比赛`}
        >
          <strong>{scoreLabel(match)}</strong>
          <time className="data-desktop__tree-date" dateTime={match.scheduledStartAt ?? undefined}>
            {knockoutMatchTime(match.scheduledStartAt, !expanded)}
          </time>
          {expanded && !['FINISHED', 'CONFIRMED', 'SCHEDULED'].includes(match.status) && (
            <small>{matchStatusLabel(match.status)}</small>
          )}
        </a>
        <TreeTeam
          team={match.awayTeam}
          placeholder={match.awayPlaceholder}
          winner={winner}
          expanded={expanded}
          tournamentId={match.tournamentId}
        />
      </div>
      {expanded && match.homePenaltyScore !== null && match.awayPenaltyScore !== null && (
        <span className="data-desktop__tree-penalties">
          点球 {match.homePenaltyScore}–{match.awayPenaltyScore}
        </span>
      )}
    </div>
  )
}

function TreeTeam({
  team,
  placeholder,
  winner,
  expanded,
  tournamentId,
}: {
  team: TeamSummary | null
  placeholder?: string | null | undefined
  winner: string | null
  expanded: boolean
  tournamentId: string
}) {
  return (
    <div
      className={
        'data-desktop__tree-team ' + (winner && team?.id !== winner ? 'is-eliminated' : '')
      }
      title={team?.name ?? placeholder ?? TBD_LABEL}
      data-team-id={team?.id ?? 'pending'}
      data-team-code={team?.teamCode ?? ''}
      data-team-tournament={tournamentId}
    >
      <div className="data-desktop__tree-badge">
        {team ? (
          <TeamCrest team={team} size="small" interactive={expanded} />
        ) : (
          <svg
            viewBox="0 0 64 64"
            className="data-desktop__empty-crest"
            role="img"
            aria-label="待定球队队徽"
          >
            <circle cx="32" cy="32" r="29" fill="#edf2e8" stroke="#b5c4ac" strokeWidth="1.5" />
            <circle cx="32" cy="32" r="23.5" fill="#f8faf4" stroke="#cad5c3" />
            <path
              d="M25.5 24.5a6.5 6.5 0 0 1 13 0c0 4.5-6.5 5.5-6.5 10"
              fill="none"
              stroke="#7a9070"
              strokeWidth="3.5"
              strokeLinecap="round"
            />
            <circle cx="32" cy="41.5" r="2" fill="#7a9070" />
          </svg>
        )}
      </div>
      {expanded && (
        <div className="data-desktop__tree-name">
          <TeamName
            team={team}
            tournamentId={tournamentId}
            className="data-desktop__tree-team-label"
            fallback={placeholder ?? '席位待定'}
          />
        </div>
      )}
    </div>
  )
}

function scoreLabel(match: MatchSummary) {
  return match.homeScore === null || match.awayScore === null
    ? 'VS'
    : `${match.homeScore} – ${match.awayScore}`
}

function openMatch(event: React.MouseEvent<HTMLAnchorElement>) {
  if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return
  event.preventDefault()
  openMatchFromUrl(event.currentTarget.getAttribute('href') ?? '')
}

type Round = { id: string; name: string; matches: Array<MatchSummary | null> }

/**
 * Expanded 8-team bracket laid out left→centre←right so it fits a wide, short panel:
 * QF | SF | 决赛 + 季军赛 | SF | QF. Connector lines are measured from the rendered cards.
 */
function HorizontalBracket({
  rounds,
  thirdPlace,
}: {
  rounds: Round[]
  thirdPlace: MatchSummary | null
}) {
  const hasQuarters = rounds.length === 3
  const quarters = hasQuarters ? (rounds[0]?.matches ?? []) : []
  const semis = rounds[hasQuarters ? 1 : 0]?.matches ?? []
  const final = rounds[hasQuarters ? 2 : 1]?.matches[0] ?? null
  const rootRef = useRef<HTMLDivElement | null>(null)
  const [paths, setPaths] = useState<string[]>([])
  const [box, setBox] = useState({ w: 0, h: 0 })

  useLayoutEffect(() => {
    const root = rootRef.current
    if (!root) return
    const measure = () => {
      const origin = root.getBoundingClientRect()
      const rect = (key: string) => {
        const el = root.querySelector<HTMLElement>(`[data-slot="${key}"]`)
        if (!el) return null
        const r = el.getBoundingClientRect()
        return {
          l: r.left - origin.left,
          r: r.right - origin.left,
          y: r.top - origin.top + r.height / 2,
        }
      }
      const next: string[] = []
      const link = (from: string[], to: string, side: 'L' | 'R') => {
        const target = rect(to)
        if (!target) return
        for (const key of from) {
          const source = rect(key)
          if (!source) continue
          const x1 = side === 'L' ? source.r : source.l
          const x2 = side === 'L' ? target.l : target.r
          const mid = (x1 + x2) / 2
          next.push(`M${x1},${source.y} H${mid} V${target.y} H${x2}`)
        }
      }
      link(['q0', 'q1'], 's0', 'L')
      link(['q2', 'q3'], 's1', 'R')
      link(['s0'], 'f', 'L')
      link(['s1'], 'f', 'R')
      setPaths(next)
      setBox({ w: origin.width, h: origin.height })
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(root)
    return () => observer.disconnect()
  }, [rounds, thirdPlace])

  return (
    <div
      className={'data-bracket' + (hasQuarters ? '' : ' data-bracket--four')}
      ref={rootRef}
      aria-label="八强、半决赛和决赛晋级图"
    >
      <svg className="data-bracket__lines" width={box.w} height={box.h} aria-hidden="true">
        {paths.map((d, index) => (
          <path key={index} d={d} />
        ))}
      </svg>
      {hasQuarters && (
        <div className="data-bracket__col">
          <span className="data-bracket__round">八强</span>
          {quarters.slice(0, 2).map((match, index) => (
            <BracketCard key={match?.id ?? `pending-${index}`} match={match} slot={`q${index}`} />
          ))}
        </div>
      )}
      <div className="data-bracket__col">
        <span className="data-bracket__round">半决赛</span>
        {semis.length > 0 ? <BracketCard match={semis[0] ?? null} slot="s0" /> : null}
      </div>
      <div className="data-bracket__col data-bracket__col--center">
        <span className="data-bracket__round">决赛</span>
        <div className="data-bracket__center">
          <BracketCard match={final} slot="f" featured />
          {thirdPlace ? (
            <div className="data-bracket__third">
              <span>季军赛</span>
              <BracketCard match={thirdPlace} slot="t" />
            </div>
          ) : null}
        </div>
      </div>
      <div className="data-bracket__col">
        <span className="data-bracket__round">半决赛</span>
        {semis.length > 1 ? <BracketCard match={semis[1] ?? null} slot="s1" /> : null}
      </div>
      {hasQuarters && (
        <div className="data-bracket__col">
          <span className="data-bracket__round">八强</span>
          {quarters.slice(2, 4).map((match, index) => (
            <BracketCard
              key={match?.id ?? `pending-${index}`}
              match={match}
              slot={`q${index + 2}`}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function BracketCard({
  match,
  slot,
  featured = false,
}: {
  match: MatchSummary | null
  slot: string
  featured?: boolean
}) {
  if (!match) return <PendingCard slot={slot} featured={featured} />
  const winner = matchWinnerId(match)
  const played = match.homeScore !== null && match.awayScore !== null
  const row = (
    team: TeamSummary | null,
    placeholder: string | null | undefined,
    score: number | null,
    penalty: number | null,
  ) => (
    <div
      className={
        'data-bracket__row ' +
        (winner && team?.id === winner ? 'is-winner' : winner ? 'is-loser' : '')
      }
    >
      <span className="data-bracket__crest">
        {team ? (
          <TeamCrest team={team} size="small" interactive={false} />
        ) : (
          <TbdCrest size={22} hint={placeholder} />
        )}
      </span>
      <span className="data-bracket__name" title={team?.name ?? placeholder ?? TBD_LABEL}>
        {team?.name ?? TBD_LABEL}
      </span>
      <span className="data-bracket__score">
        {played ? score : ''}
        {penalty !== null ? <small>({penalty})</small> : null}
      </span>
    </div>
  )
  return (
    <a
      className={'data-bracket__card ' + (featured ? 'is-featured' : '')}
      data-slot={slot}
      data-match-id={match.id}
      href={matchDetailUrl(match.id)}
      onClick={openMatch}
      aria-label={`${match.homeTeam?.name ?? TBD_LABEL} 对 ${match.awayTeam?.name ?? TBD_LABEL}，${scoreLabel(match)}，查看比赛`}
    >
      {row(match.homeTeam, match.homePlaceholder, match.homeScore, match.homePenaltyScore)}
      {row(match.awayTeam, match.awayPlaceholder, match.awayScore, match.awayPenaltyScore)}
      <time className="data-bracket__date" dateTime={match.scheduledStartAt ?? undefined}>
        {knockoutMatchTime(match.scheduledStartAt, false)}
        {!['FINISHED', 'CONFIRMED', 'SCHEDULED'].includes(match.status)
          ? ` · ${matchStatusLabel(match.status)}`
          : ''}
      </time>
    </a>
  )
}

/**
 * Expanded 8-team bracket read top → bottom: 八强 (8 teams) / 半决赛 / 决赛 / 季军赛.
 * Each card shows home · score · away side by side; connectors are measured from the cards.
 */
function VerticalBracket({
  rounds,
  thirdPlace,
}: {
  rounds: Round[]
  thirdPlace: MatchSummary | null
}) {
  const hasQuarters = rounds.length === 3
  const quarters = hasQuarters ? (rounds[0]?.matches ?? []) : []
  const semis = rounds[hasQuarters ? 1 : 0]?.matches ?? []
  const final = rounds[hasQuarters ? 2 : 1]?.matches[0] ?? null
  const rootRef = useRef<HTMLDivElement | null>(null)
  const [paths, setPaths] = useState<string[]>([])
  const [box, setBox] = useState({ w: 0, h: 0 })

  useLayoutEffect(() => {
    const root = rootRef.current
    if (!root) return
    const measure = () => {
      const origin = root.getBoundingClientRect()
      const rect = (key: string) => {
        const el = root.querySelector<HTMLElement>(`[data-slot="${key}"]`)
        if (!el) return null
        const r = el.getBoundingClientRect()
        return {
          x: r.left - origin.left + r.width / 2,
          t: r.top - origin.top,
          b: r.bottom - origin.top,
        }
      }
      const next: string[] = []
      const link = (from: string[], to: string) => {
        const target = rect(to)
        if (!target) return
        for (const key of from) {
          const source = rect(key)
          if (!source) continue
          const mid = (source.b + target.t) / 2
          next.push(`M${source.x},${source.b} V${mid} H${target.x} V${target.t}`)
        }
      }
      link(['q0', 'q1'], 's0')
      link(['q2', 'q3'], 's1')
      link(['s0', 's1'], 'f')
      setPaths(next)
      setBox({ w: origin.width, h: origin.height })
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(root)
    return () => observer.disconnect()
  }, [rounds, thirdPlace])

  return (
    <div
      className="data-vbracket"
      ref={rootRef}
      aria-label="八强、半决赛、决赛与季军赛晋级图（竖版）"
    >
      <svg className="data-bracket__lines" width={box.w} height={box.h} aria-hidden="true">
        {paths.map((d, index) => (
          <path key={index} d={d} />
        ))}
      </svg>
      {hasQuarters && (
        <>
          <span className="data-vbracket__round">八强</span>
          <div className="data-vbracket__row data-vbracket__row--4">
            {quarters.map((match, index) => (
              <VCard key={match?.id ?? `pending-${index}`} match={match} slot={`q${index}`} />
            ))}
          </div>
        </>
      )}
      <span className="data-vbracket__round">半决赛</span>
      <div className="data-vbracket__row data-vbracket__row--2">
        {semis.map((match, index) => (
          <VCard key={match?.id ?? `pending-${index}`} match={match} slot={`s${index}`} />
        ))}
      </div>
      <span className="data-vbracket__round">决赛</span>
      <div className="data-vbracket__row data-vbracket__row--1">
        <VCard match={final} slot="f" featured />
      </div>
      {thirdPlace ? (
        <>
          <span className="data-vbracket__round data-vbracket__round--third">季军赛</span>
          <div className="data-vbracket__row data-vbracket__row--1">
            <VCard match={thirdPlace} slot="t" />
          </div>
        </>
      ) : null}
    </div>
  )
}

function VCard({
  match,
  slot,
  featured = false,
}: {
  match: MatchSummary | null
  slot: string
  featured?: boolean
}) {
  if (!match) return <PendingCard slot={slot} featured={featured} vertical />
  const winner = matchWinnerId(match)
  const side = (team: TeamSummary | null, placeholder: string | null | undefined) => (
    <span
      className={
        'data-vbracket__team ' +
        (winner && team?.id === winner ? 'is-winner' : winner ? 'is-loser' : '')
      }
    >
      <span className="data-bracket__crest">
        {team ? (
          <TeamCrest team={team} size="small" interactive={false} />
        ) : (
          <TbdCrest size={22} hint={placeholder} />
        )}
      </span>
      <span
        className={'data-vbracket__name' + (team ? '' : ' is-placeholder')}
        title={team?.name ?? placeholder ?? TBD_LABEL}
      >
        {team?.name ?? (placeholder ?? '席位待定').replace(/\s+/g, '')}
      </span>
    </span>
  )
  const penalties =
    match.homePenaltyScore !== null && match.awayPenaltyScore !== null
      ? `点球 ${match.homePenaltyScore}–${match.awayPenaltyScore}`
      : null
  return (
    <a
      className={'data-vbracket__card ' + (featured ? 'is-featured' : '')}
      data-slot={slot}
      data-match-id={match.id}
      href={matchDetailUrl(match.id)}
      onClick={openMatch}
      aria-label={`${match.homeTeam?.name ?? TBD_LABEL} 对 ${match.awayTeam?.name ?? TBD_LABEL}，${scoreLabel(match)}，查看比赛`}
    >
      {side(match.homeTeam, match.homePlaceholder)}
      <span className="data-vbracket__mid">
        <strong>{scoreLabel(match)}</strong>
      </span>
      {side(match.awayTeam, match.awayPlaceholder)}
      <time className="data-vbracket__time" dateTime={match.scheduledStartAt ?? undefined}>
        {knockoutMatchTime(match.scheduledStartAt, false)}
        {penalties ? ` · ${penalties}` : ''}
      </time>
    </a>
  )
}

function PendingCard({
  slot,
  featured = false,
  vertical = false,
}: {
  slot: string
  featured?: boolean
  vertical?: boolean
}) {
  const team = (
    <>
      <span className="data-bracket__crest">
        <TbdCrest size={22} />
      </span>
      <span className={vertical ? 'data-vbracket__name is-placeholder' : 'data-bracket__name'}>
        待定
      </span>
    </>
  )
  return (
    <div
      className={
        (vertical ? 'data-vbracket__card' : 'data-bracket__card') + (featured ? ' is-featured' : '')
      }
      data-slot={slot}
      aria-label="球队待定的对阵席位"
    >
      {vertical ? (
        <>
          <span className="data-vbracket__team">{team}</span>
          <span className="data-vbracket__mid">
            <strong>VS</strong>
          </span>
          <span className="data-vbracket__team">{team}</span>
        </>
      ) : (
        <>
          <div className="data-bracket__row">
            {team}
            <span />
          </div>
          <div className="data-bracket__row">
            {team}
            <span />
          </div>
        </>
      )}
      <span className={vertical ? 'data-vbracket__time' : 'data-bracket__date'}>时间待定</span>
    </div>
  )
}
