import { Image, Text, View } from '@tarojs/components'
import { useEffect, useState } from 'react'
import { resolveMediaUrl, sizedMediaUrl } from '../../services/api'
import { formatMatchStatus } from '../../services/format'
import type { MatchSummary } from '../../types'
import './index.scss'

const DEMO_TEAM_CODES = [
  'DEMO-CS',
  'DEMO-MATH',
  'DEMO-PHYS',
  'DEMO-CHEM',
  'DEMO-BIO',
  'DEMO-GEO',
  'DEMO-PSYCH',
  'DEMO-PE',
  'DEMO-EDU',
  'DEMO-LIT',
  'DEMO-HIS',
  'DEMO-ECON',
  'DEMO-FL',
  'DEMO-LAW',
  'DEMO-JOUR',
  'DEMO-MUSIC',
  'DEMO-ART',
]

export function demoCrestUrl(teamCode: string): string | null {
  const index = DEMO_TEAM_CODES.indexOf(teamCode)
  return index < 0
    ? null
    : `/api/media/demo/crests/${String(index + 1).padStart(2, '0')}.png?v=club-20261018`
}

export function TeamCrest({
  teamCode = '',
  name,
  color,
  crestUrl,
  size = 'medium',
}: {
  teamCode?: string | null
  name: string
  color?: string
  crestUrl?: string | null
  size?: 'small' | 'medium' | 'large'
}) {
  const [imageFailed, setImageFailed] = useState(false)
  const rawCrest = crestUrl || (teamCode ? demoCrestUrl(teamCode) : null)
  const pixelWidth = size === 'large' ? 192 : size === 'medium' ? 128 : 96
  const resolvedCrest = sizedMediaUrl(rawCrest, { width: pixelWidth, quality: 82 })

  useEffect(() => {
    setImageFailed(false)
  }, [resolvedCrest])

  if (resolvedCrest && !imageFailed) {
    return (
      <Image
        className={`team-crest team-crest--${size}`}
        aria-label={`${name}队徽`}
        mode="aspectFit"
        src={resolvedCrest}
        onError={() => setImageFailed(true)}
      />
    )
  }

  return (
    <View
      className={`team-crest team-crest--fallback team-crest--${size}`}
      style={{ background: color || '#1b4a2f' }}
      aria-label={`${name}占位队徽`}
    >
      <Text className="team-crest__initial">{(name || '队').slice(0, 1)}</Text>
    </View>
  )
}

export function UserAvatar({
  name,
  avatarUrl,
  size = 'small',
}: {
  name: string
  avatarUrl?: string | null
  size?: 'small' | 'medium' | 'large'
}) {
  const [imageFailed, setImageFailed] = useState(false)
  const initial = (name || '球').trim().slice(0, 1).toUpperCase()
  const pixelWidth = size === 'large' ? 220 : size === 'medium' ? 140 : 96
  const resolvedAvatar =
    sizedMediaUrl(avatarUrl, { width: pixelWidth, quality: 80 }) || resolveMediaUrl(avatarUrl)

  useEffect(() => {
    setImageFailed(false)
  }, [resolvedAvatar])

  return (
    <View
      className={`user-avatar user-avatar--${size}`}
      style={{
        background:
          resolvedAvatar && !imageFailed ? 'transparent' : avatarGradient(name || initial),
      }}
    >
      {resolvedAvatar && !imageFailed ? (
        <Image
          className="user-avatar__image"
          aria-label={`${name}头像`}
          mode="aspectFill"
          src={resolvedAvatar}
          onError={() => setImageFailed(true)}
        />
      ) : (
        <Text className="user-avatar__initial">{initial}</Text>
      )}
    </View>
  )
}

export function MatchStatusBadge({ status }: { status: MatchSummary['status'] }) {
  const normalized = String(status || 'SCHEDULED').toLowerCase()
  const cssKey =
    normalized === 'live'
      ? 'live'
      : normalized === 'finished' || normalized === 'confirmed'
        ? 'finished'
        : normalized === 'postponed' || normalized === 'cancelled' || normalized === 'abandoned'
          ? 'postponed'
          : 'scheduled'

  return (
    <View className={`match-status match-status--${cssKey}`}>
      {cssKey === 'live' ? <View className="match-status__dot" /> : null}
      <Text>{formatMatchStatus(status)}</Text>
    </View>
  )
}

export function DataState({
  kind = 'loading',
  title,
  description,
  actionLabel = '重新加载',
  onRetry,
}: {
  kind?: 'loading' | 'error' | 'empty'
  title: string
  description?: string
  actionLabel?: string
  onRetry?: () => void
}) {
  return (
    <View className={`data-state data-state--${kind}`}>
      <View className="data-state__indicator" />
      <Text className="data-state__title">{title}</Text>
      {description ? <Text className="data-state__copy">{description}</Text> : null}
      {onRetry ? (
        <View className="data-state__button" onClick={onRetry}>
          <Text>{actionLabel}</Text>
        </View>
      ) : null}
    </View>
  )
}

function avatarGradient(seed: string): string {
  const palettes = [
    'linear-gradient(135deg, #1b4a2f, #2f7a4f)',
    'linear-gradient(135deg, #8c352d, #c56542)',
    'linear-gradient(135deg, #214e63, #3d7d96)',
    'linear-gradient(135deg, #5d4620, #a67c37)',
  ]
  let total = 0
  for (const ch of seed) {
    total += ch.charCodeAt(0)
  }
  return palettes[total % palettes.length]
}