import { Button, Image, Text, View } from '@tarojs/components'
import type { BaseEventOrig } from '@tarojs/components/types/common'
import Taro from '@tarojs/taro'
import { useRef, useState } from 'react'

import {
  formatDate,
  formatRelativeTime,
  formatTime,
  matchStatusLabel,
  matchStatusTone,
} from '../../features/product/product.format'
import type { MatchSummary, PostSummary, TeamSummary } from '../../features/product/product.types'
import { demoCrestUrl } from '../../features/product/demo-media'
import {
  productRepository,
  resolveMediaUrl,
  sizedMediaUrl,
} from '../../features/product/product.repository'
import {
  openPost,
  updatePostInteraction,
  usePostInteraction,
} from '../../features/product/post-navigation'
import { readSession } from '../../features/product/session'
import { openMatch } from '../../features/product/match-navigation'
import { openDesktopTeam, openTeamCrest } from '../../features/product/team-navigation'
import { PostTags } from '../post-tags'
import { PostQuote } from './post-quote-view'
import { PlayerTrigger } from '../player-trigger'
import { VerificationBadge } from '../verification-badge'
import { PersonTrigger } from '../person-trigger'
import { ReactionHeart } from '../reaction-heart'
import { TeamTrigger } from '../team-trigger'
import { NativeMatchRow } from '../native-match-row'

import './index.scss'
import { TbdCrest, TBD_LABEL } from '../tbd-team'
import { eventOnTeam } from '../../features/product/team-hit'
import { NativePostMenu } from './post-menu'

export function TeamCrest({
  team,
  size = 'medium',
  interactive = true,
  eager = false,
}: {
  team: TeamSummary | null
  size?: 'small' | 'medium' | 'large'
  interactive?: boolean
  eager?: boolean
}) {
  if (!team) return <TbdCrest size={size} />
  const label = team.shortName.slice(0, 2)
  const crestPath = team?.crestUrl?.includes('/api/media/demo/crests/')
    ? demoCrestUrl(team.teamCode)
    : (team?.crestUrl ?? (team ? demoCrestUrl(team.teamCode) : null))
  const box = crestBox[size]
  const source = sizedMediaUrl(resolveMediaUrl(crestPath), crestRequest[size])
  const crest = source ? (
    <Image
      aria-label={`${team?.name ?? '球队'}队徽`}
      className={`team-crest team-crest--${size} ${interactive ? 'team-crest--interactive' : ''}`}
      mode="aspectFit"
      src={source}
      {...webImageProps(box, box, eager)}
      onClick={(event) => {
        if (interactive && team && openTeamCrest(event, team.id)) event.stopPropagation()
      }}
    />
  ) : (
    <Text
      aria-label={team ? `${team.name}队徽待上传` : '球队待定'}
      className={`team-crest team-crest--${size} team-crest--fallback`}
      style={{ backgroundColor: team?.primaryColor ?? '#8a948c' }}
      onClick={(event) => {
        if (interactive && team && openTeamCrest(event, team.id)) event.stopPropagation()
      }}
    >
      {label}
    </Text>
  )
  return interactive && team ? (
    <TeamTrigger teamId={team.id} name={team.name}>
      {crest}
    </TeamTrigger>
  ) : (
    crest
  )
}

export function TeamName({
  team,
  tournamentId,
  className = '',
  fallback = TBD_LABEL,
}: {
  team: TeamSummary | null
  tournamentId?: string
  className?: string
  fallback?: string
}) {
  return team ? (
    <TeamTrigger teamId={team.id} name={team.name} tournamentId={tournamentId}>
      <Text
        className={`${className} ${team ? 'team-name-link' : ''}`}
        onClick={(event) => {
          const target = event.currentTarget as unknown as Element | null
          const point = event as unknown as { clientX: number; clientY: number; detail?: number }
          if (target && !eventOnTeam(target, point)) return
          if (team && openDesktopTeam(team.id, tournamentId)) event.stopPropagation()
        }}
      >
        {team?.name ?? fallback}
      </Text>
    </TeamTrigger>
  ) : (
    <Text className={className}>{fallback}</Text>
  )
}

