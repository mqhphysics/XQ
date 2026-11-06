import { Button, Image, Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useRef, useState } from 'react'
import type { PostComment, PostDetail } from '../../features/product/product.types'
import {
  createClientActionId,
  productRepository,
  resolveMediaUrl,
} from '../../features/product/product.repository'
import { formatRelativeTime } from '../../features/product/product.format'
import { readSession } from '../../features/product/session'
import { nativeWriteEnabled } from '../../features/native-social/config.weapp'
import {
  clearNativeDraft,
  nativeSocialApi,
  readNativeDraft,
  saveNativeDraft,
  type NativePostComment,
} from '../../features/native-social/runtime.weapp'
import { useNativeLeaveProtection } from '../../features/native-navigation/leave-guard.weapp'
import { NativeCommentComposer } from './comment-composer.weapp'
import {
  chooseNativePostImages,
  copyNativeDraftImage,
  nativeImageData,
  releaseNativePostImages,
  type NativeDraftImage,
} from '../../features/native-social/images.weapp'
import { UserAvatar } from '../product-ui'
import { PersonTrigger } from '../person-trigger'
import { ReportModal } from '../report-modal'
interface CommentDraft {
  body: string
  reply: { id: string; name: string } | null
  repost: boolean
  id: string
  signature: string
  images: NativeDraftImage[]
}
const blank = (): CommentDraft => ({
  body: '',
  reply: null,
  repost: false,
  id: '',
  signature: '',
  images: [],
})
export function NativePostComments({
  post,
  onChanged,
}: {
  post: PostDetail
  onChanged: (comment: PostComment) => void
}) {
  const scope = `comment:${post.id}`
  const [draft, setDraft] = useState(() => ({ ...blank(), ...readNativeDraft(scope, blank()) })),
    draftRef = useRef(draft)
  draftRef.current = draft
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [report, setReport] = useState<PostComment | null>(null)
  const [editorOpen, setEditorOpen] = useState(false),
    [processing, setProcessing] = useState(false)
  const [likes, setLikes] = useState<Record<string, { count: number; liked: boolean }>>({})
  const lock = useRef(false),
    imageLock = useRef(false),
    likeLocks = useRef(new Set<string>())
  const update = (patch: Partial<CommentDraft>) => {
    const next = { ...draftRef.current, ...patch }
    draftRef.current = next
    setDraft(next)
    saveNativeDraft(scope, next)
  }
  const clear = () => {
    void releaseNativePostImages(draftRef.current.images)
    const next = blank()
    draftRef.current = next
    setDraft(next)
    clearNativeDraft(scope)
  }
  useNativeLeaveProtection(
    Boolean(draft.body.trim() || draft.images.length),
    busy || processing,
    clear,
    true,
  )
  const addImages = async (saved?: NativeDraftImage) => {
    if (imageLock.current || lock.current) return
    if (draftRef.current.images.length >= 3) throw new Error('每条评论最多3张图片')
    imageLock.current = true
    setProcessing(true)
    try {
      const chosen = saved
        ? [await copyNativeDraftImage(saved)]
        : await chooseNativePostImages(3 - draftRef.current.images.length)
      update({ images: [...draftRef.current.images, ...chosen] })
      setError('')
    } catch (issue) {
      const message =
        issue instanceof Error
          ? issue.message
          : (issue as { errMsg?: string })?.errMsg || '图片处理失败'
      if (!/cancel/i.test(message)) setError(message)
    } finally {
      imageLock.current = false
      setProcessing(false)
    }
  }
  const send = async () => {
    if (
      lock.current ||
      imageLock.current ||
      (!draftRef.current.body.trim() && !draftRef.current.images.length)
    )
      return
    lock.current = true
    setBusy(true)
    setError('')
    const value = draftRef.current
    const token = readSession()?.accessToken
    const signature = JSON.stringify([
      post.id,
      value.body.trim(),
      value.reply?.id,
      value.repost,
      value.images.map((image) => image.path),
    ])
    const id =
      value.signature === signature && value.id ? value.id : createClientActionId('native-comment')
    update({ id, signature })
    try {
      const imageData = await Promise.all(value.images.map(nativeImageData))
      if (token !== readSession()?.accessToken) throw new Error('账号已切换，请重新打开页面')
      const comment = await nativeSocialApi.commentPost(
        post.id,
        value.body.trim(),
        id,
        value.reply?.id,
        value.repost && nativeWriteEnabled('publishPosts'),
        imageData,
      )
      onChanged(comment)
      if (comment.repostedPost)
        Taro.eventCenter.trigger('xiaoqiu:native-post-published', comment.repostedPost)
      clear()
      setEditorOpen(false)
      await Taro.hideKeyboard().catch(() => {})
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : '评论未发出，文字已保留')
    } finally {
      lock.current = false
      setBusy(false)
    }
  }
  const like = async (comment: PostComment) => {
    if (!readSession() || likeLocks.current.has(comment.id)) return
    likeLocks.current.add(comment.id)
    try {
      const reply = await productRepository.setCommentLike(
        post.id,
        comment.id,
        !(likes[comment.id]?.liked ?? comment.likedByMe),
      )
      setLikes((current) => ({
        ...current,
        [comment.id]: { count: reply.likeCount, liked: reply.liked },
      }))
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : '点赞失败')
    } finally {
      likeLocks.current.delete(comment.id)
    }
  }
  return (
    <View className="native-social-comments">
      <Text className="native-social-label">评论 {post.commentCount}</Text>
      {nativeWriteEnabled('postComments') && readSession() && (
        <>
          {draft.reply && (
            <View className="native-comment-replying">
              <Text>回复 @{draft.reply.name}</Text>
              <Button
                className="native-button native-button--quiet"
                onClick={() => update({ reply: null })}
              >
                取消回复
              </Button>
            </View>
          )}
          <NativeCommentComposer
            value={draft.body}
            onChange={(body) => update({ body })}
            onSend={() => void send()}
            busy={busy}
            placeholder={draft.reply ? `回复 @${draft.reply.name}…` : '说说你的想法…'}
            images={draft.images}
            onPhotos={() => void addImages()}
            onSavedImage={(image) => addImages(image)}
            onRemoveImage={(index) => {
              const image = draftRef.current.images[index]
              update({ images: draftRef.current.images.filter((_, i) => i !== index) })
              if (image) void releaseNativePostImages([image])
            }}
            open={editorOpen}
            onOpenChange={setEditorOpen}
            repost={draft.repost}
            onRepostChange={(repost) => update({ repost })}
            canRepost={nativeWriteEnabled('publishPosts')}
            processing={processing}
            error={error}
          />
        </>
      )}
      {error && <Text className="native-social-error">{error}</Text>}
      {post.comments.map((comment) => (
        <View className="native-social-comment" key={comment.id}>
          <View className="native-social-comment__avatar">
            <UserAvatar
              name={comment.author.displayName}
              avatarUrl={comment.author.avatarUrl}
              userId={comment.author.id}
              size="small"
            />
          </View>
          <View className="native-social-comment__content">
            <PersonTrigger userId={comment.author.id} name={comment.author.displayName}>
              <Text className="native-social-comment__name">{comment.author.displayName}</Text>
            </PersonTrigger>
            {comment.parentCommentId && (
              <Text className="native-note">
                回复 @
                {post.comments.find((item) => item.id === comment.parentCommentId)?.author
                  .displayName || '评论'}
              </Text>
            )}
            <Text className="native-social-comment__body" selectable>
              {comment.body}
            </Text>
            {Boolean((comment as NativePostComment).imageUrls?.length) && (
              <View className="native-social-comment__images">
                {(comment as NativePostComment).imageUrls!.map((url) => (
                  <Image
                    key={url}
                    src={resolveMediaUrl(url) || url}
                    mode="aspectFit"
                    lazyLoad
                    onClick={() =>
                      void Taro.previewImage({
                        current: resolveMediaUrl(url) || url,
                        urls: (comment as NativePostComment).imageUrls!.map(
                          (value) => resolveMediaUrl(value) || value,
                        ),
                      })
                    }
                  />
                ))}
              </View>
            )}
            <Text className="native-note">{formatRelativeTime(comment.createdAt)}</Text>
            <View className="native-social-comment__tools">
              <Button
                className="native-button native-button--quiet"
                onClick={() => void like(comment)}
              >
                {(likes[comment.id]?.liked ?? comment.likedByMe) ? '已赞' : '赞'}{' '}
                {likes[comment.id]?.count ?? comment.likeCount ?? 0}
              </Button>
              {nativeWriteEnabled('postComments') && readSession() && (
                <Button
                  className="native-button native-button--quiet"
                  onClick={() => {
                    update({ reply: { id: comment.id, name: comment.author.displayName } })
                    setEditorOpen(true)
                  }}
                >
                  回复
                </Button>
              )}
              {readSession() && (
                <Button
                  className="native-button native-button--quiet"
                  onClick={() => setReport(comment)}
                >
                  举报
                </Button>
              )}
            </View>
          </View>
        </View>
      ))}
      {!post.comments.length && <Text className="native-note">暂无评论</Text>}
      {report && (
        <ReportModal
          targetType="COMMENT"
          targetId={report.id}
          title="举报评论"
          onClose={() => setReport(null)}
        />
      )}
    </View>
  )
}
