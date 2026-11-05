import { Button, Text, View } from '@tarojs/components'
import { TeamCrest } from '../product-ui'
import { openMatch } from '../../features/product/match-navigation'
import { formatTime } from '../../features/product/product.format'
import type { CompetitionDataResponse, MatchSummary } from '../../features/product/product.types'
import { knockoutMatchTime, matchWinnerId } from '../../pages/data-center/knockout-display.logic'
import { mobileCupNodes, mobileFourCupNodes, mobileCupRounds } from './mobile-cup.logic.weapp'
import type { CupMatchView } from './cup-preview.logic'
import './knockout.weapp.scss'

export function NativeKnockout({ data }: { data: CompetitionDataResponse }) {
  const { rounds, thirdPlace, eightTeam } = mobileCupRounds(data)
  const fourTeam =
    rounds.length === 2 && rounds[0]?.matches.length === 2 && rounds[1]?.matches.length === 1
  const nodes = eightTeam ? mobileCupNodes : mobileFourCupNodes
  const stages = (eightTeam ? [0, 2, 3, 4, 5] : [0, 1]).map((index) => {
    const node = nodes[index]!
    return {
      title:
        node.round === rounds.length - 1
          ? '决赛'
          : node.round === rounds.length - 2
            ? '半决赛'
            : '八强',
      center: node.top - 40 + node.height / 2,
    }
  })
  if (!rounds.length && !thirdPlace) return null
  return (
    <View className="native-cup">
      {eightTeam || fourTeam ? (
        <View className={`native-cup-bracket${fourTeam ? ' native-cup-bracket--four' : ''}`}>
          {stages.map((stage, i) => (
            <Text
              key={i}
              className="native-cup-stage"
              style={`top:calc(${stage.center}*var(--u));`}
            >
              {stage.title}
            </Text>
          ))}
          <View className="native-cup-canvas">
            {eightTeam ? (
              <Branch top={128} bottom={160} join={144} />
            ) : (
              <Branch top={128} bottom={192} join={160} />
            )}
            {eightTeam && (
              <>
                <View
                  className="native-cup-line native-cup-line--vertical"
                  style="left:50%;top:calc(288*var(--u));height:calc(20*var(--u));"
                />
                <View
                  className="native-cup-line native-cup-line--vertical"
                  style="left:50%;top:calc(448*var(--u));height:calc(20*var(--u));"
                />
              </>
            )}
            {eightTeam && <Branch top={596} bottom={628} join={612} reverse />}
            {nodes.map((node) => (
              <View
                key={`${node.round}-${node.match}`}
                className={`native-cup-node${node.round === rounds.length - 1 ? ' native-cup-node--final' : ''}`}
                style={`left:${node.left}%;top:calc(${node.top - 40}*var(--u));width:${node.width}%;height:calc(${node.height}*var(--u));`}
              >
                <CupMatch match={rounds[node.round]!.matches[node.match]!} />
              </View>
            ))}
          </View>
        </View>
      ) : (
        <View className="native-cup-round-list">
          {rounds.map((round) => (
            <View key={round.id}>
              <Text className="native-cup-list-stage">{round.name}</Text>
              <View className="native-cup-list-column">
                {round.matches.map((match) => (
                  <View key={match.id} className="native-cup-list-match">
                    <CupMatch match={match} />
                  </View>
                ))}
              </View>
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
  return (
    <>
      {[24, 76].map((left) => (
        <View
          key={left}
          className="native-cup-line native-cup-line--vertical"
          style={`left:${left}%;top:calc(${reverse ? join : top}*var(--u));height:calc(${reverse ? bottom - join : join - top}*var(--u));`}
        />
      ))}
      <View
        className="native-cup-line native-cup-line--horizontal"
        style={`left:24%;top:calc(${join}*var(--u));width:52%;`}
      />
      <View
        className="native-cup-line native-cup-line--vertical"
        style={`left:50%;top:calc(${reverse ? top : join}*var(--u));height:calc(${reverse ? join - top : bottom - join}*var(--u));`}
      />
    </>
  )
}
function CupMatch({ match }: { match: CupMatchView }) {
  const scored = match.homeScore !== null && match.awayScore !== null
  return (
    <Button
      className="native-cup-match"
      disabled={Boolean(match.preview)}
      aria-label={`${match.title}，${match.homeTeam?.name || '待定'}对${match.awayTeam?.name || '待定'}`}
      onClick={() => {
        if (!match.preview) void openMatch(match.id, match.tournamentId)
      }}
    >
      <View className="native-cup-match__teams">
        <CupTeam match={match} side="home" />
        <View className="native-cup-match__center">
          <Text className="native-cup-match__score">
            {scored
              ? `${match.homeScore} : ${match.awayScore}`
              : match.scheduledStartAt
                ? formatTime(match.scheduledStartAt)
                : 'VS'}
          </Text>
          {match.scheduledStartAt && (
            <Text className="native-cup-match__time">
              {knockoutMatchTime(match.scheduledStartAt, true)}
            </Text>
          )}
        </View>
        <CupTeam match={match} side="away" />
      </View>
    </Button>
  )
}
function CupTeam({ match, side }: { match: MatchSummary; side: 'home' | 'away' }) {
  const team = side === 'home' ? match.homeTeam : match.awayTeam,
    winner = matchWinnerId(match)
  return (
    <View
      className={`native-cup-team${winner && winner !== team?.id ? ' native-cup-team--lost' : ''}`}
    >
      {team ? (
        <TeamCrest team={team} interactive={false} size="small" />
      ) : (
        <View className="native-cup-team__unknown">?</View>
      )}
      <Text>{team?.shortName || team?.name || '待定'}</Text>
    </View>
  )
}
