import { Button, Picker, Text, View } from '@tarojs/components'
import { useContext, useEffect, useState } from 'react'
import { useDidHide, useDidShow } from '@tarojs/taro'
import { NativeDetailActiveContext } from '../native-navigation/detail-context.weapp'
import { nativeReportApi } from '../match-report/repository.weapp'
import { productConfigRepository } from '../product-config/product-config.repository'
import { canReportMatch } from '../identity/entry-scope'
import { useNativeCurrentUser } from '../product/current-user.weapp'
import { openNativeTechnical } from '../native-navigation/index.weapp'
import { request } from '../product/product.repository'
import { campusRepository } from '../campus/campus.repository.h5'
import { realTournaments } from '../product/competition-scope.weapp'
import { openMatch } from '../product/match-navigation'
import { formatDate, formatTime } from '../product/product.format'
import { technicalApi } from './repository.weapp'
import { NativeMatchReportEntry } from '../match-report/editor.weapp'
import type { MatchExperienceResponse } from '../product/product.types'
import type { AccountCapabilities } from '../../../../../packages/contracts/src/product-config'
import {
  sortReporterMatches,
  reporterMatchKind,
  reporterMatchLabel,
} from './reporter-matches.logic.weapp'

export function NativeTechnicalEntry({
  matchId,
  tournamentId,
  match,
  onUpdated,
}: {
  matchId: string
  tournamentId: string
  match: MatchExperienceResponse
  onUpdated: (match: MatchExperienceResponse) => void
}) {
  const user = useNativeCurrentUser(),
    [allowed, setAllowed] = useState({ information: false, technical: false })
  const active = useContext(NativeDetailActiveContext)
  const [shown, setShown] = useState(true)
  useDidShow(() => setShown(true))
  useDidHide(() => setShown(false))
  useEffect(() => {
    let alive = true
    let timer: ReturnType<typeof setTimeout> | undefined
    setAllowed({ information: false, technical: false })
    const refresh = async () => {
      try {
        const caps = await productConfigRepository.getCapabilities()
        if (
          !caps.modules.matchReporting?.enabled ||
          !canReportMatch(caps.actions['matchReports.write'], caps.organizationId, {
            id: matchId,
            tournamentId,
          })
        )
          return
        const workspace = await nativeReportApi.load(matchId)
        if (!alive) return
        const administrator = workspace.permissions.isAdministrator
        setAllowed({
          information:
            administrator || Boolean(workspace.inline.canStart && !workspace.inline.completed),
          technical: administrator || workspace.permissions.canRecordTechnical,
        })
      } catch {
        if (alive) setAllowed({ information: false, technical: false })
      } finally {
        if (alive) timer = setTimeout(() => void refresh(), 15000)
      }
    }
    if (user && shown && active) void refresh()
    return () => {
      alive = false
      if (timer) clearTimeout(timer)
    }
  }, [user?.id, user?.organizationId, matchId, tournamentId, shown, active, match])
  return allowed.information || allowed.technical ? (
    <View className="native-recording-tools">
      {allowed.information && (
        <NativeMatchReportEntry match={match} onUpdated={onUpdated} compact />
      )}
      {allowed.technical && (
        <Button className="native-recording-tool" onClick={() => void openNativeTechnical(matchId)}>
          <View className="native-recording-tool__stats" aria-hidden />
          <Text>技术统计</Text>
        </Button>
      )}
    </View>
  ) : null
}
type EntryMatch = {
  recordingComplete?: boolean
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
    void Promise.all([
      request<{ matches: EntryMatch[] }>(
        `/public/tournaments/${encodeURIComponent(selected)}/schedule`,
      ),
      technicalApi.overview(selected),
    ])
      .then(([data, overview]) => {
        const recorded = new Map(overview.items.map((item) => [item.matchId, item]))
        if (alive)
          setMatches(
            sortReporterMatches(
              data.matches
                .filter((match) =>
                  canReportMatch(caps.actions['matchReports.write'], caps.organizationId, {
                    id: match.id,
                    tournamentId: selected,
                  }),
                )
                .map((match) => {
                  const entry = recorded.get(match.id)
                  return {
                    ...match,
                    homeScore: entry?.homeScore ?? match.homeScore,
                    awayScore: entry?.awayScore ?? match.awayScore,
                    recordingComplete:
                      overview.completionRuleVersion === 1 && entry?.recorded === true,
                  }
                }),
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
      {(expanded ? matches : matches.slice(0, 3)).map((match) => (
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
      {matches.length > 3 && (
        <Button
          className="native-button native-reporter-expand"
          aria-expanded={expanded}
          onClick={() => setExpanded((value) => !value)}
        >
          <Text>{expanded ? '收起' : `展开全部（${matches.length} 场）`}</Text>
          <View className={`native-reporter-expand__chevron${expanded ? ' is-expanded' : ''}`} />
        </Button>
      )}
    </View>
  )
}
