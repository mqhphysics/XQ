import { Button, Text, View } from '@tarojs/components'
import { TeamCrest } from '../product-ui'
import { openMatch } from '../../features/product/match-navigation'
import { formatTime } from '../../features/product/product.format'
import type { CompetitionDataResponse, MatchSummary } from '../../features/product/product.types'
import { knockoutMatchTime, matchWinnerId } from '../../pages/data-center/knockout-display.logic'
import { mobileCupNodes, mobileCupRounds } from './mobile-cup.logic.weapp'
import './knockout.weapp.scss'

export function NativeKnockout({ data }: { data: CompetitionDataResponse }) {
  const { rounds, thirdPlace, eightTeam } = mobileCupRounds(data)
  if (!rounds.length && !thirdPlace) return <Text className="native-note">淘汰赛对阵尚未发布</Text>
  return (
    <View className="native-cup">
      <Text className="native-section-title">淘汰赛</Text>
      {eightTeam ? (
        <View className="native-cup-bracket">
          {[
            { title: '八强', top: 0 },
            { title: '半决赛', top: 160 },
            { title: '决赛', top: 308 },
            { title: '半决赛', top: 468 },
            { title: '八强', top: 628 },
          ].map((stage, index) => (
            <Text key={index} className="native-cup-stage" style={`top:${stage.top}rpx;`}>
              {stage.title}
            </Text>
          ))}
          <Branch top={168} bottom={200} join={184} />
          <View
            className="native-cup-line native-cup-line--vertical"
            style="left:50%;top:328rpx;height:20rpx;"
          />
          <View
            className="native-cup-line native-cup-line--vertical"
            style="left:50%;top:488rpx;height:20rpx;"
          />
          <Branch top={636} bottom={668} join={652} reverse />
          {mobileCupNodes.map((node) => (
            <View
              key={`${node.round}-${node.match}`}
              className={`native-cup-node${node.round === 2 ? ' native-cup-node--final' : ''}`}
              style={`left:${node.left}%;top:${node.top}rpx;width:${node.width}%;height:${node.height}rpx;`}
            >
              <CupMatch match={rounds[node.round]!.matches[node.match]!} />
            </View>
          ))}
        </View>
      ) : (
        <View className="native-cup-round-list">
          {rounds.map((round) => (
            <View key={round.id}>
              <Text className="native-cup-list-stage">{round.name}</Text>
              {round.matches.map((match) => (
                <View key={match.id} className="native-cup-list-match">
                  <CupMatch match={match} />
                </View>
              ))}
            </View>
          ))}
        </View>
      )}
      {thirdPlace && (
        <View className="native-cup-third">
          <Text className="native-cup-list-stage">季军赛</Text>
          <View className="native-cup-list-match">
            <CupMatch match={thirdPlace} />
          </View>
        </View>
      )}
    </View>
  )
}
function Branch({
  top,
  bottom,
  join,
  reverse = false,
}: {
  top: number
  bottom: number
  join: number
  reverse?: boolean
}) {
  const outerTop = reverse ? join : top,
    outerHeight = reverse ? bottom - join : join - top
  return (
    <>
      {[24, 76].map((left) => (
        <View
          key={left}
          className="native-cup-line native-cup-line--vertical"
          style={`left:${left}%;top:${outerTop}rpx;height:${outerHeight}rpx;`}
        />
      ))}
      <View
        className="native-cup-line native-cup-line--horizontal"
        style={`left:24%;top:${join}rpx;width:52%;`}
      />
      <View
        className="native-cup-line native-cup-line--vertical"
        style={`left:50%;top:${reverse ? top : join}rpx;height:${reverse ? join - top : bottom - join}rpx;`}
      />
    </>
  )
}
function CupMatch({ match }: { match: MatchSummary }) {
  const scored = match.homeScore !== null && match.awayScore !== null
  return (
    <Button
      className="native-cup-match"
      aria-label={`${match.title}，${match.homeTeam?.name ?? match.homePlaceholder ?? '待定'}对${match.awayTeam?.name ?? match.awayPlaceholder ?? '待定'}`}
      onClick={() => void openMatch(match.id, match.tournamentId)}
    >
      <View className="native-cup-match__teams">
        <CupTeam match={match} side="home" />
        <Text className="native-cup-match__score">
          {scored
            ? `${match.homeScore} : ${match.awayScore}`
            : match.scheduledStartAt
              ? formatTime(match.scheduledStartAt)
              : '待定'}
        </Text>
        <CupTeam match={match} side="away" />
      </View>
      <Text className="native-cup-match__time">
        {knockoutMatchTime(match.scheduledStartAt, !scored)}
      </Text>
    </Button>
  )
}
function CupTeam({ match, side }: { match: MatchSummary; side: 'home' | 'away' }) {
  const team = side === 'home' ? match.homeTeam : match.awayTeam
  const winner = matchWinnerId(match),
    placeholder = side === 'home' ? match.homePlaceholder : match.awayPlaceholder
  return (
    <View
      className={`native-cup-team${winner && winner !== team?.id ? ' native-cup-team--lost' : ''}`}
    >
      {team ? (
        <TeamCrest team={team} interactive={false} size="small" />
      ) : (
        <View className="native-cup-team__unknown">?</View>
      )}
      <Text>{team?.shortName || team?.name || placeholder || '待定'}</Text>
    </View>
  )
}
