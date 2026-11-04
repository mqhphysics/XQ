import { getCurrentInstance } from '@tarojs/taro'
import { useEffect, useState, type PropsWithChildren } from 'react'
import type { Catalog } from '../../features/campus/campus.repository.h5'
import {
  loadCompetitionCatalog,
  peekCompetitionCatalog,
  selectionFromPick,
} from '../../features/campus/competition-catalog.h5'
import {
  publishCompetitionSelection,
  competitionOrganizationKey,
  readCompetitionSelection,
  storedCompetitionSelection,
  subscribeCompetitionSelection,
  type CompetitionSelection,
} from '../../features/campus/competition-selection.h5'
import { defaultPick } from '../../features/campus/competition-switcher.logic.h5'
import { CompetitionEmptyState } from '../competition-switcher/empty-state.h5'
export { CampusWelcome } from './welcome.h5'
import './index.h5.scss'

/**
 * The page's route tournament (a deep link) wins, then the current/stored selection, then
 * 绿茵杯男子组 (code GREEN_MEN) in a formal season. A deliberately chosen empty pick (e.g.
 * 女子组 before it has a tournament) is kept, so section links carrying the previous
 * tournament do not silently undo it.
 */
function initialSelection(data: Catalog): CompetitionSelection | null {
  const route = getCurrentInstance().router?.params?.tournamentId
  const known = readCompetitionSelection()
  const adoptRoute = typeof route === 'string' && route && (!known || known.tournamentId)
  const pick = defaultPick(
    data,
    known ?? storedCompetitionSelection(),
    adoptRoute ? route : undefined,
  )
  return pick ? selectionFromPick(pick) : null
}

export function CampusContext({ active, children }: PropsWithChildren<{ active: string }>) {
  const organization = competitionOrganizationKey()
  const [catalog, setCatalog] = useState<Catalog | null>(peekCompetitionCatalog)
  const [selection, setSelection] = useState<CompetitionSelection | null>(() => {
    const cached = peekCompetitionCatalog()
    return cached ? initialSelection(cached) : null
  })
  const [error, setError] = useState('')
  const [revision, setRevision] = useState(0)

  useEffect(() => subscribeCompetitionSelection(setSelection), [])

  useEffect(() => {
    let current = true
    setError('')
    loadCompetitionCatalog(revision > 0)
      .then((data) => {
        if (!current) return
        setCatalog(data)
        const value = initialSelection(data)
        if (value) {
          publishCompetitionSelection(value)
          setSelection(value)
        }
      })
      .catch((issue) => {
        if (current) setError(issue instanceof Error ? issue.message : '赛事目录读取失败')
      })
    return () => {
      current = false
    }
    // Recompute only when the organisation changes or the user retries.
  }, [revision, organization])

  const scoped = ['home', 'schedule', 'data', 'team', 'tournaments', 'teams'].includes(active)
  const empty = Boolean(selection && !selection.tournamentId)
  // 数据 / 赛程 keep their own header and render the empty card below it; 首页 silently
  // falls back to the active tournament (see tournament-scope.h5).
  const pageHandlesEmpty = ['home', 'schedule', 'data'].includes(active)

  return (
    <>
      {scoped && (error || !catalog || !selection) ? (
        <section className="campus-context-empty" role="status">
          <span className="campus-context-empty__eyebrow">校园赛事</span>
          <h2>{error ? '暂时无法读取赛事目录' : '正在准备赛事…'}</h2>
          <p>{error || '正在连接赛事目录。'}</p>
          {error && (
            <button
              data-campus-button
              type="button"
              onClick={() => {
                setError('')
                setRevision((n) => n + 1)
              }}
            >
              重新读取
            </button>
          )}
        </section>
      ) : scoped && empty && !pageHandlesEmpty ? (
        <CompetitionEmptyState className="competition-empty--standalone" />
      ) : (
        children
      )}
    </>
  )
}
