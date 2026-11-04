import Taro from '@tarojs/taro'
import { announcePrimaryTeamSet } from '../public-shell/navigation-transition.h5'
import { useCallback, useEffect, useRef, useState } from 'react'
import { productRepository } from '../../features/product/product.repository'
import { readSession } from '../../features/product/session'
import { TEAM_PREFERENCES_EVENT } from '../../features/product/team-navigation.h5'
import type { TeamPreferencesResponse, TeamSummary } from '../../features/product/product.types'
import { publishPreferences, withPrimary } from './picker.h5'

export async function saveTeamPreference(
  teamId: string,
  mode: 'primary' | 'follow',
  optimistic?: { team: TeamSummary; preferences: TeamPreferencesResponse | null },
) {
  // 设为主队 updates the UI (button, nav crest, 主队 stroke growth) at once; the server write
  // follows and is rolled back on failure.
  const before = optimistic?.preferences ?? null
  if (mode === 'primary') announcePrimaryTeamSet()
  if (mode === 'primary' && optimistic && before)
    publishPreferences(withPrimary(before, optimistic.team))
  try {
    return await writeTeamPreference(teamId, mode)
  } catch (error) {
    if (mode === 'primary' && before) publishPreferences(before)
    throw error
  }
}

async function writeTeamPreference(teamId: string, mode: 'primary' | 'follow') {
  const current = await productRepository.getTeamPreferences()
  const primaryId = mode === 'primary' ? teamId : current.primaryTeam?.id
  if (!primaryId) throw new Error('请先设置一支主队，再关注其他球队。')
  if (mode === 'follow' && primaryId === teamId) return current
  const ids = current.followedTeams.map((team) => team.id)
  const nextFollowed =
    mode === 'follow'
      ? ids.includes(teamId)
        ? ids.filter((id) => id !== teamId)
        : [...ids, teamId]
      : ids
  const next = await productRepository.updateTeamPreferences(
    primaryId,
    nextFollowed.filter((id) => id !== primaryId),
  )
  publishPreferences(next)
  return next
}

export function useTeamFollow(teamId: string) {
  const [preferences, setPreferences] = useState<TeamPreferencesResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  const locked = useRef(false)
  useEffect(() => {
    let active = true
    let changedDuringRead = false
    setPreferences(null)
    setError('')
    setLoading(Boolean(readSession()))
    const changed = (event: Event) => {
      changedDuringRead = true
      setPreferences((event as CustomEvent<TeamPreferencesResponse>).detail)
    }
    window.addEventListener(TEAM_PREFERENCES_EVENT, changed)
    if (readSession()) {
      void productRepository
        .getTeamPreferences()
        .then((result) => {
          if (active && !changedDuringRead) setPreferences(result)
        })
        .catch((issue) => {
          if (active) setError(issue instanceof Error ? issue.message : '关注状态读取失败')
        })
        .finally(() => {
          if (active) setLoading(false)
        })
    }
    return () => {
      active = false
      window.removeEventListener(TEAM_PREFERENCES_EVENT, changed)
    }
  }, [teamId, attempt])
  const primary = preferences?.primaryTeam?.id === teamId
  const followed = primary || Boolean(preferences?.followedTeams.some((team) => team.id === teamId))
  const toggle = useCallback(async () => {
    if (!readSession()) {
      await Taro.reLaunch({ url: '/pages/login/index' })
      return
    }
    if (locked.current || loading || primary) return
    locked.current = true
    setBusy(true)
    setError('')
    try {
      setPreferences(await saveTeamPreference(teamId, 'follow'))
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : '关注保存失败，请重试')
    } finally {
      locked.current = false
      setBusy(false)
    }
  }, [teamId, loading, primary])
  return {
    followed,
    primary,
    loading,
    busy,
    error,
    toggle,
    retry: () => setAttempt((value) => value + 1),
  }
}
