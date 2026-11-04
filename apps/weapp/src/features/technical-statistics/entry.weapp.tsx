import { Button, Picker, Text, View } from '@tarojs/components'
import { useEffect, useState } from 'react'
import { productConfigRepository } from '../product-config/product-config.repository'
import { canReportMatch } from '../identity/entry-scope'
import { useNativeCurrentUser } from '../product/current-user.weapp'
import { openNativeDetail } from '../native-navigation/index.weapp'
import { request } from '../product/product.repository'
import { campusRepository } from '../campus/campus.repository.h5'
import { realTournaments } from '../product/competition-scope.weapp'
import { openMatch } from '../product/match-navigation'
import { formatDate, formatTime } from '../product/product.format'
import type { AccountCapabilities } from '../../../../../packages/contracts/src/product-config'
import './technical.weapp.scss'
import {
  sortReporterMatches,
  reporterMatchKind,
  reporterMatchLabel,
} from './reporter-matches.logic.weapp'

export function NativeTechnicalEntry({
  matchId,
  tournamentId,
}: {
  matchId: string
  tournamentId: string
}) {
  const user = useNativeCurrentUser(),
    [allowed, setAllowed] = useState(false)
  useEffect(() => {
    let alive = true
    setAllowed(false)
    if (user)
      void productConfigRepository
        .getCapabilities()
        .then((caps) => {
          if (alive)
            setAllowed(
              !!caps.modules.matchReporting?.enabled &&
                canReportMatch(caps.actions['matchReports.write'], caps.organizationId, {
                  id: matchId,
                  tournamentId,
                }),
            )
        })
        .catch(() => {})
    return () => {
      alive = false
    }
  }, [user?.id, user?.organizationId, matchId, tournamentId])
  return allowed ? (
    <Button
      className="native-technical-entry"
      onClick={() =>
        void openNativeDetail(
          `/pages/readonly-match-detail/index?matchId=${encodeURIComponent(matchId)}&technical=1`,
        )
      }
    >
      ＋ 技术统计
    </Button>
  ) : null
}
type EntryMatch = {
  id: string
  tournamentId?: string
  scheduledStartAt: string | null
  status: string
  homeScore: number | null
  awayScore: number | null
  homeTeam: { shortName?: string; name: string } | null
  awayTeam: { shortName?: string; name: string } | null
}
export function NativeReporterMatches({
  tournamentId,
  onSelect,
}: {
  tournamentId: string
  onSelect: () => void
}) {
  const [catalog, setCatalog] = useState<Array<{ id: string; name: string }>>([]),
    [caps, setCaps] = useState<AccountCapabilities | null>(null)
  const [selected, setSelected] = useState(tournamentId),
    [matches, setMatches] = useState<EntryMatch[]>([]),
    [error, setError] = useState(''),
    [loading, setLoading] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const [expanded, setExpanded] = useState(false)
  useEffect(() => {
    let alive = true
    setLoading(true)
    void Promise.all([campusRepository.catalog(), productConfigRepository.getCapabilities()])
      .then(([data, capabilities]) => {
        if (!alive) return
        const capability = capabilities.actions['matchReports.write']
        if (!capabilities.modules.matchReporting?.enabled || !capability?.enabled)
          throw Error(capability?.reason || '当前没有比赛记录权限')
        const tournaments = realTournaments(data).filter(
          (t) =>
            t.status !== 'DRAFT' &&
            capability.scopes.some(
              (s) =>
                (s.type === 'ORGANIZATION' && s.id === capabilities.organizationId) ||
                (s.type === 'TOURNAMENT' && s.id === t.id) ||
                s.type === 'MATCH',
            ),
        )
        setCaps(capabilities)
        setCatalog(tournaments)
        setSelected((current) =>
          tournaments.some((t) => t.id === current) ? current : tournaments[0]?.id || '',
        )
      })
      .catch((issue) => {
        if (alive) setError(issue instanceof Error ? issue.message : '比赛读取失败')
      })
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [attempt])
  useEffect(() => {
    if (!selected || !caps) return
    let alive = true
    setLoading(true)
    setError('')
    setMatches([])
    setExpanded(false)
    void request<{ matches: EntryMatch[] }>(
      `/public/tournaments/${encodeURIComponent(selected)}/schedule`,
    )
      .then((data) => {
        if (alive)
          setMatches(
            sortReporterMatches(
              data.matches.filter((match) =>
                canReportMatch(caps.actions['matchReports.write'], caps.organizationId, {
                  id: match.id,
                  tournamentId: selected,
                }),
              ),
            ),
          )
      })
      .catch((issue) => {
        if (alive) setError(issue instanceof Error ? issue.message : '赛程读取失败')
      })
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [selected, caps, attempt])
  return (
    <View className="native-reporter-matches">
      <View className="native-reporter-title-row">
        <Text className="native-section-title">录入比赛信息</Text>
        {catalog.length > 0 && (
          <Picker
            range={catalog.map((t) => t.name)}
            value={Math.max(
              0,
              catalog.findIndex((t) => t.id === selected),
            )}
            onChange={(e) => setSelected(catalog[Number(e.detail.value)]!.id)}
          >
            <View className="native-select">
              <Text>{catalog.find((t) => t.id === selected)?.name}</Text>
              <View className="native-select__chevron" />
            </View>
          </Picker>
        )}
      </View>
      {loading && <Text className="native-note">正在读取授权比赛…</Text>}
      {error && (
        <>
          <Text className="native-error">{error}</Text>
          <Button onClick={() => setAttempt((x) => x + 1)}>重试</Button>
        </>
      )}
      {!loading && !error && !matches.length && (
        <Text className="native-note">暂无可记录的比赛</Text>
      )}
      {(expanded ? matches : matches.slice(0, 2)).map((match) => (
        <Button
          key={match.id}
          className={`native-reporter-match is-${reporterMatchKind(match)}`}
          onClick={() => {
            onSelect()
            void openMatch(match.id)
          }}
        >
          <View className="native-reporter-match__copy">
            <Text>
              {match.homeTeam?.shortName || match.homeTeam?.name || '待定'} vs{' '}
              {match.awayTeam?.shortName || match.awayTeam?.name || '待定'}
            </Text>
            <Text>
              {match.scheduledStartAt
                ? `${formatDate(match.scheduledStartAt)} ${formatTime(match.scheduledStartAt)}`
                : '时间待定'}{' '}
            </Text>
          </View>
          <Text className={`native-reporter-match__state is-${reporterMatchKind(match)}`}>
            {reporterMatchLabel(match)}
          </Text>
        </Button>
      ))}
      {matches.length > 2 && (
        <Button className="native-reporter-expand" onClick={() => setExpanded((value) => !value)}>
          {expanded ? '收起' : `展开全部（${matches.length} 场）`}
        </Button>
      )}
    </View>
  )
}
