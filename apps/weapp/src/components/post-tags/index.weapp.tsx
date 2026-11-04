import { Button, Text, View } from '@tarojs/components'
import { openPlayer } from '../../features/product/player-navigation'
import { openTeam } from '../../features/product/team-navigation'
import type { PostTagsProps } from './index'
import '../native-social/social.weapp.scss'
export function PostTags({ tags, tournamentId }: PostTagsProps) {
  if (!tags?.length) return null
  return (
    <View className="native-social-tags">
      {tags.map((tag) =>
        tag.targetId && tag.kind !== 'TOPIC' ? (
          <Button
            key={`${tag.kind}:${tag.targetId}`}
            onClick={(event) => {
              event.stopPropagation()
              if (tag.kind === 'TEAM') void openTeam(tag.targetId!, tournamentId || undefined)
              else void openPlayer(tag.targetId!, tournamentId || '')
            }}
          >
            #{tag.label}
          </Button>
        ) : (
          <Text key={`${tag.kind}:${tag.label}`}>#{tag.label}</Text>
        ),
      )}
    </View>
  )
}
