import { Image, Text, View } from '@tarojs/components'
import { useEffect, useState } from 'react'
import { productRepository, resolveMediaUrl } from '../../features/product/product.repository'
import './player-face.weapp.scss'
import { useStoredSessionUser } from '../../features/product/current-user.weapp'
import {
  nativePlayerInitial,
  nativePlayerPhotos,
} from '../../features/product/native-profile.logic.weapp'

export function NativePlayerFace({
  playerId,
  tournamentId,
  name,
  avatarUrl,
  portraitUrl,
  preferProvided = false,
  useSessionAvatar = true,
  loadPortrait = false,
  large = false,
  small = false,
  fill = false,
}: {
  playerId?: string
  tournamentId?: string
  name: string
  avatarUrl?: string | null
  portraitUrl?: string | null
  preferProvided?: boolean
  useSessionAvatar?: boolean
  loadPortrait?: boolean
  large?: boolean
  small?: boolean
  fill?: boolean
}) {
  const [media, setMedia] = useState<{
    avatarUrl: string | null
    portraitUrl: string | null
  } | null>(null)
  const [failed, setFailed] = useState(0)
  const user = useStoredSessionUser()
  const currentAvatar =
    useSessionAvatar && playerId && user?.linkedPlayer?.id === playerId
      ? user.linkedPlayer.avatarUrl
      : null
  const provided = preferProvided
      ? nativePlayerPhotos(avatarUrl, portraitUrl, currentAvatar)
      : nativePlayerPhotos(currentAvatar, avatarUrl, portraitUrl),
    providedKey = provided.join('|'),
    exhausted = failed >= provided.length
  useEffect(() => {
    setFailed(0)
    setMedia(null)
  }, [playerId, avatarUrl, portraitUrl, currentAvatar, preferProvided])
  useEffect(() => {
    let active = true
    if (loadPortrait && playerId && exhausted)
      void productRepository
        .getPlayer(playerId, tournamentId)
        .then((player) => {
          if (active) setMedia(player)
        })
        .catch(() => {})
    return () => {
      active = false
    }
  }, [playerId, tournamentId, providedKey, exhausted, loadPortrait])
  const sources = nativePlayerPhotos(...provided, media?.avatarUrl, media?.portraitUrl).map(
    (source) => resolveMediaUrl(source)!,
  )
  return (
    <View
      className={`native-player-face${large ? ' native-player-face--large' : small ? ' native-player-face--small' : ''}${fill ? ' native-player-face--fill' : ''}`}
      style="flex:none;"
      aria-label={`${name}的头像`}
    >
      {sources[failed] ? (
        <Image
          src={sources[failed]!}
          mode="aspectFill"
          onError={() => setFailed((value) => value + 1)}
        />
      ) : (
        <Text className="native-player-face__initial">{nativePlayerInitial(name)}</Text>
      )}
    </View>
  )
}
