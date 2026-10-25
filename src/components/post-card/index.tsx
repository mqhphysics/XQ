import { Image, Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useState } from 'react'
import { resolveMediaUrl, sizedMediaUrl } from '../../services/api'
import { formatRelativeTime } from '../../services/format'
import type { PostSummary, PostTag } from '../../types'
import { IdentityBadge } from '../identity-badge'
import { UserAvatar } from '../team-crest'
import './index.scss'

export interface PostCardProps {
  post: PostSummary
  variant?: 'home' | 'feed'
  isRecommendedForTeam?: boolean
  onOpen?: (post: PostSummary) => void
  onLike?: (post: PostSummary) => void
  onTagClick?: (kind: PostTag['kind'], targetId?: string, label?: string) => void
}

export function PostCard({
  post,
  variant = 'home',
  isRecommendedForTeam = false,
  onOpen,
  onLike,
  onTagClick,
}: PostCardProps) {
  const [imageFailed, setImageFailed] = useState(false)

  if (post.deleted) return null

  const rawImages = post.imageUrls?.length
    ? post.imageUrls
    : post.imageUrl
      ? [post.imageUrl]
      : []

  const images = !imageFailed
    ? rawImages
        .filter((url) => !url.includes('/demo/album:'))
        .map((url) => resolveMediaUrl(url))
        .filter((url): url is string => Boolean(url))
    : []

  const coverImage = images[0] || null
  const isQuickReport =
    Boolean(post.title && (post.title.includes('战报') || post.title.includes('快报'))) ||
    (post.type === 'OFFICIAL' && Boolean(post.title))

  const handleOpen = () => {
    if (onOpen) {
      onOpen(post)
      return
    }
    void Taro.showToast({
      title: '帖子详情页将在后续阶段接入',
      icon: 'none',
    })
  }

  return (
    <View
      className={`post-card ${variant === 'home' ? 'post-card--home' : ''} ${coverImage ? 'post-card--with-image' : ''} ${isQuickReport ? 'post-card--report' : ''}`}
      onClick={handleOpen}
    >
      <View className="post-card__author">
        <UserAvatar
          name={post.author.displayName}
          avatarUrl={post.author.avatarUrl}
          size="small"
        />
        <View className="post-card__identity">
          <View className="post-card__name-row">
            <Text className="post-card__name">{post.author.displayName}</Text>
            <IdentityBadge
              level={post.author.verificationLevel}
              roles={post.author.roles}
              official={post.author.official}
              preferredKind={post.author.displayedBadgeKind}
            />
          </View>
          <View className="post-card__meta-row">
            <Text className="post-card__time">{formatRelativeTime(post.publishedAt)}</Text>
            {isRecommendedForTeam ? (
              <Text className="post-card__recommend-pill">主队相关</Text>
            ) : isQuickReport ? (
              <Text className="post-card__report-pill">赛后快报</Text>
            ) : null}
          </View>
        </View>
      </View>

      {coverImage ? (
        <View className="post-card__collage">
          <Image
            className="post-card__image"
            src={sizedMediaUrl(coverImage, { width: 480 }) || coverImage}
            mode="aspectFill"
            lazyLoad
            onError={() => setImageFailed(true)}
          />
          {images.length > 1 ? (
            <Text className="post-card__album-count">{images.length} 张</Text>
          ) : null}
        </View>
      ) : null}

      {post.title ? <Text className="post-card__title">{post.title}</Text> : null}
      <Text className="post-card__body">{post.body}</Text>

      {post.tags && post.tags.length > 0 ? (
        <View className="post-card__tags">
          {post.tags.slice(0, 2).map((tag) => (
            <View
              key={`${tag.kind}:${tag.targetId || tag.label}`}
              className="post-card__tag"
              onClick={(event) => {
                if (onTagClick) {
                  event.stopPropagation()
                  onTagClick(tag.kind, tag.targetId, tag.label)
                }
              }}
            >
              <Text className="post-card__tag-text">#{tag.label}</Text>
            </View>
          ))}
        </View>
      ) : null}

      {post.quotedPost && !post.quotedPost.deleted ? (
        <View className="post-card__quote">
          <Text className="post-card__quote-author">@{post.quotedPost.author.displayName}</Text>
          <Text className="post-card__quote-body">
            {post.quotedPost.title ? `${post.quotedPost.title}：` : ''}
            {post.quotedPost.body}
          </Text>
        </View>
      ) : null}

      <View className="post-card__actions">
        <View
          className={`post-card__action ${post.likedByMe ? 'post-card__action--active' : ''}`}
          onClick={(event) => {
            event.stopPropagation()
            onLike?.(post)
          }}
        >
          <View
            className={`post-card__heart ${post.likedByMe ? 'post-card__heart--active' : ''}`}
          />
          <Text className="post-card__action-count">{post.likeCount}</Text>
        </View>

        <View
          className="post-card__action"
          onClick={(event) => {
            event.stopPropagation()
            handleOpen()
          }}
        >
          <View className="post-card__comment-icon" />
          <Text className="post-card__action-count">{post.commentCount}</Text>
        </View>
      </View>
    </View>
  )
}