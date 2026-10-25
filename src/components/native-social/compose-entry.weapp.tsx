import { Button, Image, Text, View } from '@tarojs/components'
import { UserAvatar } from '../product-ui'
import { useNativeCurrentUser } from '../../features/product/current-user.weapp'
import { nativeWriteEnabled } from '../../features/native-social/config.weapp'
import { openNativeComposer } from '../../features/native-social/routing.weapp'
import photoIcon from '../../assets/post-icons/photo.svg'
import './social.weapp.scss'
export function NativeComposeEntry({
  tournamentId,
  teamId,
}: {
  tournamentId?: string | undefined
  teamId?: string | undefined
}) {
  const user = useNativeCurrentUser()
  if (!nativeWriteEnabled('publishPosts')) return null
  return (
    <Button
      className="native-compose-entry"
      onClick={() => void openNativeComposer({ tournamentId, teamId })}
    >
      <UserAvatar
        name={user?.displayName || '访客'}
        avatarUrl={user?.avatarUrl || null}
        size="small"
      />
      <View>
        <Text>分享你的绿茵时刻</Text>
        <Text>写动态、发照片、添加标签</Text>
      </View>
      <Image src={photoIcon} />
    </Button>
  )
}