export function UserAvatar({
  name,
  color,
  avatarUrl,
  size = 'medium',
  playerId,
  tournamentId,
  userId,
}: {
  name: string
  color?: string | null
  avatarUrl?: string | null
  size?: 'small' | 'medium' | 'large'
  playerId?: string | undefined
  tournamentId?: string | undefined
  userId?: string | undefined
}) {
  const box = avatarBox[size]
  const source = sizedMediaUrl(resolveMediaUrl(avatarUrl), avatarRequest[size])
  const avatar =
    Taro.getEnv() === Taro.ENV_TYPE.WEAPP ? (
      <View
        className={`user-avatar user-avatar--${size} native-user-avatar`}
        style={{ backgroundColor: source ? '#d7e0d8' : (color ?? avatarColor(name)) }}
        aria-label={`${name}的头像`}
      >
        {source ? (
          <Image
            className="native-user-avatar__image"
            src={source}
            mode="aspectFill"
            style={{ display: 'block', width: '100%', height: '100%', flex: 'none' }}
          />
        ) : (
          <Text className="native-user-avatar__initial">{Array.from(name.trim())[0] || '球'}</Text>
        )}
      </View>
    ) : source ? (
      <Image
        aria-label={`${name}的头像`}
        className={`user-avatar user-avatar--${size}`}
        mode="scaleToFill"
        src={source}
        {...webImageProps(box, box)}
      />
    ) : (
      <Text
        className={`user-avatar user-avatar--${size}`}
        style={{ backgroundColor: color ?? avatarColor(name) }}
      >
        {name.slice(0, 1)}
      </Text>
    )
  return userId ? (
    <PersonTrigger userId={userId} tournamentId={tournamentId} name={name}>
      {avatar}
    </PersonTrigger>
  ) : playerId ? (
    <PlayerTrigger playerId={playerId} {...(tournamentId ? { tournamentId } : {})} name={name}>
      {avatar}
    </PlayerTrigger>
  ) : (
    avatar
  )
}

export function MatchStatus({ status }: { status: MatchSummary['status'] }) {
  return (
    <Text className={`match-status match-status--${matchStatusTone(status)}`}>
      {status === 'LIVE' && <Text className="match-status__dot" />}
      {matchStatusLabel(status)}
    </Text>
  )
}

export function MatchCard({ match, onClick }: { match: MatchSummary; onClick?: () => void }) {
  if (Taro.getEnv() === Taro.ENV_TYPE.WEAPP)
    return <NativeMatchRow match={match} onClick={onClick} showDate />
  const hasScore = match.homeScore !== null && match.awayScore !== null
  return (
    <View
      className="product-match-card"
      onClick={
        onClick ??
        (() => {
          void openMatch(match.id, match.tournamentId)
        })
      }
    >
      <View className="product-match-card__head">
        <Text className="product-match-card__meta">
          {match.title} · {formatDate(match.scheduledStartAt)} {formatTime(match.scheduledStartAt)}
        </Text>
        <MatchStatus status={match.status} />
      </View>
      <View className="product-match-card__team">
        <TeamCrest team={match.homeTeam} size="small" />
        <TeamName
          className="product-match-card__name"
          team={match.homeTeam}
          tournamentId={match.tournamentId}
          fallback={TBD_LABEL}
        />
        <Text className="product-match-card__score">{hasScore ? match.homeScore : '-'}</Text>
      </View>
      <View className="product-match-card__team">
        <TeamCrest team={match.awayTeam} size="small" />
        <TeamName
          className="product-match-card__name"
          team={match.awayTeam}
          tournamentId={match.tournamentId}
          fallback={TBD_LABEL}
        />
        <Text className="product-match-card__score">{hasScore ? match.awayScore : '-'}</Text>
      </View>
      <Text className="product-match-card__venue">{match.venue?.name ?? '场地待定'}</Text>
    </View>
  )
}

