import { Text, View } from '@tarojs/components'
import { formatKickoffTime, formatShortDate } from '../../services/format'
import type { MatchSummary } from '../../types'
import { MatchStatusBadge, TeamCrest } from '../team-crest'
import './index.scss'

export function formatFocusLabel(match: MatchSummary, tournamentName: string): string {
  const rawRound = /第.*轮/.test(match.title) ? match.title : match.roundName || match.title
  const round = rawRound.replace(/^(半决赛|决赛|八强赛|季军赛)\s*\d+$/, '$1')
  return `${tournamentName} · ${round}`
}

export function formatFocusValue(match: MatchSummary): string {
  if (match.homeScore !== null && match.awayScore !== null) {
    return `${match.homeScore} : ${match.awayScore}`
  }
  if (match.scheduledStartAt) {
    const shortDate = formatShortDate(match.scheduledStartAt).split(' ')[0] || ''
    const time = formatKickoffTime(match.scheduledStartAt)
    return `${shortDate}\n${time}`
  }
  return '待定'
}

export interface FocusMatchCardProps {
  match: MatchSummary
  tournamentName: string
  isPrimaryTeamMatch?: boolean
  onClick?: (match: MatchSummary) => void
}

export function FocusMatchCard({
  match,
  tournamentName,
  isPrimaryTeamMatch = false,
  onClick,
}: FocusMatchCardProps) {
  const scored = match.homeScore !== null && match.awayScore !== null
  const isLive = match.status === 'LIVE'

  return (
    <View
      className={`focus-match-card ${scored ? 'focus-match-card--scored' : ''} ${isLive ? 'focus-match-card--live' : ''} ${isPrimaryTeamMatch ? 'focus-match-card--primary' : ''}`}
      onClick={() => onClick?.(match)}
    >
      <View className="focus-match-card__head">
        <Text className="focus-match-card__label">{formatFocusLabel(match, tournamentName)}</Text>
        {isLive ? <Text className="focus-match-card__live-tag">进行中</Text> : null}
      </View>

      <View className="focus-match-card__body">
        <View className="focus-match-card__teams">
          <View className="focus-match-card__team-row">
            <TeamCrest
              teamCode={match.homeTeam?.teamCode}
              name={match.homeTeam?.shortName || match.homePlaceholder || '待定'}
              color={match.homeTeam?.primaryColor || undefined}
              crestUrl={match.homeTeam?.crestUrl}
              size="small"
            />
            <Text className="focus-match-card__team-name">
              {match.homeTeam?.shortName || match.homeTeam?.name || match.homePlaceholder || '主队待定'}
            </Text>
          </View>

          <View className="focus-match-card__team-row">
            <TeamCrest
              teamCode={match.awayTeam?.teamCode}
              name={match.awayTeam?.shortName || match.awayPlaceholder || '待定'}
              color={match.awayTeam?.primaryColor || undefined}
              crestUrl={match.awayTeam?.crestUrl}
              size="small"
            />
            <Text className="focus-match-card__team-name">
              {match.awayTeam?.shortName || match.awayTeam?.name || match.awayPlaceholder || '客队待定'}
            </Text>
          </View>
        </View>

        <Text
          className={`focus-match-card__value ${scored ? 'focus-match-card__value--score' : 'focus-match-card__value--time'}`}
        >
          {formatFocusValue(match)}
        </Text>
      </View>
    </View>
  )
}

export interface MatchRowCardProps {
  match: MatchSummary
  showDate?: boolean
  onClick?: (match: MatchSummary) => void
}

export function MatchRowCard({ match, showDate = false, onClick }: MatchRowCardProps) {
  const scored = match.homeScore !== null && match.awayScore !== null
  const penalty = match.homePenaltyScore !== null && match.awayPenaltyScore !== null

  return (
    <View
      className={`match-row-card ${match.status === 'LIVE' ? 'match-row-card--live' : ''}`}
      onClick={() => onClick?.(match)}
    >
      <View className="match-row-card__top">
        <Text className="match-row-card__meta">
          {showDate
            ? `${formatShortDate(match.scheduledStartAt)} ${formatKickoffTime(match.scheduledStartAt)}`
            : `${formatKickoffTime(match.scheduledStartAt)} · ${match.title || match.roundName || '比赛'}`}
        </Text>
        <MatchStatusBadge status={match.status} />
      </View>

      <View className="match-row-card__main">
        <View className="match-row-card__team">
          <TeamCrest
            teamCode={match.homeTeam?.teamCode}
            name={match.homeTeam?.shortName || match.homePlaceholder || '待定'}
            color={match.homeTeam?.primaryColor || undefined}
            crestUrl={match.homeTeam?.crestUrl}
            size="small"
          />
          <Text className="match-row-card__team-name">
            {match.homeTeam?.shortName || match.homeTeam?.name || match.homePlaceholder || '主队待定'}
          </Text>
        </View>

        <View className="match-row-card__center">
          <Text className="match-row-card__score">
            {scored
              ? `${match.homeScore} : ${match.awayScore}`
              : match.scheduledStartAt
                ? formatKickoffTime(match.scheduledStartAt)
                : 'VS'}
          </Text>
          {penalty ? (
            <Text className="match-row-card__penalty">
              点球 {match.homePenaltyScore}:{match.awayPenaltyScore}
            </Text>
          ) : null}
        </View>

        <View className="match-row-card__team match-row-card__team--away">
          <TeamCrest
            teamCode={match.awayTeam?.teamCode}
            name={match.awayTeam?.shortName || match.awayPlaceholder || '待定'}
            color={match.awayTeam?.primaryColor || undefined}
            crestUrl={match.awayTeam?.crestUrl}
            size="small"
          />
          <Text className="match-row-card__team-name">
            {match.awayTeam?.shortName || match.awayTeam?.name || match.awayPlaceholder || '客队待定'}
          </Text>
        </View>
      </View>

      <View className="match-row-card__foot">
        <Text className="match-row-card__round">{match.title || match.roundName || '赛程'}</Text>
        <Text className="match-row-card__venue">{match.venue?.name || '佑铭体育场'}</Text>
      </View>
    </View>
  )
}