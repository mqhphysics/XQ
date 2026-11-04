import { Button, Image, Text, View } from '@tarojs/components'
import { useState } from 'react'
import { resolveMediaUrl } from '../../features/product/product.repository'
import { demoCrestUrl } from '../../features/product/demo-media'
import { openMatch } from '../../features/product/match-navigation'
import {
  formatTime,
  matchStatusLabel,
  matchStatusTone,
} from '../../features/product/product.format'
import type { MatchSummary, TeamSummary } from '../../features/product/product.types'
import { TBD_LABEL } from '../../components/tbd-team'

/*
 * Wide windows only: one website schedule row (desktop-schedule.h5.tsx MatchRow) —
 * 时间 | 轮次/小组 | 主队 比分 客队 | 状态 | 场地, with the reason strip underneath.
 * Phones keep NativeMatchRow cards.
 */
function RowCrest({ team }: { team: TeamSummary | null }) {
  const [failed, setFailed] = useState(false)
  const src = resolveMediaUrl(team?.crestUrl ?? (team ? demoCrestUrl(team.teamCode) : null))
  return src && !failed ? (
    <Image
      className="native-schedule-row__crest"
      mode="aspectFit"
      src={src}
      onError={() => setFailed(true)}
    />
  ) : (
    <Text className="native-schedule-row__crest native-schedule-row__crest--empty">
      {team?.shortName.slice(0, 1) || '?'}
    </Text>
  )
}

function RowTeam({
  team,
  placeholder,
  away = false,
}: {
  team: TeamSummary | null
  placeholder: string | null | undefined
  away?: boolean
}) {
  return (
    <View className={`native-schedule-row__team${away ? ' native-schedule-row__team--away' : ''}`}>
      <Text className="native-schedule-row__name">
        {team ? team.shortName || team.name : placeholder || TBD_LABEL}
      </Text>
      <RowCrest team={team} />
    </View>
  )
}

export function WideScheduleRow({
  match,
  competitionLabel,
}: {
  match: MatchSummary
  competitionLabel?: string | undefined
}) {
  const scored = match.homeScore !== null && match.awayScore !== null
  const penalty = match.homePenaltyScore !== null || match.awayPenaltyScore !== null
  const adjudicated = Boolean(match.statusReason?.startsWith('组委会裁定'))
  const group = match.groupName ?? match.title
  return (
    <Button
      hoverClass="native-press"
      hoverStartTime={0}
      hoverStayTime={60}
      className="native-schedule-row"
      aria-label={`查看${match.homeTeam?.name ?? TBD_LABEL}对阵${match.awayTeam?.name ?? TBD_LABEL}的比赛详情`}
      onClick={() => void openMatch(match.id, match.tournamentId)}
    >
      <View className="native-schedule-row__body">
        <Text className="native-schedule-row__time">{formatTime(match.scheduledStartAt)}</Text>
        <View className="native-schedule-row__phase">
          <Text className="native-schedule-row__round">
            {match.roundName ?? match.stageName ?? match.title}
          </Text>
          <Text className="native-schedule-row__group">
            {competitionLabel ? `${competitionLabel} · ${group}` : group}
          </Text>
        </View>
        <View className="native-schedule-row__fixture">
          <RowTeam team={match.homeTeam} placeholder={match.homePlaceholder} />
          <View className="native-schedule-row__score">
            <Text className="native-schedule-row__score-main">
              {scored
                ? `${match.homeScore} : ${match.awayScore}`
                : match.status === 'FINISHED'
                  ? '— : —'
                  : 'VS'}
            </Text>
            {penalty && (
              <Text className="native-schedule-row__penalty">
                点球 {match.homePenaltyScore ?? 0} : {match.awayPenaltyScore ?? 0}
              </Text>
            )}
          </View>
          <RowTeam away team={match.awayTeam} placeholder={match.awayPlaceholder} />
        </View>
        {adjudicated ? (
          <Text className="native-schedule-row__status native-schedule-row__status--ruled">
            裁定赛果
          </Text>
        ) : (
          <Text
            className={`native-schedule-row__status native-schedule-row__status--${matchStatusTone(match.status)}`}
          >
            {matchStatusLabel(match.status)}
          </Text>
        )}
        <View className="native-schedule-row__venue">
          <View className="native-schedule-row__pin" />
          <Text className="native-schedule-row__venue-name">{match.venue?.name ?? '场地待定'}</Text>
        </View>
      </View>
      {match.statusReason && !adjudicated && (
        <Text className="native-schedule-row__reason">{match.statusReason}</Text>
      )}
    </Button>
  )
}