export function PostCard({
  post: originalPost,
  onOpen,
  onLike,
  onMessageAuthor,
  variant,
}: {
  post: PostSummary
  onOpen: () => void
  onLike?: () => void
  onMessageAuthor?: () => void
  variant?: 'home'
}) {
  const post = usePostInteraction(originalPost)
  const open = () => {
    if (Taro.getEnv() === Taro.ENV_TYPE.WEB && window.matchMedia('(min-width: 721px)').matches)
      void openPost(post.id)
    else onOpen()
  }
  const [imageFailed, setImageFailed] = useState(false)
  const likePending = useRef(false)
  const images =
    (variant === 'home' || Taro.getEnv() === Taro.ENV_TYPE.WEAPP) && !imageFailed
      ? (post.imageUrls?.length ? post.imageUrls : post.imageUrl ? [post.imageUrl] : [])
          .filter((url) => !url.includes('/demo/album:'))
          .map((url) => resolveMediaUrl(url))
          .filter((url): url is string => Boolean(url))
      : []
  const previewImages =
    Taro.getEnv() === Taro.ENV_TYPE.WEAPP ? images.slice(0, 1) : images.slice(0, 4)
  const stopAndLike = (event: BaseEventOrig) => {
    event.stopPropagation()
    if (Taro.getEnv() !== Taro.ENV_TYPE.WEB || !window.matchMedia('(min-width: 721px)').matches) {
      onLike?.()
      return
    }
    if (likePending.current) return
    if (!readSession()) {
      void Taro.showToast({ title: '登录后可以点赞', icon: 'none' })
      return
    }
    likePending.current = true
    void productRepository
      .setLike(post.id, !post.likedByMe)
      .then((result) => {
        updatePostInteraction({ ...post, likedByMe: result.liked, likeCount: result.likeCount })
      })
      .catch((issue) => {
        void Taro.showToast({
          title: issue instanceof Error ? issue.message : '点赞失败，请重试',
          icon: 'none',
        })
      })
      .finally(() => {
        likePending.current = false
      })
  }
  const stopAndMessage = (event: BaseEventOrig) => {
    if (!onMessageAuthor) return
    event.stopPropagation()
    onMessageAuthor()
  }
  if (post.deleted) return null
  return (
    <View
      className={`post-card ${variant === 'home' ? 'post-card--home' : ''} ${images.length > 0 ? 'post-card--with-image' : ''}`}
      onClick={open}
    >
      <View className="post-card__author">
        <UserAvatar
          avatarUrl={post.author.avatarUrl}
          name={post.author.displayName}
          userId={post.author.id}
          tournamentId={post.tournamentId}
          size="small"
        />
        <View className="post-card__identity">
          <View className="post-card__name-row">
            <PersonTrigger
              userId={post.author.id}
              tournamentId={post.tournamentId}
              name={post.author.displayName}
            >
              <Text className="post-card__name">{post.author.displayName}</Text>
            </PersonTrigger>
            <VerificationBadge
              level={post.author.verificationLevel}
              roles={post.author.roles}
              official={post.author.official}
              displayedKind={post.author.displayedBadgeKind}
              userId={post.author.id}
              className="post-card__verified"
            />
          </View>
          <Text className="post-card__time">{formatRelativeTime(post.publishedAt)}</Text>
        </View>
        {onMessageAuthor &&
          !(
            Taro.getEnv() === Taro.ENV_TYPE.WEB && window.matchMedia('(min-width: 721px)').matches
          ) && (
            <Button
              aria-label={`私聊${post.author.displayName}`}
              className="post-card__message-author"
              onClick={stopAndMessage}
            >
              私聊
            </Button>
          )}
      </View>
      {images.length > 0 && (
        <View className={`post-card__collage post-card__collage--${previewImages.length}`}>
          {previewImages.map((url) => (
            <Image
              key={url}
              aria-label={post.title ?? '动态配图'}
              className="post-card__image"
              {...(Taro.getEnv() === Taro.ENV_TYPE.WEAPP ? { lazyLoad: true } : {})}
              mode="aspectFill"
              src={sizedMediaUrl(url, 480) ?? url}
              {...webImageProps(480, 320)}
              onError={() => setImageFailed(true)}
              onClick={(event) => {
                event.stopPropagation()
                if (Taro.getEnv() === Taro.ENV_TYPE.WEAPP) open()
                else if (
                  Taro.getEnv() === Taro.ENV_TYPE.WEB &&
                  window.matchMedia('(min-width: 721px)').matches
                )
                  open()
                else void Taro.previewImage({ urls: images, current: url })
              }}
            />
          ))}
          {images.length > 1 && <Text className="post-card__album-count">{images.length} 张</Text>}
        </View>
      )}
      {post.title && <Text className="post-card__title">{post.title}</Text>}
      <Text className="post-card__body">{post.body}</Text>
      <PostTags tags={post.tags} tournamentId={post.tournamentId} />
      {(Taro.getEnv() === Taro.ENV_TYPE.WEAPP ||
        (Taro.getEnv() === Taro.ENV_TYPE.WEB &&
          window.matchMedia('(min-width: 721px)').matches)) && (
        <PostQuote post={post.quotedPost ?? null} sourceId={post.quotedPostId} />
      )}
      <View className="post-card__actions">
        <Button
          aria-label={`${post.likedByMe ? '取消点赞' : '点赞'}，当前 ${post.likeCount} 赞`}
          aria-pressed={post.likedByMe}
          className={`post-card__action ${post.likedByMe ? 'post-card__action--active' : ''}`}
          disabled={
            !onLike &&
            Taro.getEnv() !== Taro.ENV_TYPE.WEAPP &&
            !(
              Taro.getEnv() === Taro.ENV_TYPE.WEB && window.matchMedia('(min-width: 721px)').matches
            )
          }
          onClick={stopAndLike}
        >
          <ReactionHeart active={post.likedByMe} />
          <Text>{post.likeCount}</Text>
        </Button>
        {Taro.getEnv() === Taro.ENV_TYPE.WEAPP ? (
          <Button
            className="post-card__action native-post-comment-button"
            aria-label={`评论 ${post.commentCount} 条`}
            onClick={(event) => {
              event.stopPropagation()
              open()
            }}
          >
            <View className="post-card__comment-icon" />
            <Text>{post.commentCount}</Text>
          </Button>
        ) : (
          <Text
            aria-label={`评论 ${post.commentCount} 条`}
            className="post-card__action post-card__action--plain"
          >
            <Text className="post-card__comment-icon" />
            <Text>{post.commentCount}</Text>
          </Text>
        )}
        {Taro.getEnv() === Taro.ENV_TYPE.WEAPP ? (
          <NativePostMenu post={post} />
        ) : (
          <Text className="post-card__open">查看详情</Text>
        )}
      </View>
    </View>
  )
}

