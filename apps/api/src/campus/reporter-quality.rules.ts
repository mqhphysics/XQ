export const REPORTER_RULES = {
  initialScore: 100,
  freezeBelow: 60,
  initialPenalty: 10,
  reinstatedPenalty: 20,
  qualifiedMatchesForReward: 3,
  reward: 10,
  cooldownDays: 7,
  appealDays: 7,
  probationMinimumDays: 90,
  inactivity: '在拥有信息员身份的一个完整赛季内没有提交任何合格比赛记录，将冻结该身份',
} as const
export interface ReporterState {
  score: number
  status: string
  reinstatementCount: number
  consecutiveQualified: number
  probationStartedAt?: Date | null
  probationUntil?: Date | null
  probationCompletedAt?: Date | null
}
export function confirmedError(state: ReporterState, occurredAt = new Date()) {
  const probation = state.probationStartedAt
    ? occurredAt >= state.probationStartedAt &&
      (!state.probationCompletedAt || occurredAt <= state.probationCompletedAt)
    : state.status === 'PROBATION'
  const amount = probation ? 20 : 10
  const score = Math.max(0, state.score - amount)
  return {
    score,
    status: score === 0 ? 'BANNED' : score < 60 ? 'FROZEN' : state.status,
    consecutiveQualified: 0,
    delta: score - state.score,
  }
}
export function qualifiedMatch(state: ReporterState) {
  const streak = state.consecutiveQualified + 1
  const rewarded = streak >= 3
  const score = rewarded ? Math.min(100, state.score + 10) : state.score
  return {
    score,
    consecutiveQualified: rewarded ? 0 : streak,
    delta: score - state.score,
    rewarded,
  }
}
export function completedReinstatement(state: ReporterState) {
  // A one-time training allowance prevents endlessly recycling a score back to 60.
  const score = state.reinstatementCount === 0 ? Math.max(60, state.score) : state.score
  return {
    score,
    status: 'PROBATION',
    reinstatementCount: state.reinstatementCount + 1,
    consecutiveQualified: 0,
    delta: score - state.score,
  }
}
