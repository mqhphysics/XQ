import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'

import {
  publishPick,
  useCompetitionCatalog,
  useCompetitionSelection,
} from '../../features/campus/competition-catalog.h5'
import {
  GENDERS,
  STATUS_LABEL,
  cupNameOf,
  cupRows,
  orderedSeasons,
  pickForIds,
  pickForTournament,
  pickLabel,
  resolvePick,
  seasonLabel,
  type CompetitionPick,
} from '../../features/campus/competition-switcher.logic.h5'

import './index.h5.scss'

/**
 * Gender / season changes apply immediately and usually swap the page body (new tournament
 * or the empty state), which remounts the switcher. Reopen the panel on that remount so the
 * user keeps their place instead of seeing it snap shut.
 */
let reopenUntil = 0

function Chevron({ className }: { className: string }) {
  return (
    <svg className={className} viewBox="0 0 12 12" aria-hidden="true">
      <path
        d="M3 4.5 6 7.5 9 4.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export interface CompetitionSwitcherProps {
  /** Tournament the page currently shows; falls back to the shared selection. */
  tournamentId?: string | undefined
  variant?: 'default' | 'compact'
  disabled?: boolean
  className?: string
  /** Called after the shared selection changed, with the new tournament when one exists. */
  onChange?: (tournamentId: string | undefined) => void
}

export function CompetitionSwitcher({
  tournamentId,
  variant = 'default',
  disabled = false,
  className = '',
  onChange,
}: CompetitionSwitcherProps) {
  const catalog = useCompetitionCatalog()
  const selection = useCompetitionSelection()
  const [open, setOpen] = useState(() => Date.now() < reopenUntil)
  const [seasonsOpen, setSeasonsOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const panel = useRef<HTMLDivElement>(null)
  const panelId = useId()
  // The compact chip lives inside scrolling cards (team page), so its panel is portalled
  // and pinned to the trigger instead of being clipped by the card.
  const floating = variant === 'compact'
  const [anchor, setAnchor] = useState<CSSProperties | null>(null)
  useLayoutEffect(() => {
    if (!open || !floating) return
    const place = () => {
      const rect = trigger.current?.getBoundingClientRect()
      if (rect)
        setAnchor({
          position: 'fixed',
          top: rect.bottom + 6,
          right: Math.max(8, document.documentElement.clientWidth - rect.right),
        })
    }
    place()
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => {
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [open, floating])

  useEffect(() => {
    reopenUntil = 0
  }, [])
  useEffect(() => {
    if (!open) {
      setSeasonsOpen(false)
      return
    }
    const close = (event: MouseEvent) => {
      const target = event.target as Node
      if (!root.current?.contains(target) && !panel.current?.contains(target)) setOpen(false)
    }
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setOpen(false)
      trigger.current?.focus()
    }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', escape)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', escape)
    }
  }, [open])

  const current: CompetitionPick | undefined = catalog
    ? (pickForIds(catalog, selection?.competitionId, selection?.seasonId) ??
      pickForTournament(catalog, tournamentId))
    : undefined
  const label = current
    ? pickLabel(current)
    : { title: selection?.competitionName ?? '校园赛事', group: '' }

  const apply = (pick: CompetitionPick | undefined, keepOpen: boolean) => {
    if (!pick) return
    if (keepOpen) reopenUntil = Date.now() + 1500
    else setOpen(false)
    publishPick(pick)
    onChange?.(pick.tournament?.id)
  }

  const gender = current?.competition.gender ?? 'MALE'
  const seasonId = current?.season.id ?? ''
  const rows = catalog && current ? cupRows(catalog, gender, seasonId) : []
  const seasons = catalog ? orderedSeasons(catalog) : []

  const panelNode =
    open && current && catalog ? (
      <div
        ref={panel}
        id={panelId}
        className={`competition-switcher__panel ${floating ? 'competition-switcher__panel--floating' : ''}`}
        style={floating ? (anchor ?? { visibility: 'hidden' }) : undefined}
        role="dialog"
        aria-label="切换赛事"
      >
        <div className="competition-switcher__genders" role="radiogroup" aria-label="组别">
          {GENDERS.map((item) => {
            const active = item.id === gender
            return (
              <button
                key={item.id}
                type="button"
                role="radio"
                aria-checked={active}
                className={`competition-switcher__gender ${active ? 'is-active' : ''}`}
                onClick={() => {
                  if (!active)
                    apply(
                      resolvePick(catalog, cupNameOf(current.competition), item.id, seasonId),
                      true,
                    )
                }}
              >
                {item.label}
              </button>
            )
          })}
        </div>
        <ul className="competition-switcher__cups" role="listbox" aria-label="杯赛">
          {rows.map((row) => {
            const selected = row.competition.id === current.competition.id
            return (
              <li key={row.competition.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={selected}
                  className={`competition-switcher__cup ${selected ? 'is-selected' : ''}`}
                  onClick={() => {
                    if (selected) setOpen(false)
                    else
                      apply(
                        {
                          competition: row.competition,
                          season: current.season,
                          tournament: row.tournament,
                        },
                        false,
                      )
                  }}
                >
                  <span>{row.cupName}</span>
                  <em className={`is-${row.status}`}>{STATUS_LABEL[row.status]}</em>
                </button>
              </li>
            )
          })}
        </ul>
        <div className="competition-switcher__season">
          <span>赛季</span>
          <button
            type="button"
            className="competition-switcher__season-trigger"
            aria-haspopup="listbox"
            aria-expanded={seasonsOpen}
            onClick={() => setSeasonsOpen((next) => !next)}
          >
            {seasonLabel(current.season)}
            <Chevron className="competition-switcher__season-chevron" />
          </button>
        </div>
        {seasonsOpen && (
          <ul className="competition-switcher__seasons" role="listbox" aria-label="选择赛季">
            {seasons.map((season) => {
              const selected = season.id === current.season.id
              return (
                <li key={season.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={selected}
                    className={`competition-switcher__season-option ${selected ? 'is-selected' : ''}`}
                    onClick={() => {
                      setSeasonsOpen(false)
                      if (!selected)
                        apply(
                          resolvePick(catalog, cupNameOf(current.competition), gender, season.id),
                          true,
                        )
                    }}
                  >
                    {seasonLabel(season)}
                    {selected && (
                      <svg viewBox="0 0 12 12" aria-hidden="true">
                        <path
                          d="m2.5 6.2 2.3 2.3 4.7-5"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.6"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    )}
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    ) : null

  return (
    <div
      ref={root}
      className={`competition-switcher competition-switcher--${variant} ${open ? 'is-open' : ''} ${className}`.trim()}
    >
      <button
        ref={trigger}
        type="button"
        className="competition-switcher__trigger"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        aria-label={`切换赛事，当前 ${label.title}${label.group ? ` ${label.group}` : ''}`}
        disabled={disabled || !current}
        onClick={() => setOpen((next) => !next)}
      >
        <span className="competition-switcher__label">
          <span className="competition-switcher__title">{label.title}</span>
          {label.group && (
            <>
              <span className="competition-switcher__sep" aria-hidden="true">
                ·
              </span>
              <span className="competition-switcher__group">{label.group}</span>
            </>
          )}
        </span>
        <Chevron className="competition-switcher__chevron" />
      </button>
      {floating ? panelNode && createPortal(panelNode, document.body) : panelNode}
    </div>
  )
}