export function ProductSection({
  kicker,
  title,
  note,
  actionLabel,
  onAction,
}: {
  kicker: string
  title: string
  note?: string
  actionLabel?: string
  onAction?: () => void
}) {
  return (
    <View className="product-section-heading">
      <View>
        <Text className="product-section-heading__kicker">{kicker}</Text>
        <Text className="product-section-heading__title">{title}</Text>
      </View>
      {onAction && actionLabel ? (
        <Button className="product-section-heading__action" onClick={onAction}>
          {actionLabel} →
        </Button>
      ) : (
        note && <Text className="product-section-heading__note">{note}</Text>
      )}
    </View>
  )
}

const crestBox = { small: 34, medium: 50, large: 72 } as const
const crestRequest = { small: 96, medium: 128, large: 256 } as const
const avatarBox = { small: 36, medium: 50, large: 76 } as const
const avatarRequest = { small: 96, medium: 128, large: 256 } as const

function webImageProps(width: number, height: number, eager = false) {
  if (Taro.getEnv() !== Taro.ENV_TYPE.WEB) return {}
  return {
    lazyLoad: !eager,
    imgProps: {
      loading: (eager ? 'eager' : 'lazy') as 'eager' | 'lazy',
      width,
      height,
      decoding: 'async' as const,
    },
  }
}

function avatarColor(name: string): string {
  const colors = ['#1f6b45', '#9b4034', '#2f648f', '#6f4a91', '#a36b20']
  let hash = 0
  for (const character of name) hash += character.charCodeAt(0)
  return colors[hash % colors.length] ?? colors[0]!
}
