import ball from '../../assets/emoji/26bd.svg'

export type MatchIconKind =
  | 'GOAL'
  | 'OWN_GOAL'
  | 'ASSIST'
  | 'YELLOW_CARD'
  | 'RED_CARD'
  | 'SUBSTITUTION'
  | 'ON'
  | 'OFF'
  | 'PENALTY_SCORED'
  | 'PENALTY_MISSED'
const labels: Record<MatchIconKind, string> = {
  GOAL: '进球',
  OWN_GOAL: '乌龙球',
  ASSIST: '助攻',
  YELLOW_CARD: '黄牌',
  RED_CARD: '红牌',
  SUBSTITUTION: '换人',
  ON: '换上',
  OFF: '换下',
  PENALTY_SCORED: '点球进球',
  PENALTY_MISSED: '点球未进',
}

export function MatchIcon({ kind }: { kind: MatchIconKind }) {
  const label = labels[kind]
  return (
    <span
      className={`match-icon match-icon--${kind.toLowerCase()}`}
      role="img"
      aria-label={label}
      title={label}
    >
      {['GOAL', 'OWN_GOAL', 'PENALTY_SCORED', 'PENALTY_MISSED'].includes(kind) ? (
        <>
          <img src={ball} alt="" />
          {kind === 'OWN_GOAL' ? (
            <b>↶</b>
          ) : kind === 'PENALTY_SCORED' ? (
            <b>P</b>
          ) : kind === 'PENALTY_MISSED' ? (
            <b>×</b>
          ) : null}
        </>
      ) : (
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          {kind === 'YELLOW_CARD' || kind === 'RED_CARD' ? (
            <rect
              x="6"
              y="3"
              width="12"
              height="18"
              rx="2"
              fill={kind === 'YELLOW_CARD' ? '#e4bd43' : '#b3473c'}
              stroke={kind === 'YELLOW_CARD' ? '#b78e27' : '#92372e'}
            />
          ) : kind === 'ASSIST' ? (
            <>
              <path d="M3 15l4-9 4 3 1 5 7 2c2 1 2 4 0 4H4zM4 17h16M8 10l3 1M7 13l4 1" />
            </>
          ) : kind === 'SUBSTITUTION' ? (
            <>
              <path d="M4 7h15l-4-4M19 7l-4 4" stroke="#408b5b" />
              <path d="M20 17H5l4 4M5 17l4-4" stroke="#b75b4e" />
            </>
          ) : (
            <path d={kind === 'ON' ? 'M4 12h16M14 6l6 6-6 6' : 'M20 12H4M10 6l-6 6 6 6'} />
          )}
        </svg>
      )}
    </span>
  )
}
