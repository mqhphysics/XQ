import {
  publishPick,
  useCompetitionCatalog,
  useCompetitionSelection,
} from '../../features/campus/competition-catalog.h5'
import {
  activePick,
  pickForIds,
  upcomingTitle,
} from '../../features/campus/competition-switcher.logic.h5'

/** Soft line art: pitch markings behind a trophy, in the site's muted greens. */
function PitchTrophyArt() {
  return (
    <svg className="competition-empty__art" viewBox="0 0 160 112" fill="none" aria-hidden="true">
      <g stroke="#d5e2d7" strokeWidth="1.4">
        <rect x="6" y="14" width="148" height="84" rx="6" />
        <path d="M80 14v84" />
        <circle cx="80" cy="56" r="17" />
        <path d="M6 36h20v40H6M154 36h-20v40h20" />
      </g>
      <circle cx="80" cy="56" r="27" fill="#f3f7f2" stroke="#e1ebe2" />
      <g
        stroke="#7fa68a"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        transform="translate(66 42)"
      >
        <path d="M8.2 3.5h11.6v7a5.8 5.8 0 0 1-11.6 0Z" />
        <path d="M8.2 5.8H3.5v2.3a5.8 5.8 0 0 0 5.8 5.8M19.8 5.8h4.7v2.3a5.8 5.8 0 0 1-5.8 5.8M14 16.3v7M9.3 24.5h9.4" />
      </g>
    </svg>
  )
}

/**
 * Shown when the shared selection (cup · gender · season) has no published tournament yet.
 * Fills the remaining height of one-screen pages; the page keeps its own header.
 */
export function CompetitionEmptyState({ className = '' }: { className?: string }) {
  const catalog = useCompetitionCatalog()
  const selection = useCompetitionSelection()
  const pick =
    catalog && selection
      ? pickForIds(catalog, selection.competitionId, selection.seasonId)
      : undefined
  const active = catalog ? activePick(catalog) : undefined
  return (
    <section className={`competition-empty ${className}`.trim()} role="status">
      <div className="competition-empty__inner">
        <PitchTrophyArt />
        <h2 className="competition-empty__title">{pick ? upcomingTitle(pick) : '赛事即将开赛'}</h2>
        <p className="competition-empty__copy">参赛名单和赛程公布后会出现在这里</p>
        {active && (
          <button
            type="button"
            className="competition-empty__action"
            onClick={() => publishPick(active)}
          >
            回到正在进行的赛事
            <svg viewBox="0 0 16 16" aria-hidden="true">
              <path
                d="M3 8h10m-4-4 4 4-4 4"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        )}
      </div>
    </section>
  )
}

/** True when a shared selection exists but has no tournament (empty cup / gender / season). */
export function useEmptyCompetitionSelection(): boolean {
  const selection = useCompetitionSelection()
  return Boolean(selection && !selection.tournamentId)
}
