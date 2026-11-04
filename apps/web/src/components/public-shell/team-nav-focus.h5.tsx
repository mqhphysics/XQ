import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'

import type { TeamSummary } from '../../features/product/product.types'
import {
  consumeTeamGrowth,
  playTeamFocus,
  PRIMARY_TEAM_SET_EVENT,
} from './navigation-transition.h5'
import { goldLeafLines } from './team-nav-leaf-lines.h5'
import { getTeamNavOrnamentColor } from './team-nav-palette.h5'
import {
  readTeamNavPreview,
  teamNavPreviewCrests,
  TeamNavPreviewControls,
} from './team-nav-preview.h5'

import './team-nav-focus.h5.scss'

const idleHintKeys = new Set(['leaf-72', 'leaf-30', 'bud-rim'])

export function TeamNavFocus({ team }: { team?: TeamSummary | null }) {
  const id = useId().replace(/:/g, '')
  const [preview, setPreview] = useState(readTeamNavPreview)
  const lastPreview = useRef(`${preview.design}:${preview.crest}`)
  const color = getTeamNavOrnamentColor(
    preview.enabled ? teamNavPreviewCrests[preview.crest] : team,
  )

  useLayoutEffect(() => {
    const key = `${preview.design}:${preview.crest}`
    if (lastPreview.current === key) return
    lastPreview.current = key
    if (!preview.enabled) return
    const element = document.getElementById(id)
    const shell = element?.closest<HTMLElement>('.public-app')
    if (shell?.querySelector('.public-team-nav--active')) playTeamFocus(shell, {})
  }, [id, preview.enabled, preview.design, preview.crest])

  // Every 设为主队 — a different team or the same one again — grows the lines again. On the 主队
  // tab it plays once the 球队详情 dialog has closed (so it is seen, not finished behind the
  // scrim); elsewhere the next landing on 主队 grows from the seed (navigation-transition).
  const teamId = team?.id ?? null
  const lastTeam = useRef(teamId)
  const growTimer = useRef<number | null>(null)
  const scheduleGrowth = useCallback(() => {
    if (preview.enabled) return
    const shell = document.getElementById(id)?.closest<HTMLElement>('.public-app')
    if (!shell?.querySelector('.public-team-nav--active')) return
    consumeTeamGrowth()
    if (growTimer.current !== null) window.clearInterval(growTimer.current)
    growTimer.current = null
    const covered = () => Boolean(document.querySelector('[aria-modal="true"]'))
    const focus = document.getElementById(id)
    const grow = () => {
      focus?.removeAttribute('data-focus-pending')
      playTeamFocus(shell, {})
    }
    // `{}` = the landing draw (grow out from the seed), same as arriving on 主队.
    if (!covered()) {
      grow()
      return
    }
    // Hide the previous (already drawn) lines while the dialog is open, so closing it never
    // flashes a finished stripe in the new colours before the growth starts.
    focus?.setAttribute('data-focus-pending', '')
    // Poll (cheap) instead of observing body children: dialogs may live in nested portals.
    const started = Date.now()
    growTimer.current = window.setInterval(() => {
      if (covered() && Date.now() - started < 120_000) return
      if (growTimer.current !== null) window.clearInterval(growTimer.current)
      growTimer.current = null
      if (!covered()) {
        consumeTeamGrowth()
        grow()
      } else focus?.removeAttribute('data-focus-pending')
    }, 50)
  }, [id, preview.enabled])
  useEffect(() => {
    window.addEventListener(PRIMARY_TEAM_SET_EVENT, scheduleGrowth)
    return () => {
      window.removeEventListener(PRIMARY_TEAM_SET_EVENT, scheduleGrowth)
      if (growTimer.current !== null) window.clearInterval(growTimer.current)
    }
  }, [scheduleGrowth])
  // A 主队 change from elsewhere (another device/tab sync) also grows the lines.
  useLayoutEffect(() => {
    if (lastTeam.current === teamId) return
    lastTeam.current = teamId
    if (teamId && growTimer.current === null) scheduleGrowth()
  }, [teamId, scheduleGrowth])

  const replay = () => {
    document
      .getElementById(id)
      ?.closest('.public-team-nav')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  }

  return (
    <>
      <span
        aria-hidden="true"
        id={id}
        data-nav-design="15"
        style={{ color }}
        className={`public-team-focus ${preview.enabled ? 'public-team-focus--preview' : ''}`}
      >
        <svg
          className="public-team-focus__drawing"
          viewBox="0 0 200 84"
          preserveAspectRatio="none"
          fill="none"
          focusable="false"
        >
          {[-1, 1].map((side) => (
            <g key={side} transform={side === 1 ? 'translate(200 0) scale(-1 1)' : undefined}>
              {goldLeafLines.map((line) => (
                <g
                  key={line.key}
                  className="public-team-focus__line"
                  data-focus-delay={line.delay}
                  data-focus-duration={line.duration}
                  data-focus-region={line.region}
                >
                  {line.seedPath ? (
                    <path
                      className="public-team-focus__trace"
                      d={line.seedPath}
                      strokeWidth={line.width}
                    />
                  ) : null}
                  {idleHintKeys.has(line.key) ? (
                    <path
                      className="public-team-focus__hint"
                      d={line.path}
                      strokeWidth={Math.max(line.width, 0.75)}
                      strokeLinecap="round"
                    />
                  ) : null}
                  <path
                    className="public-team-focus__stroke"
                    data-focus-key={`${line.key}-${side}`}
                    d={line.path}
                    strokeWidth={line.width}
                    strokeLinecap={
                      line.region === 'stem' || line.key.startsWith('bud-') ? 'round' : 'butt'
                    }
                    pathLength="1"
                  />
                </g>
              ))}
            </g>
          ))}
        </svg>
        {preview.enabled ? (
          <img
            className="public-team-focus__sample-crest"
            src={teamNavPreviewCrests[preview.crest].crestUrl}
            alt=""
          />
        ) : null}
      </span>
      <TeamNavPreviewControls value={preview} onChange={setPreview} onReplay={replay} />
    </>
  )
}
