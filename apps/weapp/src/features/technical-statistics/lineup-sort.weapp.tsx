import { Text, View } from '@tarojs/components'
import { useNativeDragSort } from '../../components/native-ui/drag-sort.weapp'
import { NativePlayerPortrait } from '../../components/native-ui/match-lineups.weapp'
import { splitLineup, type RecorderLineup } from './board.logic.weapp'

export type SortPlayer = {
  id: string
  displayName: string
  shirtNumber: string | null
  avatarUrl?: string | null
  position?: string | null
}
const positions: Record<string, string> = {
  GOALKEEPER: '门将',
  DEFENDER: '后卫',
  MIDFIELDER: '中场',
  FORWARD: '前锋',
}
/**
 * Two-zone (场上 / 替补) drag list on the shared handle-only drag hook: one flat list
 * whose boundary stays fixed, so a bench player dropped onto the pitch pushes the last
 * pitch player down to the bench and the pitch stays at seven.
 */
export function NativeLineupSort({
  players,
  lineup,
  onChange,
}: {
  players: readonly SortPlayer[]
  lineup: RecorderLineup
  onChange: (next: RecorderLineup) => void
}) {
  const byId = new Map(players.map((player) => [player.id, player]))
  const order = [...lineup.pitch, ...lineup.bench]
  const sort = useNativeDragSort({
    items: order,
    rowSelector: '.native-lineup-sort .native-lineup-sort__row',
    onReorder: (next) => onChange(splitLineup(next, lineup.pitch.length)),
  })
  const row = (zone: 'pitch' | 'bench', id: string, index: number) => {
    const player = byId.get(id)
    if (!player) return null
    const flat = zone === 'pitch' ? index : lineup.pitch.length + index
    return (
      <View
        key={id}
        ref={sort.rowRef(flat)}
        className={`native-lineup-sort__row ${sort.rowClassName(flat)}`}
        style={sort.rowStyle(flat)}
      >
        <View
          className="native-drag-handle native-lineup-sort__handle"
          aria-label={`拖动${player.displayName}`}
          {...sort.handleProps(flat)}
        >
          <Text>≡</Text>
        </View>
        <View className="native-lineup-sort__face">
          <NativePlayerPortrait player={player} color={zone === 'pitch' ? '#1f6b45' : '#7d8f80'} />
        </View>
        <Text className="native-lineup-sort__number">{player.shirtNumber || '—'}</Text>
        <Text className="native-lineup-sort__name">{player.displayName}</Text>
        <Text className="native-lineup-sort__tag">
          {(player.position && positions[player.position]) || ''}
        </Text>
        <Text className="native-lineup-sort__index">{index + 1}</Text>
      </View>
    )
  }
  return (
    <View className={`native-lineup-sort${sort.drag ? ' is-dragging' : ''}`}>
      <View className="native-lineup-sort__zone">
        <Text>场上</Text>
        <Text>
          {lineup.pitch.length}/{Math.max(7, lineup.pitch.length)} · 显示在记录页顶部
        </Text>
      </View>
      {lineup.pitch.map((id, index) => row('pitch', id, index))}
      <View className="native-lineup-sort__zone is-bench">
        <Text>替补</Text>
        <Text>
          {lineup.bench.length ? `${lineup.bench.length} 人 · 拖到场上即上场` : '暂无替补'}
        </Text>
      </View>
      {lineup.bench.map((id, index) => row('bench', id, index))}
      <Text className="native-lineup-sort__hint">
        按住左侧 ≡ 拖动排序；替补拖进场上后，场上最后一位顺延到替补
      </Text>
    </View>
  )
}
