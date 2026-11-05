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
  const { rounds, thirdPlace, eightTeam, qualified, preview } = mobileCupRounds(data)
  const fourTeam =
    rounds.length === 2 && rounds[0]?.matches.length === 2 && rounds[1]?.matches.length === 1
  const nodes = eightTeam ? mobileCupNodes : mobileFourCupNodes
  if (!rounds.length && !thirdPlace) return <Text className="native-note">淘汰赛对阵尚未发布</Text>
  return (
    <View className="native-cup">
      <Text className="native-section-title">{preview ? '淘汰赛对阵预览' : '淘汰赛'}</Text>
      {preview && qualified.some((q) => q.rank === null) && (
        <View className="native-cup-qualified">
          <Text>已出线 · 名次待定</Text>
          {qualified
            .filter((q) => q.rank === null)
            .map((q) => (
              <View key={q.team.id}>
                <TeamCrest team={q.team} interactive={false} size="small" />
                <Text>
                  {q.group}组 · {q.team.shortName || q.team.name}
                </Text>
              </View>
            ))}
        </View>
      )}
      {eightTeam || fourTeam ? (
        <View className={`native-cup-bracket${fourTeam ? ' native-cup-bracket--four' : ''}`}>
          {(eightTeam
            ? [
                { title: '八强', top: 0 },
                { title: '半决赛', top: 160 },
                { title: '决赛', top: 308 },
                { title: '半决赛', top: 468 },
                { title: '八强', top: 628 },
              ]
            : [
                { title: '半决赛', top: 0 },
                { title: '决赛', top: 160 },
                { title: '半决赛', top: 332 },
              ]
          ).map((stage, index) => (
            <Text
              key={index}
              className="native-cup-stage"
              style={`top:calc(${stage.top}*var(--u));`}
            >
              {stage.title}
            </Text>
          ))}
          {eightTeam ? <Branch top={168} bottom={200} join={184} /> : null}
          <View
            className="native-cup-line native-cup-line--vertical"
            style={`left:50%;top:calc(${eightTeam ? 328 : 168}*var(--u));height:calc(${eightTeam ? 20 : 32}*var(--u));`}
          />
          <View
            className="native-cup-line native-cup-line--vertical"
            style={`left:50%;top:calc(${eightTeam ? 488 : 340}*var(--u));height:calc(${eightTeam ? 20 : 32}*var(--u));`}
          />
          {eightTeam ? <Branch top={636} bottom={668} join={652} reverse /> : null}
          {nodes.map((node) => (
            <View
              key={`${node.round}-${node.match}`}
              className={`native-cup-node${node.round === rounds.length - 1 ? ' native-cup-node--final' : ''}`}
              style={`left:${node.left}%;top:calc(${node.top}*var(--u));width:${node.width}%;height:calc(${node.height}*var(--u));`}
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
          style={`left:${left}%;top:calc(${outerTop}*var(--u));height:calc(${outerHeight}*var(--u));`}
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
      aria-label={`${match.title}，${match.homeTeam?.name ?? match.homePlaceholder ?? '待定'}对${match.awayTeam?.name ?? match.awayPlaceholder ?? '待定'}`}
      onClick={() => {
        if (!match.preview) void openMatch(match.id, match.tournamentId)
      }}
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
        {match.preview ? '赛程待发布' : knockoutMatchTime(match.scheduledStartAt, !scored)}
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
