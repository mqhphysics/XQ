import { useState } from 'react'
import { resolveMediaUrl, sizedMediaUrl } from '../features/product/product.repository'
import { PlayerTrigger } from './player-trigger'
import { playerAvatarInitial, playerAvatarPhoto } from './player-avatar.logic.h5'
import './product-ui/index.scss'

export function PlayerAvatar({
  name,
  avatarUrl,
  color,
  size = 'medium',
  playerId,
  tournamentId,
}: {
  name: string
  avatarUrl?: string | null | undefined
  color?: string | null | undefined
  size?: 'small' | 'medium' | 'large'
  playerId?: string | undefined
  tournamentId?: string | undefined
}) {
  const source = sizedMediaUrl(
    resolveMediaUrl(playerAvatarPhoto(avatarUrl)),
    { small: 96, medium: 128, large: 256 }[size],
  )
  const [failedSource, setFailedSource] = useState<string | null>(null)
  const avatar = (
    <span
      className={`user-avatar user-avatar--${size} player-avatar`}
      style={{ backgroundColor: color || '#356149' }}
      aria-label={`${name}的球员头像`}
      data-player-avatar
    >
      {playerAvatarInitial(name)}
      {source && failedSource !== source && (
        <img
          src={source}
          alt=""
          loading="lazy"
          decoding="async"
          draggable={false}
          onError={() => setFailedSource(source)}
        />
      )}
    </span>
  )
  return playerId ? (
    <PlayerTrigger playerId={playerId} {...(tournamentId ? { tournamentId } : {})} name={name}>
      {avatar}
    </PlayerTrigger>
  ) : (
    avatar
  )
}
