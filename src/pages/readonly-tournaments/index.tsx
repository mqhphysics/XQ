import { Button, Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useCallback, useEffect, useState } from 'react'

import { PublicShell } from '../../components/public-shell'
import { DataState } from '../../components/public-ui'
import { readonlyScheduleRepository } from '../../features/readonly-schedule/readonly-schedule.repository'
import type {
  PublicDataSource,
  ReadonlyTournamentSummary,
} from '../../features/readonly-schedule/readonly-schedule.types'

import './index.scss'

type PageState =
  | { phase: 'loading' }
  | { phase: 'failed'; message: string }
  | { phase: 'ready'; tournaments: ReadonlyTournamentSummary[]; source: PublicDataSource }

export default function ReadonlyTournamentsPage() {
  const [state, setState] = useState<PageState>({ phase: 'loading' })

  const load = useCallback(async () => {
    setState({ phase: 'loading' })
    try {
      const result = await readonlyScheduleRepository.listTournaments()
      setState({ phase: 'ready', tournaments: result.data, source: result.source })
    } catch (error) {
      setState({
        phase: 'failed',
        message: error instanceof Error ? error.message : '赛事列表加载失败，请稍后重试。',
      })
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <PublicShell
      active="tournaments"
      showBack
      source={state.phase === 'ready' ? state.source : undefined}
    >
      <View className="page-intro">
        <View>
          <Text className="page-intro__eyebrow">TOURNAMENTS</Text>
          <Text className="page-intro__title">校园赛事</Text>
        </View>
        <Text className="page-intro__copy">浏览已经正式发布的赛事、赛程和参赛球队。</Text>
      </View>

      {state.phase === 'loading' && <DataState kind="loading" title="正在加载赛事" />}

      {state.phase === 'failed' && (
        <DataState
          kind="error"
          title="赛事列表加载失败"
          description={state.message}
          onRetry={() => void load()}
        />
      )}

      {state.phase === 'ready' && state.tournaments.length === 0 && (
        <DataState
          kind="empty"
          title="暂无已发布赛事"
          description="赛事管理员发布后，公开赛事会出现在这里。"
        />
      )}

      {state.phase === 'ready' && state.tournaments.length > 0 && (
        <View className="tournament-grid">
          {state.tournaments.map((tournament) => (
            <View className="tournament-card surface" key={tournament.id}>
              <View className="tournament-card__topline">
                <Text className="status-tag status-tag--approved">{tournament.statusText}</Text>
                <Text className="tournament-card__code">{tournament.code}</Text>
              </View>
              <Text className="tournament-card__title">{tournament.name}</Text>
              <Text className="tournament-card__season">{tournament.seasonName}</Text>
              <Text className="tournament-card__copy">{tournament.description}</Text>
              <View className="tournament-card__facts">
                <View>
                  <Text className="tournament-card__fact-value">{tournament.teamCount}</Text>
                  <Text className="tournament-card__fact-label">球队</Text>
                </View>
                <View>
                  <Text className="tournament-card__fact-value">{tournament.matchCount}</Text>
                  <Text className="tournament-card__fact-label">比赛</Text>
                </View>
                <View>
                  <Text className="tournament-card__fact-value tournament-card__fact-value--date">
                    {tournament.startDate}
                  </Text>
                  <Text className="tournament-card__fact-label">开始日期</Text>
                </View>
              </View>
              <Button
                className="button button--primary tournament-card__button"
                onClick={() =>
                  void Taro.navigateTo({
                    url: `/pages/readonly-tournament-detail/index?tournamentId=${encodeURIComponent(tournament.id)}`,
                  })
                }
              >
                进入赛事
              </Button>
            </View>
          ))}
        </View>
      )}
    </PublicShell>
  )
}
