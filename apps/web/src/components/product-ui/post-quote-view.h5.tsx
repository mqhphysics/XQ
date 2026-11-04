import { lazy, Suspense, type ReactNode } from 'react'
import type { PostQuoteProps } from '../post-quote'

const LazyPostQuote = lazy(() =>
  import('../post-quote').then((module) => ({ default: module.PostQuote })),
)

/** Emoji artwork stays in its own chunk until a post actually renders a quote. */
export function PostQuote(props: PostQuoteProps): ReactNode {
  return (
    <Suspense fallback={null}>
      <LazyPostQuote {...props} />
    </Suspense>
  )
}
