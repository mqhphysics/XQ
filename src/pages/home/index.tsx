import { Button, Text, View } from '@tarojs/components'
import { useEffect, useState } from 'react'
import { AppShell, type NavSection } from '../../components/app-shell'
import { IdentityBadge } from '../../components/identity-badge'
import { DataState, MatchStatusBadge, TeamCrest } from '../../components/team-crest'
import { peekProduct, productRepository } from '../../services/api'
import { formatDateTime } from '../../services/format'
import type { HomeResponse } from '../../types'
import './index.scss'

const SECTION_TITLES: Record<NavSection, { title: string; subtitle: string }> = {
  home: {
    title: '首页总览与校园动态',
    subtitle: '实时同步云托管赛事快报、焦点赛程与讨论流',
  },
  schedule: {
    title: '赛程与实时比分',
    subtitle: '按轮次或日期浏览 2026 新生杯与演示赛季全部比赛',
  },
  team: {
    title: '主队空间与阵容',
    subtitle: '查看并管理你关注的学院主队、大名单与战术板',
  },
  data: {
    title: '数据中心与榜单',
    subtitle: '小组积分榜、淘汰赛对阵图与射手/助攻/红黄牌排行',
  },
  me: {
    title: '个人中心与认证',
    subtitle: '账号登录、校园与球员身份认证、消息收件箱与管理台',
  },
}

interface TournamentOption {
  id: string
  name?: string
  seasonName?: string
  status?: string
}

export default function HomePage() {
  const [section, setSection] = useState<NavSection>('home')
  const [homeData, setHomeData] = useState<HomeResponse | undefined>(() =>
    peekProduct<HomeResponse>('/public/home'),
  )
  const [tournaments, setTournaments] = useState<TournamentOption[]>([])
  const [loading, setLoading] = useState(!homeData)
  const [error, setError] = useState<string | null>(null)
  const [selectedTournamentId, setSelectedTournamentId] = useState<string | undefined>(
    homeData?.tournament?.id,
  )

  const loadHome = (tournamentId?: string, fresh = false) => {
    setLoading(true)
    setError(null)
    void productRepository
      .getHome(tournamentId, { fresh })
      .then((res) => {
        setHomeData(res)
        setSelectedTournamentId(res.tournament.id)
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : '加载失败，请稍后重试')
      })
      .finally(() => {
        setLoading(false)
      })
  }

  useEffect(() => {
    loadHome(selectedTournamentId, false)
    void productRepository
      .getPublishedTournaments()
      .then((res) => {
        setTournaments(res.items || [])
      })
      .catch(() => {})
  }, [])

  const meta = SECTION_TITLES[section]
  const matches = homeData?.focusMatches?.slice(0, 5) ?? []

  return (
    <AppShell
      active={section}
      onSectionChange={setSection}
      tournamentId={selectedTournamentId}
    >
      <View className="home-preview">
        <View className="home-preview__hero">
          <View className="home-preview__hero-top">
            <Text className="home-preview__badge">STAGE 2 · 导航壳层与数据仓库已就绪</Text>
            <IdentityBadge kind="official" />
          </View>
          <Text className="home-preview__title">{meta.title}</Text>
          <Text className="home-preview__subtitle">{meta.subtitle}</Text>

          {tournaments.length > 0 && homeData ? (
            <View className="home-preview__tournaments">
              {tournaments.map((item) => {
                const isCurrent = item.id === homeData.tournament.id
                return (
                  <Button
                    key={item.id}
                    className={`home-preview__tour-pill ${isCurrent ? 'home-preview__tour-pill--active' : ''}`}
                    onClick={() => loadHome(item.id, true)}
                  >
                    {item.name || item.seasonName || '赛事'}
                  </Button>
                )
              })}
            </View>
          ) : null}
        </View>

        {loading && !homeData ? (
          <DataState kind="loading" title="正在从云托管拉取赛事数据..." />
        ) : error && !homeData ? (
          <DataState
            kind="error"
            title="赛事数据读取失败"
            description={error}
            onRetry={() => loadHome(selectedTournamentId, true)}
          />
        ) : homeData ? (
          <View className="home-preview__section">
            <View className="home-preview__section-head">
              <Text className="home-preview__section-title">
                {homeData.tournament.seasonName} · {homeData.tournament.name}
              </Text>
              <Button
                className="home-preview__refresh-btn"
                onClick={() => loadHome(homeData.tournament.id, true)}
              >
                刷新
              </Button>
            </View>

            {matches.map((match) => {
              const homeName = match.homeTeam?.shortName || match.homePlaceholder || '待定'
              const awayName = match.awayTeam?.shortName || match.awayPlaceholder || '待定'
              return (
                <View key={match.id} className="home-preview__match-card">
                  <View className="home-preview__match-head">
                    <Text className="home-preview__match-meta">
                      {match.roundName || match.stageName || match.title}
                      {match.scheduledStartAt ? ` · ${formatDateTime(match.scheduledStartAt)}` : ''}
                    </Text>
                    <MatchStatusBadge status={match.status} />
                  </View>

                  <View className="home-preview__match-main">
                    <View className="home-preview__team">
                      <TeamCrest
                        teamCode={match.homeTeam?.teamCode || 'TBD'}
                        name={homeName}
                        color={match.homeTeam?.primaryColor || undefined}
                        crestUrl={match.homeTeam?.crestUrl}
                        size="small"
                      />
                      <Text className="home-preview__team-name">{homeName}</Text>
                    </View>

                    <Text className="home-preview__score">
                      {match.homeScore !== null && match.awayScore !== null
                        ? `${match.homeScore} : ${match.awayScore}`
                        : 'VS'}
                    </Text>

                    <View className="home-preview__team home-preview__team--away">
                      <TeamCrest
                        teamCode={match.awayTeam?.teamCode || 'TBD'}
                        name={awayName}
                        color={match.awayTeam?.primaryColor || undefined}
                        crestUrl={match.awayTeam?.crestUrl}
                        size="small"
                      />
                      <Text className="home-preview__team-name">{awayName}</Text>
                    </View>
                  </View>

                  {match.venue?.name ? (
                    <Text className="home-preview__venue">{match.venue.name}</Text>
                  ) : null}
                </View>
              )
            })}
          </View>
        ) : null}
      </View>
    </AppShell>
  )
}