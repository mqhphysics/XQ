import { request } from '../product/product.repository'
import type { TechnicalOperation } from '@xiaoqiu/contracts'
export type {
  TechnicalOperation,
  TechnicalMetric,
  TechnicalOutcome,
  TechnicalTotals,
} from '@xiaoqiu/contracts'
export {
  TECHNICAL_METRICS,
  TECHNICAL_TOTAL_KEYS,
  emptyTechnicalTotals,
  technicalState,
  technicalSummary,
  technicalTotals,
} from '@xiaoqiu/contracts'
export interface TechnicalWorkspace {
  matchId: string
  tournamentId: string
  title: string
  recorderUserId: string
  canRecord: boolean
  reason: string | null
  version: number
  operations: TechnicalOperation[]
  teams: Array<{
    id: string
    name: string
    shortName: string
    players: Array<{
      id: string
      displayName: string
      shirtNumber: string | null
      /** Added 2026-10-31; older API builds omit these fields. */
      avatarUrl?: string | null
      position?: string | null
      /** true/false from the confirmed match lineup; null when none is confirmed. */
      starter?: boolean | null
    }>
  }>
}
export const technicalApi = {
  load: (id: string) =>
    request<TechnicalWorkspace>(
      `/matches/${encodeURIComponent(id)}/technical-statistics?schemaVersion=2`,
      {
        refresh: true,
      },
    ),
  append: (id: string, expectedVersion: number, operations: TechnicalOperation[]) =>
    request<TechnicalWorkspace>(`/matches/${encodeURIComponent(id)}/technical-statistics`, {
      method: 'POST',
      data: { schemaVersion: 2, expectedVersion, operations },
    }),
}
export const technicalId = () =>
  'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const n = Math.floor(Math.random() * 16)
    return (c === 'x' ? n : (n & 3) | 8).toString(16)
  })
export const technicalLabels = {
  PASS: '传球',
  TACKLE: '抢断',
  DRIBBLE: '过人',
  SHOT: '射门',
  FOUL: '犯规',
  CHANCE: '绝佳机会',
} as const
