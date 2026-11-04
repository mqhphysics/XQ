import { Text, View } from '@tarojs/components'
import type { LineupPlayer } from './lineup.logic'
import type { MatchSummary } from '../product/product.types'

export interface LineupBoardProps {
  players: LineupPlayer[]
  lockedPlayers: LineupPlayer[]
  matches: MatchSummary[]
  teamName: string
  tournamentId: string
  teamId: string
  /** Modal: landscape pitch (attack to the right) + compact chrome. */
  landscape?: boolean
  compact?: boolean
}
export default function LineupBoard(_props: LineupBoardProps) {
  return (
    <View>
      <Text>战术排阵目前请使用 H5 浏览器；小程序拖拽即将开放。</Text>
    </View>
  )
}
