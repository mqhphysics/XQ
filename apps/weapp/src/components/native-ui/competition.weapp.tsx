import { Button, Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useNativeRefreshTask } from '../../features/product/native-refresh.weapp'
import { loadCompetition, peekCompetition } from '../../features/product/product.repository'
import type { CompetitionDataResponse } from '../../features/product/product.types'
import { NativeDialog } from './index.weapp'
import { campusRepository } from '../../features/campus/campus.repository.h5'
import {
  realTournaments,
  viewerDataTournament,
} from '../../features/product/competition-scope.weapp'
import { useNativeCurrentUser } from '../../features/product/current-user.weapp'
import { useNativePanelVisible } from '../native-navigation/panel-context.weapp'
import {
  setNativeTournamentId,
  useNativeTournamentId,
  getNativeTournamentId,
} from '../../features/native-navigation/index.weapp'

type CompetitionState =
  | { phase: 'loading' }
  | { phase: 'failed'; message: string }
  | { phase: 'ready'; data: CompetitionDataResponse }
export function useNativeCompetition({ viewerDefault = false }: { viewerDefault?: boolean } = {}) {
  const routeId = useNativeTournamentId()
  const user = useNativeCurrentUser(),
    initialized = useRef(''),
    owner = `${user?.organizationId || 'public'}:${user?.id || 'visitor'}:${user?.linkedPlayer?.id || ''}`
  const requested = useRef(routeId)
  const sequence = useRef(0)
  const [state, setState] = useState<CompetitionState>(() => {
    if (viewerDefault) return { phase: 'loading' }
    const cached = peekCompetition(routeId)
    return cached ? { phase: 'ready', data: cached } : { phase: 'loading' }
  })
  const load = useCallback(async (id?: string) => {
    const ticket = ++sequence.current
    const target = id ?? requested.current
    requested.current = target
    if (target) setNativeTournamentId(target)
    if (!peekCompetition(target)) setState({ phase: 'loading' })
    try {
      const data = await loadCompetition(target)
      if (ticket === sequence.current) {
        requested.current = data.tournament.id
        if (!getNativeTournamentId()) setNativeTournamentId(data.tournament.id)
        setState({ phase: 'ready', data })
      }
    } catch (error) {
      if (ticket === sequence.current)
        setState({
          phase: 'failed',
          message: error instanceof Error ? error.message : '赛事读取失败',
        })
    }
  }, [])
  useNativeRefreshTask(() => load())
  useEffect(() => {
    if (viewerDefault && initialized.current !== owner) {
      setState({ phase: 'loading' })
      let active = true
      initialized.current = owner
      void viewerDataTournament()
        .then((id) => {
          if (active) void load(id || routeId)
        })
        .catch(() => {
          if (active) void load(routeId)
        })
      return () => {
        active = false
        sequence.current++
      }
    }
    void load(routeId)
    return () => {
      sequence.current++
    }
  }, [routeId, load, viewerDefault, owner])
  return { state, load, tournamentId: state.phase === 'ready' ? state.data.tournament.id : routeId }
}

export function NativeTournamentSelect({
  data,
  onSelect,
  season = false,
}: {
  data: CompetitionDataResponse
  onSelect: (id: string) => void
  season?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [realIds, setRealIds] = useState<Set<string> | null>(null)
  useEffect(() => {
    let active = true
    void campusRepository
      .catalog()
      .then((catalog) => {
        if (active) setRealIds(new Set(realTournaments(catalog).map((t) => t.id)))
      })
      .catch(() => {})
    return () => {
      active = false
    }
  }, [])
  const seasons = data.seasons.filter((season) =>
    realIds
      ? realIds.has(season.tournamentId)
      : !/演示|DEMO/i.test(season.seasonName + ' ' + season.tournamentName),
  )
  return (
    <>
      <Button className="native-select" onClick={() => setOpen(true)} aria-label="切换赛事">
        {season ? (
          <View className="native-season-copy">
            <Text>{data.tournament.seasonName}</Text>
            <Text>{data.tournament.name}</Text>
          </View>
        ) : (
          <Text>{data.tournament.name}</Text>
        )}
        <View className="native-select__chevron" />
      </Button>
      {open && (
        <NativeDialog title="选择赛事" compact={seasons.length <= 4} onClose={() => setOpen(false)}>
          {seasons.map((season) => (
            <Button
              key={season.tournamentId}
              className={`native-tournament-option${season.tournamentId === data.tournament.id ? ' is-selected' : ''}`}
              disabled={season.status === 'DRAFT'}
              onClick={() => {
                setOpen(false)
                onSelect(season.tournamentId)
              }}
            >
              <View>
                <Text>
                  {season.year} · {season.tournamentName}
                </Text>
                <Text className="native-note">
                  {season.status === 'DRAFT' ? '尚未发布' : season.seasonName}
                </Text>
              </View>
              <Text>{season.tournamentId === data.tournament.id ? '✓' : '›'}</Text>
            </Button>
          ))}
        </NativeDialog>
      )}
    </>
  )
}

export function useNativePanelHeight(selector: string) {
  const [height, setHeight] = useState(360)
  const visible = useNativePanelVisible()
  useEffect(() => {
    if (!visible) return
    let alive = true
    const measure = () =>
      Taro.nextTick(() => {
        const query = Taro.createSelectorQuery()
        let top = 0,
          bottom = 0
        query.select(selector).boundingClientRect((rect) => {
          top = (rect as { top?: number })?.top ?? 0
        })
        query.select('.mobile-tabbar').boundingClientRect((rect) => {
          bottom = (rect as { top?: number })?.top ?? 0
        })
        query.exec(() => {
          if (alive && top && bottom) setHeight(Math.max(120, bottom - top - 8))
        })
      })
    const timer = setTimeout(measure, 80)
    Taro.onWindowResize(measure)
    return () => {
      alive = false
      clearTimeout(timer)
      Taro.offWindowResize(measure)
    }
  }, [selector, visible])
  return height
}
