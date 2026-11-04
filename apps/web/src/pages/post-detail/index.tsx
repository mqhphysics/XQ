import { Button, Image, Text, Textarea, View } from '@tarojs/components'
import Taro, { getCurrentInstance } from '@tarojs/taro'
import { useCallback, useEffect, useState } from 'react'

import { PublicShell } from '../../components/public-shell'
import { openMessaging } from '../../components/messaging-drawer'
import { ReportModal } from '../../components/report-modal'
import { DataState } from '../../components/public-ui'
import { UserAvatar } from '../../components/product-ui'
import { PersonTrigger } from '../../components/person-trigger'
import { formatRelativeTime, verificationLabel } from '../../features/product/product.format'
import {
  createClientActionId,
  productRepository,
  resolveMediaUrl,
} from '../../features/product/product.repository'
import { readSession } from '../../features/product/session'
import type {
  PostComment,
  PostDetail,
  ReportTargetType,
} from '../../features/product/product.types'

import './index.scss'

type PageState =
  | { phase: 'loading' }
  | { phase: 'failed'; message: string }
  | { phase: 'ready'; post: PostDetail; tournamentId: string }

export default function PostDetailPage() {
  const postId = getCurrentInstance().router?.params.postId ?? ''
  const [state, setState] = useState<PageState>({ phase: 'loading' })
  const [comment, setComment] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [pendingComment, setPendingComment] = useState<{ id: string; signature: string } | null>(
    null,
  )
  const [replyTo, setReplyTo] = useState<PostComment | null>(null)
  const [report, setReport] = useState<{
    type: ReportTargetType
    id: string
    title: string
  } | null>(null)

  const load = useCallback(async () => {
    if (!postId) {
      setState({ phase: 'failed', message: '缺少动态参数。' })
      return
    }
    setState({ phase: 'loading' })
    try {
      const [post, home] = await Promise.all([
        productRepository.getPost(postId),
        productRepository.getHome(),
      ])
      setState({ phase: 'ready', post, tournamentId: home.tournament.id })
    } catch (error) {
      setState({
        phase: 'failed',
        message: error instanceof Error ? error.message : '动态加载失败。',
      })
    }
  }, [postId])

  useEffect(() => {
    void load()
  }, [load])

  const toggleLike = async () => {
    if (state.phase !== 'ready') return
    if (!readSession()) {
      await Taro.showToast({ title: '登录后可以点赞', icon: 'none' })
      await Taro.reLaunch({ url: '/pages/login/index' })
      return
    }
    try {
      const result = await productRepository.setLike(state.post.id, !state.post.likedByMe)
      setState({
        ...state,
        post: { ...state.post, likedByMe: result.liked, likeCount: result.likeCount },
      })
    } catch (error) {
      await Taro.showToast({
        title: error instanceof Error ? error.message : '操作失败',
        icon: 'none',
      })
    }
  }

  const submitComment = async () => {
    if (state.phase !== 'ready' || comment.trim().length < 2 || submitting) return
    if (!readSession()) {
      await Taro.showToast({ title: '登录后可以评论', icon: 'none' })
      await Taro.reLaunch({ url: '/pages/login/index' })
      return
    }
    setSubmitting(true)
    const signature = `${state.post.id}\n${replyTo?.id ?? ''}\n${comment.trim()}`
    const request =
      pendingComment?.signature === signature
        ? pendingComment
        : { id: createClientActionId('comment'), signature }
    setPendingComment(request)
    try {
      const created = await productRepository.createComment(
        state.post.id,
        comment.trim(),
        request.id,
        replyTo?.id,
      )
      setState({
        ...state,
        post: {
          ...state.post,
          commentCount: state.post.commentCount + 1,
          comments: [...state.post.comments, created],
        },
      })
      setComment('')
      setReplyTo(null)
      setPendingComment(null)
      await Taro.showToast({ title: '评论已发布', icon: 'success' })
    } catch (error) {
      await Taro.showToast({
        title: error instanceof Error ? error.message : '评论失败',
        icon: 'none',
      })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <PublicShell
      active="home"
      showBack
      tournamentId={state.phase === 'ready' ? state.tournamentId : undefined}
    >
      {state.phase === 'loading' && <DataState kind="loading" title="正在读取动态" />}
      {state.phase === 'failed' && (
        <DataState
          kind="error"
          title="动态不可用"
          description={state.message}
          onRetry={() => void load()}
        />
      )}
      {state.phase === 'ready' && (
        <View className="post-detail-layout">
          <View
            className={
              'post-detail ' + (state.post.type === 'OFFICIAL' ? 'post-detail--official' : '')
            }
          >
            <View className="post-detail__author">
              <UserAvatar
                avatarUrl={state.post.author.avatarUrl}
                name={state.post.author.displayName}
                userId={state.post.author.id}
              />
              <View className="post-detail__author-copy">
                <Text className="post-detail__author-label">动态作者</Text>
                <View className="post-detail__author-row">
                  <PersonTrigger userId={state.post.author.id} name={state.post.author.displayName}><Text>{state.post.author.displayName}</Text></PersonTrigger>
                  <Text>{verificationLabel(state.post.author.verificationLevel)}</Text>
                </View>
                <Text className="post-detail__time">
                  {formatRelativeTime(state.post.publishedAt)}
                </Text>
              </View>
            </View>
            {state.post.type === 'OFFICIAL' && <Text className="post-detail__type">官方发布</Text>}
            {state.post.title && <Text className="post-detail__title">{state.post.title}</Text>}
            {state.post.imageUrl && (
              <Image
                className="post-detail__image"
                mode="widthFix"
                src={resolveMediaUrl(state.post.imageUrl) ?? ''}
                onClick={() => {
                  const source = resolveMediaUrl(state.post.imageUrl)
                  if (source) void Taro.previewImage({ urls: [source], current: source })
                }}
              />
            )}
            <Text className="post-detail__body">{state.post.body}</Text>
            <View className="post-detail__actions">
              <Button
                className={
                  'post-detail__like ' + (state.post.likedByMe ? 'post-detail__liked' : '')
                }
                onClick={() => void toggleLike()}
              >
                <Text className="post-detail__action-icon">{state.post.likedByMe ? '♥' : '♡'}</Text>
                <Text>
                  {state.post.likedByMe ? '已赞' : '点赞'} {state.post.likeCount}
                </Text>
              </Button>
              <View className="post-detail__comment-count">
                <Text className="post-detail__action-icon">◌</Text>
                <Text>评论 {state.post.commentCount}</Text>
              </View>
              {readSession() && state.post.author.messageable && (
                <Button
                  className="post-detail__secondary-action"
                  onClick={() =>
                    openMessaging({
                      id: state.post.author.id,
                      displayName: state.post.author.displayName,
                      avatarUrl: state.post.author.avatarUrl,
                    })
                  }
                >
                  私聊作者
                </Button>
              )}
              {readSession() && (
                <Button
                  className="post-detail__secondary-action"
                  onClick={() =>
                    setReport({ type: 'POST', id: state.post.id, title: '投诉这条动态' })
                  }
                >
                  投诉
                </Button>
              )}
            </View>
          </View>

          <View className="comment-panel">
            <Text className="comment-panel__title">评论</Text>
            {readSession() ? (
              <View className="comment-composer">
                <Textarea
                  className="comment-composer__input"
                  maxlength={300}
                  placeholder={
                    replyTo
                      ? `回复 ${replyTo.author.displayName}`
                      : '写下你的看法，也可以输入常用表情符号'
                  }
                  value={comment}
                  onInput={(event) => setComment(event.detail.value)}
                />
                {replyTo && (
                  <Button
                    className="comment-composer__cancel-reply"
                    onClick={() => setReplyTo(null)}
                  >
                    取消回复
                  </Button>
                )}
                <Button
                  className="button button--primary comment-composer__submit"
                  disabled={comment.trim().length < 2 || submitting}
                  loading={submitting}
                  onClick={() => void submitComment()}
                >
                  <Text className="comment-composer__submit-icon">↗</Text>
                  <Text>发布</Text>
                </Button>
              </View>
            ) : (
              <Button
                className="comment-composer__login"
                onClick={() => void Taro.reLaunch({ url: '/pages/login/index' })}
              >
                <Text className="post-detail__action-icon">◌</Text>
                <Text>登录后参与评论</Text>
              </Button>
            )}
            <View className="comment-list">
              {state.post.comments.length === 0 && (
                <Text className="comment-list__empty">还没有评论</Text>
              )}
              {state.post.comments.map((item) => (
                <View className="comment-item" key={item.id}>
                  <UserAvatar
                    avatarUrl={item.author.avatarUrl}
                    name={item.author.displayName}
                    userId={item.author.id}
                    size="small"
                  />
                  <View className="comment-item__copy">
                    <View>
                      <PersonTrigger userId={item.author.id} name={item.author.displayName}><Text>{item.author.displayName}</Text></PersonTrigger>
                      <Text>{formatRelativeTime(item.createdAt)}</Text>
                    </View>
                    <Text>{item.body}</Text>
                    {item.parentCommentId && (
                      <Text className="comment-item__reply-label">回复评论</Text>
                    )}
                    {readSession() && (
                      <View className="comment-item__actions">
                        <Button onClick={() => setReplyTo(item)}>回复</Button>
                        {item.author.messageable && (
                          <Button
                            onClick={() =>
                              openMessaging({
                                id: item.author.id,
                                displayName: item.author.displayName,
                                avatarUrl: item.author.avatarUrl,
                              })
                            }
                          >
                            私聊
                          </Button>
                        )}
                        <Button
                          onClick={() =>
                            setReport({ type: 'COMMENT', id: item.id, title: '投诉这条评论' })
                          }
                        >
                          投诉
                        </Button>
                      </View>
                    )}
                  </View>
                </View>
              ))}
            </View>
          </View>
          {report && (
            <ReportModal
              targetId={report.id}
              targetType={report.type}
              title={report.title}
              onClose={() => setReport(null)}
            />
          )}
        </View>
      )}
    </PublicShell>
  )
}
