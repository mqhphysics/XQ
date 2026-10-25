import { Button, Image, Text, View } from '@tarojs/components'
import { useState } from 'react'
import { TeamCrest } from '../product-ui'
import { NativeDialog } from './index.weapp'
import { resolveMediaUrl } from '../../features/product/product.repository'
import { openPlayer } from '../../features/product/player-navigation'
import { positionLabel } from '../../features/product/product.format.weapp'
import type { MatchExperienceResponse } from '../../features/product/product.types'
import {
  collectPlayerEvents,
  lineupGroups,
  playerEventDetails,
} from '../../features/readonly-match/lineup.logic'
import { createLineupDisplay } from '../../features/readonly-match/lineup-display.h5'
import { NativeMatchIcon } from '../../features/readonly-match/match-icons.weapp'

type Player = MatchExperienceResponse['lineups'][number]['players'][number]
export function NativePlayerPortrait({
  player,
  color,
  keeper = false,
  empty = false,
}: {
  player: { avatarUrl?: string | null; shirtNumber: string | null }
  color: string
  keeper?: boolean
  empty?: boolean
}) {
  const [failed, setFailed] = useState(false)
  const avatar = !failed && resolveMediaUrl(player.avatarUrl)
  return (
    <View className="native-pitch-portrait">
      <View
        className={`native-pitch-shirt${keeper ? ' native-pitch-shirt--keeper' : ''}`}
        style={`background-color:${color};`}
      >
        {avatar ? (
          <Image src={avatar} mode="aspectFill" onError={() => setFailed(true)} />
        ) : (
          <Text>{player.shirtNumber || (empty ? '' : '·')}</Text>
        )}
      </View>
      {avatar && <Text className="native-pitch-player__number">{player.shirtNumber || '·'}</Text>}
    </View>
  )
}
export function NativeLineups({ match }: { match: MatchExperienceResponse }) {
  const [selected, setSelected] = useState<Player | null>(null)
  const sides = [match.homeTeam, match.awayTeam].map((team, side) => {
    const lineup = match.lineups.find((item) => item.team.id === team?.id)
    const groups = lineup ? lineupGroups(lineup) : { starters: [], substitutes: [] }
    return {
      team,
      side,
      lineup,
      ...groups,
      display: createLineupDisplay(groups.starters),
      events: collectPlayerEvents(match.events, team?.id || ''),
    }
  })
  const selectedSide = sides.find((side) => side.lineup?.players.some((p) => p.id === selected?.id))
  const details = selected ? playerEventDetails(selectedSide?.events.get(selected.id)) : []
  return (
    <View className="native-match-lineups">
      <View className="native-lineup-note native-lineup-note--teams">
        {sides.map(({ team, lineup, side }) => (
          <View key={side}>
            <TeamCrest team={team} size="small" interactive={false} />
            <Text>
              {team?.shortName || team?.name || '待定'}
              {lineup?.formation ? ` · ${lineup.formation}` : ''}
            </Text>
          </View>
        ))}
      </View>
      <View className="native-football-pitch native-football-pitch--both" aria-label="双方首发阵容">
        <View className="native-pitch-border" />
        <View className="native-pitch-midline" />
        <View className="native-pitch-circle" />
        <View className="native-pitch-penalty native-pitch-penalty--top" />
        <View className="native-pitch-penalty native-pitch-penalty--bottom" />
        <View className="native-pitch-goal native-pitch-goal--top" />
        <View className="native-pitch-goal native-pitch-goal--bottom" />
        {sides.map(({ team, side, display, events }) => (
          <View key={side}>
            {!display.players.length && (
              <Text className={`native-pitch-unavailable native-pitch-unavailable--${side}`}>
                阵容尚未公布
              </Text>
            )}
            {display.players.map(({ player, point, lane }) => (
              <Button
                key={player.id}
                className="native-pitch-player"
                style={`left:${Math.max(10, Math.min(90, 50 + ((side ? 100 - point.x : point.x) - 50) * 1.2))}%;top:${side ? 96 - point.y * 0.42 : 4 + point.y * 0.42}%;`}
                aria-label={`${player.displayName} ${player.shirtNumber || ''}号`}
                onClick={() => setSelected(player)}
              >
                <NativePlayerPortrait
                  player={player}
                  keeper={lane === 'GOALKEEPER'}
                  color={
                    team?.primaryColor &&
                    (side === 0 || team.primaryColor !== sides[0]?.team?.primaryColor)
                      ? team.primaryColor
                      : side
                        ? '#375eac'
                        : '#af493d'
                  }
                />
                <Text className="native-pitch-player__name">{player.displayName}</Text>
                <View className="native-pitch-events">
                  {(['goals', 'yellowCards', 'redCards', 'on', 'off'] as const).map((type, i) =>
                    events.get(player.id)?.[type].length ? (
                      <NativeMatchIcon
                        key={type}
                        kind={['GOAL', 'YELLOW_CARD', 'RED_CARD', 'ON', 'OFF'][i]!}
                      />
                    ) : null,
                  )}
                </View>
              </Button>
            ))}
          </View>
        ))}
      </View>
      <View className="native-match-benches">
        {sides.map(({ team, substitutes, side }) => (
          <View key={side}>
            <Text className="native-match-section-title">
              {team?.shortName || team?.name || '待定'} · 替补
            </Text>
            {!substitutes.length && <Text className="native-note">替补名单尚未公布</Text>}
            <View className="native-match-bench">
              {substitutes.map((player) => (
                <Button key={player.id} onClick={() => setSelected(player)}>
                  <Text className="native-bench-number">{player.shirtNumber || '·'}</Text>
                  <View className="native-bench-player-copy">
                    <Text>{player.displayName}</Text>
                    <Text className="native-bench-meta">
                      {positionLabel(player.position)}
                      {player.minutesPlayed === null ? '' : ` · ${player.minutesPlayed}分钟`}
                    </Text>
                  </View>
                </Button>
              ))}
            </View>
          </View>
        ))}
      </View>
      {selected && (
        <NativeDialog
          title={`${selected.displayName}${selected.shirtNumber ? ` · ${selected.shirtNumber}号` : ''}`}
          onClose={() => setSelected(null)}
          footer={
            <Button
              className="native-button"
              onClick={() => {
                void openPlayer(selected.id, match.tournamentId)
                setSelected(null)
              }}
            >
              球员档案
            </Button>
          }
        >
          <Text className="native-note">
            {positionLabel(selected.position)} ·{' '}
            {selected.minutesPlayed === null ? '出场时长未记录' : `${selected.minutesPlayed}分钟`}
          </Text>
          {details.length ? (
            details.map((label) => (
              <Text key={label} className="native-player-event-detail">
                {label}
              </Text>
            ))
          ) : (
            <Text className="native-note">本场暂无个人事件记录</Text>
          )}
        </NativeDialog>
      )}
    </View>
  )
}
