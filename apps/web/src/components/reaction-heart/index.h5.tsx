import { ReactionHeart as ExistingHeart } from './reaction-heart.shared'

export function ReactionHeart({ active }: { active: boolean }) {
  if (window.matchMedia('(max-width: 720px)').matches) return <ExistingHeart active={active} />
  return (
    <svg
      className={`reaction-heart ${active ? 'is-active' : ''}`}
      aria-hidden="true"
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill={active ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M19.5 12.572 12 20l-7.5-7.428a5 5 0 1 1 7.5-6.566 5 5 0 1 1 7.5 6.572" />
    </svg>
  )
}
