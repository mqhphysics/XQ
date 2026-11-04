import { Button, Image, Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { NativeLoadingState } from './loading'
import { NativeFailureState } from './failure'

import { demoCrestUrl } from '../../features/product/demo-media'
import { resolveMediaUrl } from '../../features/product/product.repository'

import './index.scss'

interface DataStateProps {
  kind: 'loading' | 'error' | 'empty'
  title: string
  description?: string
  onRetry?: () => void | Promise<void>
}

export function DataState({ kind, title, description, onRetry }: DataStateProps) {
  if (kind === 'loading' && Taro.getEnv() === Taro.ENV_TYPE.WEAPP)
    return <NativeLoadingState title={title} {...(description ? { description } : {})} />
  if (kind === 'error' && Taro.getEnv() === Taro.ENV_TYPE.WEAPP)
    return (
      <NativeFailureState
        title={title}
        {...(description ? { description } : {})}
        {...(onRetry ? { onRetry } : {})}
      />
    )
  return (
    <View
      aria-live={kind === 'loading' ? 'polite' : 'assertive'}
      className={`data-state data-state--${kind}`}
    >
      <Text className="data-state__indicator" />
      <Text className="data-state__eyebrow">
        {kind === 'loading' ? 'LOADING' : kind === 'error' ? 'LOAD FAILED' : 'NO DATA'}
      </Text>
      <Text className="data-state__title">{title}</Text>
      {description && <Text className="data-state__copy">{description}</Text>}
      {onRetry && (
        <Button className="button button--primary data-state__button" onClick={onRetry}>
          重新加载
        </Button>
      )}
    </View>
  )
}

export function TeamMark({ teamCode, name }: { teamCode: string; name: string }) {
  const label =
    teamCode
      .replace(/[^A-Za-z0-9]/g, '')
      .slice(0, 2)
      .toUpperCase() || name.slice(0, 1)
  const tone = getTeamTone(teamCode || name)
  const crest = resolveMediaUrl(demoCrestUrl(teamCode))

  return crest ? (
    <Image className="team-mark" aria-label={`${name}队徽`} mode="aspectFit" src={crest} />
  ) : (
    <Text className={`team-mark team-mark--${tone}`}>{label}</Text>
  )
}

export function SectionHeading({
  eyebrow,
  title,
  action,
}: {
  eyebrow: string
  title: string
  action?: string
}) {
  return (
    <View className="section-heading">
      <View>
        <Text className="section-heading__eyebrow">{eyebrow}</Text>
        <Text className="section-heading__title">{title}</Text>
      </View>
      {action && <Text className="section-heading__action">{action}</Text>}
    </View>
  )
}

function getTeamTone(value: string): number {
  let hash = 0
  for (const character of value) {
    hash = (hash + character.charCodeAt(0)) % 4
  }
  return hash + 1
}
