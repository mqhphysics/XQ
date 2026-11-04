import { Image, Text, View } from '@tarojs/components'
import { useEffect, useState } from 'react'
import { productRepository, resolveMediaUrl } from '../../features/product/product.repository'
import './player-face.weapp.scss'
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
  loadPortrait = false,
  large = false,
  small = false,
}: {
  playerId?: string
  tournamentId?: string
  name: string
  avatarUrl?: string | null
  portraitUrl?: string | null
  loadPortrait?: boolean
  large?: boolean
  small?: boolean
}) {
  const [media, setMedia] = useState<{
    avatarUrl: string | null
    portraitUrl: string | null
  } | null>(null)
  const [failed, setFailed] = useState(0)
  const provided = nativePlayerPhotos(avatarUrl, portraitUrl),
    providedKey = provided.join('|'),
    exhausted = failed >= provided.length
  useEffect(() => {
    setFailed(0)
    setMedia(null)
  }, [playerId, avatarUrl, portraitUrl])
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
  const sources = nativePlayerPhotos(
    avatarUrl,
    portraitUrl,
    media?.avatarUrl,
    media?.portraitUrl,
  ).map((source) => resolveMediaUrl(source)!)
  return (
    <View
      className={`native-player-face${large ? ' native-player-face--large' : small ? ' native-player-face--small' : ''}`}
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
