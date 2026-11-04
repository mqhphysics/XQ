import {
  knownTournamentId,
  productRepository,
  productRequest,
} from '../../features/product/product.repository'
import { readSession } from '../../features/product/session.h5'
import { warmEntryAnswers } from '../../features/product-config/instant-entry'

const loaders: Record<string, () => Promise<unknown>> = {
  home: () => import('../../pages/index/index'),
  schedule: () => import('../../pages/readonly-schedule/index'),
  data: () => import('../../pages/data-center/index'),
  team: () => import('../../pages/my-team/index'),
  teams: () => import('../../pages/readonly-teams/index'),
  me: () => import('../../pages/me/index'),
  match: () => import('../../pages/readonly-match-detail/index'),
}

const started = new Set<string>()

export function prefetchSection(section: string): void {
  if (started.has(section)) return
  const load = loaders[section]
  if (!load) return
  started.add(section)
  void load().catch(() => {
    started.delete(section)
  })
}

function whenIdle(run: () => void, timeout = 1500) {
  const idle = (
    globalThis as { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => void }
  ).requestIdleCallback
  if (typeof idle === 'function') idle(run, { timeout })
  else setTimeout(run, 400)
}

export function prefetchTabsWhenIdle(): void {
  whenIdle(() => {
    for (const key of Object.keys(loaders)) prefetchSection(key)
  })
}

const quiet = (task: Promise<unknown>) => void task.catch(() => undefined)
let publicStarted = ''
let privateStarted = ''

/**
 * Shared public data (catalog, home, schedule/standings, teams) starts loading the moment the
 * app opens — on the login page too — straight into the persistent GET cache. Every tab then
 * renders synchronously from cache and refreshes silently.
 */
export function prefetchAppData(): void {
  const token = readSession()?.accessToken ?? ''
  if (publicStarted !== token) {
    publicStarted = token
    quiet(productRequest('/public/competition-catalog', { prefetch: true }))
    const tournamentData = (id: string) => {
      const encoded = encodeURIComponent(id)
      quiet(productRequest(`/public/tournaments/${encoded}/competition-data`, { prefetch: true }))
      quiet(productRequest(`/public/tournaments/${encoded}/teams`, { prefetch: true }))
    }
    const known = knownTournamentId()
    if (known) tournamentData(known)
    quiet(
      productRequest<{ tournament: { id: string } }>('/public/home', { prefetch: true }).then(
        (home) => {
          if (home.tournament.id !== known) tournamentData(home.tournament.id)
          return home
        },
      ),
    )
  }
  // After login: 我的 / 主队 data, entry answers and every tab's route chunk during idle.
  if (token && privateStarted !== token) {
    privateStarted = token
    warmEntryAnswers()
    whenIdle(() => {
      quiet(productRepository.getTeamPreferences())
      quiet(productRepository.getMe())
      quiet(
        productRepository
          .getHome()
          .then((home) =>
            productRequest(`/public/posts?tournamentId=${encodeURIComponent(home.tournament.id)}`),
          ),
      )
    }, 800)
    prefetchTabsWhenIdle()
  }
}
