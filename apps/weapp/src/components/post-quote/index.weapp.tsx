import { Text, View } from '@tarojs/components'
import { openPost } from '../../features/product/post-navigation'
import type { PostQuoteProps } from './index'
import { useNativeBlockedAuthor } from '../../features/native-social/blocking.weapp'
export function PostQuote({ post, sourceId, interactive = true }: PostQuoteProps) {
  const hidden = useNativeBlockedAuthor(post?.author.id || '')
  if (hidden)
    return (
      <View className="native-compose-quote">
        <Text>原动态暂不可见</Text>
      </View>
    )
  if (!post && !sourceId) return null
  return (
    <View
      className="native-compose-quote"
      onClick={(event) => {
        event.stopPropagation()
        if (interactive && post && !post.deleted) void openPost(post.id)
      }}
    >
      <Text>{post && !post.deleted ? `@${post.author.displayName}` : '原动态暂不可见'}</Text>
      {post && !post.deleted && <Text>{post.title || post.body || '图片动态'}</Text>}
    </View>
  )
}
