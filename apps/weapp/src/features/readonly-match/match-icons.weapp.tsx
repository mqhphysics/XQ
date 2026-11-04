import { Image, Text, View } from '@tarojs/components'
import ball from '../../assets/emoji/26bd.svg'
import type { MatchIconKind } from './match-icons.h5'

const labels: Record<MatchIconKind, string> = {
  GOAL: '进球',
  OWN_GOAL: '乌龙球',
  ASSIST: '助攻',
  YELLOW_CARD: '黄牌',
  RED_CARD: '红牌',
  SUBSTITUTION: '换人',
  ON: '换上',
  OFF: '换下',
  PENALTY_SCORED: '点球进球',
  PENALTY_MISSED: '点球未进',
}
export function NativeMatchIcon({ kind }: { kind: string }) {
  const goal = ['GOAL', 'OWN_GOAL', 'PENALTY_SCORED', 'PENALTY_MISSED'].includes(kind)
  return (
    <View
      className={`native-match-icon native-match-icon--${kind.toLowerCase()}`}
      role="img"
      aria-label={labels[kind as MatchIconKind] || kind}
    >
      {goal ? (
        <>
          <Image src={ball} mode="aspectFit" />
          {kind !== 'GOAL' && (
            <Text className="native-match-icon__modifier">
              {kind === 'OWN_GOAL' ? '↶' : kind === 'PENALTY_SCORED' ? 'P' : '×'}
            </Text>
          )}
        </>
      ) : kind === 'SUBSTITUTION' ? (
        <>
          <Text className="native-sub-on">↑</Text>
          <Text className="native-sub-off">↓</Text>
        </>
      ) : kind === 'ON' || kind === 'OFF' ? (
        <Text className={kind === 'ON' ? 'native-sub-on' : 'native-sub-off'}>
          {kind === 'ON' ? '↑' : '↓'}
        </Text>
      ) : (
        <View className="native-match-icon__shape" />
      )}
    </View>
  )
}
