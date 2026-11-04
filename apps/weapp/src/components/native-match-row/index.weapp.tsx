import { Button, Image, Text, View } from '@tarojs/components'
import { useState } from 'react'
import type { TeamSummary } from '../../features/product/product.types'
import { resolveMediaUrl } from '../../features/product/product.repository'
import { demoCrestUrl } from '../../features/product/demo-media'
import { openMatch } from '../../features/product/match-navigation'
import { formatDate, formatTime, matchStatusLabel } from '../../features/product/product.format'
import type { NativeMatchRowProps } from './index'
import { nativeFocusLabel } from '../../pages/index/home-display.logic.weapp'

function Crest({ team }: { team: TeamSummary | null }) {
  const [failed, setFailed] = useState(false)
  const src = resolveMediaUrl(team?.crestUrl ?? (team ? demoCrestUrl(team.teamCode) : null))
  return src && !failed ? (
    <Image
      className="native-match__crest"
      mode="aspectFit"
      src={src}
      onError={() => setFailed(true)}
    />
  ) : (
    <Text className="native-match__crest native-match__crest--empty">
      {team?.shortName.slice(0, 1) || '?'}
    </Text>
  )
}
export function NativeMatchRow({
  match,
  onClick,
  showDate = false,
  competitionLabel,
}: NativeMatchRowProps & { competitionLabel?: string | undefined }) {
  const scored = match.homeScore !== null && match.awayScore !== null
  const penalty = match.homePenaltyScore !== null && match.awayPenaltyScore !== null
  return (
    <Button
      hoverClass="native-press"
      hoverStartTime={0}
      hoverStayTime={60}
      className={`native-match${match.status === 'LIVE' ? ' native-match--live' : ''}`}
      onClick={onClick ?? (() => void openMatch(match.id, match.tournamentId))}
      aria-label={`${match.homeTeam?.name ?? match.homePlaceholder ?? '主队待定'}对${match.awayTeam?.name ?? match.awayPlaceholder ?? '客队待定'}`}
    >
      <View className="native-match__main">
        <View className="native-match__team">
          <Crest team={match.homeTeam} />
          <Text>
            {match.homeTeam?.shortName ||
              match.homeTeam?.name ||
              match.homePlaceholder ||
              '主队待定'}
          </Text>
        </View>
        <Text className="native-match__score">
          {scored
            ? `${match.homeScore} : ${match.awayScore}`
            : match.scheduledStartAt
              ? formatTime(match.scheduledStartAt)
              : '待定'}
        </Text>
        <View className="native-match__team native-match__team--away">
          <Crest team={match.awayTeam} />
          <Text>
            {match.awayTeam?.shortName ||
              match.awayTeam?.name ||
              match.awayPlaceholder ||
              '客队待定'}
          </Text>
        </View>
      </View>
      <View className="native-match__meta native-match__meta--uniform">
        <Text>
          {competitionLabel ||
            nativeFocusLabel({
              ...match,
              focusCupName: match.title.match(/(?:新生|绿茵)杯/)?.[0] || '',
              focusGender: /女足/.test(match.title)
                ? 'FEMALE'
                : /男足/.test(match.title)
                  ? 'MALE'
                  : '',
            })}
        </Text>
        <Text className="native-match__venue">{match.venue?.name || '场地待定'}</Text>
        <Text
          className={`native-match__status native-match__status--${match.status.toLowerCase()}`}
        >
          {showDate ? formatDate(match.scheduledStartAt) + ' ' : ''}
          {formatTime(match.scheduledStartAt)} · {matchStatusLabel(match.status)}
        </Text>
      </View>
      {penalty && (
        <Text className="native-match__penalty">
          点球 {match.homePenaltyScore}:{match.awayPenaltyScore}
        </Text>
      )}
    </Button>
  )
}
