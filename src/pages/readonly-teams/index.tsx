import { Button, Input, Text, View } from '@tarojs/components'
import { getCurrentInstance } from '@tarojs/taro'
import { openDesktopTeam, openTeam } from '../../features/product/team-navigation'
import { useCallback, useEffect, useMemo, useState } from 'react'

import { PublicShell } from '../../components/public-shell'
import { DataState, TeamMark } from '../../components/public-ui'
import {
  filterTeams,
  getRegistrationStatusText,
  getRosterStatusText,
} from '../../features/readonly-schedule/readonly-schedule.logic'
import { readonlyScheduleRepository } from '../../features/readonly-schedule/readonly-schedule.repository'
import type {
  PublicDataSource,
  ReadonlyTeamSummary,
} from '../../features/readonly-schedule/readonly-schedule.types'

import './index.scss'

type PageState =
  | { phase: 'loading' }
  | { phase: 'failed'; message: string }
  | {
      phase: 'ready'
      tournamentName: string
      teams: ReadonlyTeamSummary[]
      source: PublicDataSource
    }

export default function ReadonlyTeamsPage() {
  const [state, setState] = useState<PageState>({ phase: 'loading' })
  const [query, setQuery] = useState('')
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
        setState({ phase: 'failed', message: '赛事尚未公开或不存在。' })
        return
      }
      setQuery('')
      setState({
        phase: 'ready',
        tournamentName: result.data.name,
        teams: result.data.teams,
        source: result.source,
      })
    } catch (error) {
      setState({
        phase: 'failed',
        message: error instanceof Error ? error.message : '球队列表加载失败，请稍后重试。',
      })
    }
  }, [tournamentId])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <PublicShell
      active="teams"
      showBack
      tournamentId={tournamentId}
      source={state.phase === 'ready' ? state.source : undefined}
    >
      {state.phase === 'loading' && <DataState kind="loading" title="正在读取参赛球队" />}

      {state.phase === 'failed' && (
        <DataState
          kind="error"
          title="球队列表加载失败"
          description={state.message}
          onRetry={() => void load()}
        />
      )}

      {state.phase === 'ready' && (
        <TeamsContent
          query={query}
          teams={state.teams}
          tournamentId={tournamentId}
          tournamentName={state.tournamentName}
          onQueryChange={setQuery}
        />
      )}
    </PublicShell>
  )
}

function TeamsContent({
  query,
  teams,
  tournamentId,
  tournamentName,
  onQueryChange,
}: {
  query: string
  teams: ReadonlyTeamSummary[]
  tournamentId: string
  tournamentName: string
  onQueryChange: (value: string) => void
}) {
  const filteredTeams = useMemo(() => filterTeams(teams, query), [query, teams])

  return (
    <View>
      <View className="page-intro teams-intro">
        <View>
          <Text className="page-intro__eyebrow">TEAMS</Text>
          <Text className="page-intro__title">参赛球队</Text>
        </View>
        <Text className="page-intro__copy">{tournamentName}，仅展示已公开的报名与锁定名单。</Text>
      </View>

      {teams.length === 0 ? (
        <DataState
          kind="empty"
          title="暂无公开球队"
          description="报名审批和名单锁定完成后，球队才会出现在公开页面。"
        />
      ) : (
        <View>
          <View className="team-search surface">
            <View className="team-search__field">
              <Text className="team-search__label">快速定位</Text>
              <Input
                className="team-search__input"
                confirmType="search"
                placeholder="输入球队名称、简称或球队代码"
                value={query}
                onInput={(event) => onQueryChange(event.detail.value)}
              />
            </View>
            <Text className="team-search__count">
              {filteredTeams.length} / {teams.length} 支球队
            </Text>
            {query && (
              <Button
                className="button button--outline team-search__clear"
                onClick={() => onQueryChange('')}
              >
                清除
              </Button>
            )}
          </View>

          {filteredTeams.length === 0 ? (
            <View className="team-search-empty">
              <DataState kind="empty" title="没有匹配的球队" description="请尝试简称或球队代码。" />
            </View>
          ) : (
            <View className="team-directory">
              {filteredTeams.map((team) => (
                <View className="team-card surface" key={team.id}>
                  <View className="team-card__heading" onClick={() => openDesktopTeam(team.id, tournamentId)}>
                    <TeamMark teamCode={team.teamCode} name={team.name} />
                    <View className="team-card__identity">
                      <Text className="team-card__name">{team.name}</Text>
                      <Text className="team-card__code">{team.teamCode}</Text>
                    </View>
                  </View>
                  <View className="team-card__statuses">
                    <Text className="status-tag status-tag--approved">
                      {getRegistrationStatusText(team.registrationStatus)}
                    </Text>
                    <Text className="status-tag status-tag--locked">
                      {getRosterStatusText(team.rosterStatus)}
                    </Text>
                  </View>
                  <View className="team-card__roster">
                    <Text className="team-card__roster-count">{team.rosterPlayerCount}</Text>
                    <Text className="team-card__roster-label">公开名单人数</Text>
                  </View>
                  <Button
                    className="button button--primary team-card__button"
                    onClick={() =>
                      void openTeam(team.id, tournamentId)
                    }
                  >
                    查看球队
                  </Button>
                </View>
              ))}
            </View>
          )}
        </View>
      )}
    </View>
  )
}
