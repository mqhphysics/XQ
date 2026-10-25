import { Button, Text, View } from '@tarojs/components'
import Taro, { getCurrentInstance } from '@tarojs/taro'
import { openTeam } from '../../features/product/team-navigation'
import { useCallback, useEffect, useState } from 'react'

import { PublicShell } from '../../components/public-shell'
import { DataState, SectionHeading, TeamMark } from '../../components/public-ui'
import {
  formatCompactDate,
  formatMatchTime,
  getMatchStatusText,
  getRosterStatusText,
  sortMatchesByStartAt,
} from '../../features/readonly-schedule/readonly-schedule.logic'
import { readonlyScheduleRepository } from '../../features/readonly-schedule/readonly-schedule.repository'
import type {
  PublicDataSource,
  ReadonlyTournamentDetail,
} from '../../features/readonly-schedule/readonly-schedule.types'

import './index.scss'

type PageState =
  | { phase: 'loading' }
  | { phase: 'failed'; message: string }
  | { phase: 'ready'; tournament: ReadonlyTournamentDetail; source: PublicDataSource }

export default function ReadonlyTournamentDetailPage() {
  const [state, setState] = useState<PageState>({ phase: 'loading' })
  const tournamentId = getCurrentInstance().router?.params.tournamentId ?? ''

  const load = useCallback(async () => {
    if (!tournamentId) {
      setState({ phase: 'failed', message: '缺少赛事参数，请从赛事列表进入。' })
      return
    }

    setState({ phase: 'loading' })
    try {
      const result = await readonlyScheduleRepository.getTournament(tournamentId)
      if (!result.data) {
        setState({ phase: 'failed', message: '没有找到该赛事，或赛事尚未公开。' })
        return
      }
      setState({ phase: 'ready', tournament: result.data, source: result.source })
    } catch (error) {
      setState({
        phase: 'failed',
        message: error instanceof Error ? error.message : '赛事详情加载失败，请稍后重试。',
      })
    }
  }, [tournamentId])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <PublicShell
      active="tournaments"
      showBack
      tournamentId={tournamentId}
      source={state.phase === 'ready' ? state.source : undefined}
    >
      {state.phase === 'loading' && <DataState kind="loading" title="正在加载赛事详情" />}

      {state.phase === 'failed' && (
        <DataState
          kind="error"
          title="赛事详情不可用"
          description={state.message}
          onRetry={() => void load()}
        />
      )}

      {state.phase === 'ready' && <TournamentContent tournament={state.tournament} />}
    </PublicShell>
  )
}

function TournamentContent({ tournament }: { tournament: ReadonlyTournamentDetail }) {
  const previewMatches = sortMatchesByStartAt(tournament.recentMatches).slice(0, 4)

  return (
    <View>
      <View className="tournament-hero">
        <View className="tournament-hero__main">
          <Text className="tournament-hero__eyebrow">{tournament.code}</Text>
          <Text className="tournament-hero__title">{tournament.name}</Text>
          <Text className="tournament-hero__meta">
            {tournament.organizationName} · {tournament.seasonName}
          </Text>
          <Text className="tournament-hero__copy">{tournament.description}</Text>
        </View>
        <View className="tournament-hero__aside">
          <Text className="status-tag status-tag--approved">{tournament.statusText}</Text>
          <Text className="tournament-hero__date">
            {tournament.startDate} 至 {tournament.endDate}
          </Text>
          <Text className="tournament-hero__count">
            {tournament.teamCount} 支球队 · {tournament.matchCount} 场比赛
          </Text>
        </View>
      </View>

      <View className="tournament-actions">
        <Button
          className="button button--primary"
          onClick={() =>
            void Taro.navigateTo({
              url: `/pages/readonly-schedule/index?tournamentId=${encodeURIComponent(tournament.id)}`,
            })
          }
        >
          查看赛程
        </Button>
        <Button
          className="button button--secondary"
          onClick={() =>
            void Taro.navigateTo({
              url: `/pages/readonly-teams/index?tournamentId=${encodeURIComponent(tournament.id)}`,
            })
          }
        >
          查看球队与名单
        </Button>
      </View>

      <View className="content-section tournament-columns">
        <View className="tournament-columns__main">
          <SectionHeading
            eyebrow="SCHEDULE"
            title="已发布赛程"
            action={`${tournament.matchCount} 场`}
          />
          {previewMatches.length === 0 ? (
            <DataState kind="empty" title="暂无已发布比赛" />
          ) : (
            <View className="tournament-match-list surface">
              {previewMatches.map((match) => (
                <View
                  className="tournament-match link-row"
                  key={match.id}
                  onClick={() =>
                    void Taro.navigateTo({
                      url: `/pages/readonly-match-detail/index?matchId=${encodeURIComponent(match.id)}`,
                    })
                  }
                >
                  <View className="tournament-match__time">
                    <Text>{formatCompactDate(match.scheduledStartAt)}</Text>
                    <Text>{formatMatchTime(match.scheduledStartAt)}</Text>
                  </View>
                  <View className="tournament-match__body">
                    <Text className="tournament-match__teams">
                      {match.homeTeamName} vs {match.awayTeamName}
                    </Text>
                    <Text className="tournament-match__meta">
                      {match.stageName} · {match.roundName} · {match.venueName}
                    </Text>
                  </View>
                  <Text
                    className={`status-tag ${match.status === 'LIVE' ? 'status-tag--live' : ''}`}
                  >
                    {getMatchStatusText(match.status)}
                  </Text>
                </View>
              ))}
            </View>
          )}
        </View>

        <View className="tournament-columns__aside">
          <SectionHeading eyebrow="RULES" title="赛事规则" />
          <View className="rule-list surface">
            {tournament.rules.length === 0 ? (
              <Text className="rule-list__empty">规则说明待赛事方补充。</Text>
            ) : (
              tournament.rules.map((rule, index) => (
                <View className="rule-row" key={`${index}-${rule}`}>
                  <Text className="rule-row__index">{String(index + 1).padStart(2, '0')}</Text>
                  <Text className="rule-row__copy">{rule}</Text>
                </View>
              ))
            )}
          </View>
        </View>
      </View>

      <View className="content-section">
        <SectionHeading eyebrow="TEAMS" title="参赛球队" action="仅展示已公开报名与名单" />
        {tournament.teams.length === 0 ? (
          <DataState kind="empty" title="暂无公开球队" />
        ) : (
          <View className="tournament-team-grid">
            {tournament.teams.slice(0, 6).map((team) => (
              <View
                className="tournament-team surface link-row"
                key={team.id}
                onClick={() =>
                  void openTeam(team.id, tournament.id)
                }
              >
                <TeamMark teamCode={team.teamCode} name={team.name} />
                <View className="tournament-team__body">
                  <Text className="tournament-team__name">{team.name}</Text>
                  <Text className="tournament-team__meta">
                    {getRosterStatusText(team.rosterStatus)} · {team.rosterPlayerCount} 人
                  </Text>
                </View>
              </View>
            ))}
          </View>
        )}
      </View>
    </View>
  )
}
