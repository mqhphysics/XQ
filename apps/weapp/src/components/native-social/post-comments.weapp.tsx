import { Button, Image, Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useRef, useState } from 'react'
import { UserAvatar } from '../product-ui'
import { PersonTrigger } from '../person-trigger'
import { ReportModal } from '../report-modal'
import { productRepository, resolveMediaUrl } from '../../features/product/product.repository'
import { readSession } from '../../features/product/session'
import { formatRelativeTime } from '../../features/product/product.format'
import type { PostDetail, PostComment } from '../../features/product/product.types'
import './social.weapp.scss'
export function NativePostComments({
  post,
}: {
  post: PostDetail
  onChanged?: (comment: PostComment) => void
}) {
  const [report, setReport] = useState<PostComment | null>(null)
  const [likes, setLikes] = useState<Record<string, { liked: boolean; count: number }>>({})
  const [error, setError] = useState('')
  const locks = useRef(new Set<string>())
  const like = async (comment: PostComment) => {
    if (!readSession() || locks.current.has(comment.id)) return
    locks.current.add(comment.id)
    const token = readSession()?.accessToken
    try {
      const value = await productRepository.setCommentLike(
        post.id,
        comment.id,
        !(likes[comment.id]?.liked ?? comment.likedByMe),
      )
      if (token === readSession()?.accessToken)
        setLikes((current) => ({
          ...current,
          [comment.id]: { liked: value.liked, count: value.likeCount },
        }))
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : '点赞失败')
    } finally {
      locks.current.delete(comment.id)
    }
  }
  return (
    <View className="native-social-comments">
      <Text className="native-social-label">评论 {post.commentCount}</Text>
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
            <Text className="native-social-comment__body" selectable>
              {comment.body}
            </Text>
            {!!comment.imageUrls?.length && (
              <View className="native-social-comment__images">
                {comment.imageUrls.map((url) => (
                  <Image
                    key={url}
                    src={resolveMediaUrl(url) || url}
                    mode="aspectFit"
                    lazyLoad
                    onClick={() =>
                      void Taro.previewImage({
                        current: resolveMediaUrl(url) || url,
                        urls: comment.imageUrls!.map((item) => resolveMediaUrl(item) || item),
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
