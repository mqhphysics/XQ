import { Button, PickerView, PickerViewColumn, RootPortal, Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useEffect, useState } from 'react'
import { UserAvatar } from '../../components/product-ui'
import type { LineupPlayer } from '../../features/captain-roster/lineup.logic'
import { useNativeBackLayer } from '../../features/native-navigation/leave-guard.weapp'

export function NativePlayerPicker({
  players,
  selectedId,
  onClose,
  onConfirm,
  onInspect,
}: {
  players: LineupPlayer[]
  selectedId: string | null
  onClose: () => void
  onConfirm: (id: string | null) => void
  onInspect: (id: string) => void
}) {
  const [index, setIndex] = useState(Math.max(0, players.findIndex((p) => p.id === selectedId) + 1))
  useNativeBackLayer(async () => {
    onClose()
    return true
  })
  useEffect(() => {
    void Taro.hideKeyboard().catch(() => {})
    Taro.eventCenter.trigger('xiaoqiu:native-overlay', true)
    return () => {
      Taro.eventCenter.trigger('xiaoqiu:native-overlay', false)
    }
  }, [])
  return (
    <RootPortal>
      <View className="native-player-wheel-mask" catchMove onClick={onClose}>
        <View className="native-player-wheel-sheet" onClick={(e) => e.stopPropagation()}>
          <View className="native-player-wheel-tools">
            <Button onClick={onClose}>取消</Button>
            <Button onClick={() => onConfirm(players[index - 1]?.id || null)}>确定</Button>
          </View>
          <PickerView
            className="native-player-wheel"
            indicatorStyle="height:96rpx;"
            value={[index]}
            onChange={(e) => setIndex(e.detail.value[0] || 0)}
          >
            <PickerViewColumn>
              <View className="native-player-wheel-row">
                <View className="native-player-wheel-row__inner">
                  <Text className="native-player-wheel-empty">—</Text>
                  <Text>留空</Text>
                </View>
              </View>
              {players.map((player) => (
                <View className="native-player-wheel-row" key={player.id}>
                  <View className="native-player-wheel-row__inner">
                    <UserAvatar
                      avatarUrl={player.avatarUrl}
                      name={player.displayName}
                      size="small"
                    />
                    <Text>{player.displayName}</Text>
                    <Text className="native-player-wheel-number">
                      {player.shirtNumber ? `${player.shirtNumber} 号` : ''}
                    </Text>
                  </View>
                </View>
              ))}
            </PickerViewColumn>
          </PickerView>
          {players[index - 1] && (
            <Button
              className="native-button native-player-wheel-profile"
              onClick={() => onInspect(players[index - 1]!.id)}
            >
              查看 {players[index - 1]!.displayName} 的球员资料
            </Button>
          )}
        </View>
      </View>
    </RootPortal>
  )
}
