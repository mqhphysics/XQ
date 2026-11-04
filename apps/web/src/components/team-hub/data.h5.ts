import { useCallback, useEffect, useRef, useState } from 'react'
import { productRepository } from '../../features/product/product.repository'
import type {
  CompetitionDataResponse,
  TeamDashboardResponse,
} from '../../features/product/product.types'

export function useTeamData(teamId: string, tournamentId: string) {
  const [data, setData] = useState<TeamDashboardResponse | null>(null)
  const [competition, setCompetition] = useState<CompetitionDataResponse | null>(null)
  const [error, setError] = useState('')
  const [competitionError, setCompetitionError] = useState('')
  const [loading, setLoading] = useState(true)
  const sequence = useRef(0)
  const load = useCallback(async () => {
    const request = ++sequence.current
    setLoading(true)
    setError('')
    setCompetitionError('')
    setCompetition(null)
    const results = await Promise.allSettled([
      productRepository.getTeamDashboard(teamId, tournamentId),
      productRepository.getCompetitionData(tournamentId),
    ])
    if (request !== sequence.current) return
    const [dashboard, season] = results
    if (dashboard.status === 'fulfilled') setData(dashboard.value)
    else {
      setData(null)
      setError(dashboard.reason instanceof Error ? dashboard.reason.message : '球队信息加载失败')
    }
    if (season.status === 'fulfilled') setCompetition(season.value)
    else
      setCompetitionError(
        season.reason instanceof Error ? season.reason.message : '完整赛程加载失败',
      )
    setLoading(false)
  }, [teamId, tournamentId])
  useEffect(() => {
    void load()
    return () => {
      sequence.current += 1
    }
  }, [load])
  // A captain's new crest/background shows here at once.
  useEffect(() => {
    const changed = (event: Event) => {
      if ((event as CustomEvent<string>).detail === teamId) void load()
    }
    window.addEventListener('xiaoqiu:team-profile:changed', changed)
    return () => window.removeEventListener('xiaoqiu:team-profile:changed', changed)
  }, [load, teamId])
  return { data, setData, competition, error, competitionError, loading, reload: load }
}

export function useDesktopTeamView() {
  const [desktop, setDesktop] = useState(() => window.matchMedia('(min-width: 721px)').matches)
  useEffect(() => {
    const query = window.matchMedia('(min-width: 721px)')
    const update = () => setDesktop(query.matches)
    query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [])
  return desktop
}
