import { useNativeRefreshTask } from '../../features/product/native-refresh.weapp'
import { Button, Image, Text, View } from '@tarojs/components'
import Taro, { getCurrentInstance } from '@tarojs/taro'
import { useCallback, useEffect, useRef, useState } from 'react'
import { PublicShell } from '../../components/public-shell'
import { DataState } from '../../components/public-ui'
import { UserAvatar } from '../../components/product-ui'
import { VerificationBadge } from '../../components/verification-badge'
import { ReactionHeart } from '../../components/reaction-heart'
import {
  productRepository,
  resolveMediaUrl,
  peekNativeProduct,
  ProductApiError,
} from '../../features/product/product.repository'
import { formatRelativeTime } from '../../features/product/product.format'
import { readSession } from '../../features/product/session'
import type { PostDetail } from '../../features/product/product.types'
import './index.weapp.scss'
import { useNativeRouteState } from '../../features/native-navigation/index.weapp'
import { PersonTrigger } from '../../components/person-trigger'
import { NativePostComments } from '../../components/native-social/post-comments.weapp'
import { PostTags } from '../../components/post-tags'
import { PostQuote } from '../../components/post-quote'
import { NativePostMenu } from '../../components/native-social/post-menu.weapp'
import {
  updatePostInteraction,
  readNativePostPreview,
  forgetNativePostPreview,
} from '../../features/product/post-navigation.weapp'

export default function NativePostScreen({
  postId: suppliedPost,
}: { postId?: string | undefined } = {}) {
  const postId = suppliedPost || getCurrentInstance().router?.params.postId || ''
  const [detail, setPost] = useNativeRouteState<PostDetail | null>(
    'post-data',
    peekNativeProduct<PostDetail>(`/public/posts/${encodeURIComponent(postId)}`) || null,
  )
  const post = detail || readNativePostPreview(postId)
  const [error, setError] = useState('')
  const [liking, setLiking] = useState(false)
  useEffect(() => {
    if (post) updatePostInteraction(post)
  }, [post?.id, post?.commentCount])
  useEffect(() => {
    const changed = (next: PostDetail, owner?: string) => {
      if (next.id !== postId || owner !== readSession()?.user.id) return
      setPost((current) =>
        current
          ? {
              ...current,
              likedByMe: next.likedByMe,
              likeCount: next.likeCount,
              ...(next.favoritedByMe !== undefined ? { favoritedByMe: next.favoritedByMe } : {}),
            }
          : current,
      )
    }
    Taro.eventCenter.on('xiaoqiu:native-post-interaction', changed)
    return () => {
      Taro.eventCenter.off('xiaoqiu:native-post-interaction', changed)
    }
  }, [postId, setPost])
  const sequence = useRef(0)
  const load = useCallback(async () => {
    const ticket = ++sequence.current
    try {
      if (!postId) throw new Error('缺少动态参数')
      const result = await productRepository.getPost(postId)
      if (ticket === sequence.current) {
        setPost(result)
        setError('')
      }
    } catch (reason) {
      if (reason instanceof ProductApiError && [401, 403, 404].includes(reason.statusCode)) {
        forgetNativePostPreview(postId)
        setPost(null)
      }
      if (ticket === sequence.current)
        setError(reason instanceof Error ? reason.message : '动态读取失败')
    }
  }, [postId])
  useNativeRefreshTask(load)
  useEffect(() => {
    void load()
    return () => {
      sequence.current++
    }
  }, [load])
  const like = async () => {
    if (!post || liking) return
    if (!readSession()) {
      void Taro.showToast({ title: '登录后可以点赞', icon: 'none' })
      return
    }
    setLiking(true)
    const token = readSession()?.accessToken
    try {
      const result = await productRepository.setLike(post.id, !post.likedByMe)
      if (token !== readSession()?.accessToken) return
      updatePostInteraction({ ...post, likedByMe: result.liked, likeCount: result.likeCount })
      setPost((current) =>
        current ? { ...current, likedByMe: result.liked, likeCount: result.likeCount } : null,
      )
    } catch (reason) {
      void Taro.showToast({
        title: reason instanceof Error ? reason.message : '点赞失败',
        icon: 'none',
      })
    } finally {
      setLiking(false)
    }
  }
  const images = [
    ...new Set(
      [...(post?.imageUrls ?? []), post?.imageUrl]
        .map(resolveMediaUrl)
        .filter((url): url is string => Boolean(url)),
    ),
  ]
  return (
    <PublicShell active="home" showBack>
      {!post && !error && <DataState kind="loading" title="正在读取动态" />}
      {error && (
        <DataState
          kind="error"
          title="动态暂不可用"
          description={error}
          onRetry={() => void load()}
        />
      )}
      {post && (
        <View className="native-post-detail">
          <View className="native-post-detail__author">
            <UserAvatar
              userId={post.author.id}
              tournamentId={post.tournamentId}
              avatarUrl={post.author.avatarUrl}
              name={post.author.displayName}
              size="small"
            />
            <View className="native-post-detail__identity">
              <View>
                <PersonTrigger
                  userId={post.author.id}
                  tournamentId={post.tournamentId}
                  name={post.author.displayName}
                >
                  <Text>{post.author.displayName}</Text>
                </PersonTrigger>
                <VerificationBadge
                  level={post.author.verificationLevel}
                  roles={post.author.roles}
                  official={post.author.official}
                  displayedKind={post.author.displayedBadgeKind}
                />
              </View>
              <Text>{formatRelativeTime(post.publishedAt)}</Text>
            </View>
          </View>
          {post.type === 'OFFICIAL' && (
            <Text className="native-post-detail__official">官方发布</Text>
          )}
          {post.title && <Text className="native-post-detail__title">{post.title}</Text>}
          <View className="native-post-detail__photos">
            {images.map((src) => (
              <Image
                key={src}
                mode="widthFix"
                src={src}
                onClick={() => void Taro.previewImage({ urls: images, current: src })}
              />
            ))}
          </View>
          <Text className="native-post-detail__body">{post.body}</Text>
          <PostTags tags={post.tags} tournamentId={post.tournamentId} />
          <PostQuote post={post.quotedPost || null} sourceId={post.quotedPostId} />
          <View className="native-post-detail__actions">
            <Button
              className={`native-post-detail__like${post.likedByMe ? ' is-active' : ''}`}
              disabled={liking}
              aria-label={post.likedByMe ? '取消点赞' : '点赞'}
              onClick={() => void like()}
            >
              <ReactionHeart active={post.likedByMe} />
              <Text>{post.likeCount}</Text>
            </Button>
            <NativePostMenu post={post} />
          </View>
          {detail ? (
            <NativePostComments
              post={detail}
              onChanged={(comment) =>
                setPost((current) =>
                  current
                    ? {
                        ...current,
                        commentCount:
                          current.commentCount +
                          (current.comments.some((item) => item.id === comment.id) ? 0 : 1),
                        comments: [
                          ...current.comments.filter((item) => item.id !== comment.id),
                          comment,
                        ],
                      }
                    : current,
                )
              }
            />
          ) : (
            <Text className="native-note">正在读取评论…</Text>
          )}
        </View>
      )}
    </PublicShell>
  )
}
