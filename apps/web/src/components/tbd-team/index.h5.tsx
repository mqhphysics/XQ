import './index.h5.scss'

/** The one label for an undecided team, everywhere on the site. */
export const TBD_LABEL = '待定'

/**
 * The one placeholder crest for an undecided team: a round dashed ring with "?". `size` is a
 * named crest size or a pixel diameter; `hint` (e.g. "半决赛 1 胜者") is shown on hover only.
 */
export function TbdCrest({
  size = 'medium',
  hint,
  className = '',
}: {
  size?: 'small' | 'medium' | 'large' | number
  hint?: string | null | undefined
  className?: string
}) {
  // Named sizes reuse the real crest classes so every page's crest rule (e.g. the match hero's
  // 40px crest) sizes the placeholder exactly like a real crest beside it.
  const named = typeof size === 'string'
  return (
    <span
      className={`tbd-crest ${named ? `team-crest team-crest--${size} tbd-crest--named` : ''} ${className}`}
      role="img"
      aria-label={hint ? `${TBD_LABEL}（${hint}）` : TBD_LABEL}
      title={hint ?? TBD_LABEL}
      style={
        named
          ? undefined
          : {
              width: `${size}px`,
              height: `${size}px`,
              fontSize: `${Math.round(size * 0.42)}px`,
            }
      }
    >
      <svg className="tbd-crest__art" viewBox="0 0 24 24" aria-hidden="true">
        <circle
          cx="12"
          cy="12"
          r="10.5"
          fill="#f7faf6"
          stroke="#a9b6ac"
          strokeWidth="1.2"
          strokeDasharray="2.4 1.8"
        />
        <path
          d="M9.6 8.8a2.4 2.4 0 0 1 4.8 0c0 1.6-2.4 2-2.4 3.8"
          fill="none"
          stroke="#8a988d"
          strokeWidth="1.7"
          strokeLinecap="round"
        />
        <circle cx="12" cy="16" r=".9" fill="#8a988d" />
      </svg>
    </span>
  )
}

/** Team name text for a possibly undecided team. */
export function tbdName(name: string | null | undefined): string {
  return name || TBD_LABEL
}
