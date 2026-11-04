import { openPost } from '../../features/product/post-navigation.h5'
import { resolveMediaUrl } from '../../features/product/product.repository'
import { EmojiText } from '../post-social/emoji-picker'
import type { PostQuoteProps } from './index'

export function PostQuote({ post, sourceId, interactive = true }: PostQuoteProps) {
  if (!post && !sourceId) return null
  const open = () => {
    if (post && interactive) void openPost(post.id)
  }
  return (
    <div
      className={`post-quote ${interactive && post ? 'post-quote--link' : ''}`}
      role={interactive && post ? 'button' : undefined}
      tabIndex={interactive && post ? 0 : undefined}
      aria-label={post ? `引用动态：${post.author.displayName}` : '原动态已删除或不可见'}
      onClick={(event) => {
        event.stopPropagation()
        open()
      }}
      onKeyDown={(event) => {
        if (interactive && post && (event.key === 'Enter' || event.key === ' ')) {
          event.preventDefault()
          event.stopPropagation()
          open()
        }
      }}
    >
      {post ? (
        <>
          <strong className="post-quote__author">@{post.author.displayName}</strong>
          {post.title && <strong className="post-quote__title">{post.title}</strong>}
          <p className="post-quote__body">
            <EmojiText>{post.body}</EmojiText>
          </p>
          {post.imageUrls?.length || post.imageUrl ? (
            <div className="post-quote__images">
              {(post.imageUrls ?? (post.imageUrl ? [post.imageUrl] : [])).slice(0, 2).map((url) => (
                <img key={url} src={resolveMediaUrl(url)} alt="引用动态配图" />
              ))}
            </div>
          ) : null}
        </>
      ) : (
        <span>原动态已删除或不可见</span>
      )}
    </div>
  )
}
