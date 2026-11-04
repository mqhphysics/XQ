import type { PostSummary } from '../../features/product/product.types'
export interface PlayerPostFeedProps {
  playerId: string
  playerName: string
  tournamentId: string
  posts: PostSummary[]
}
export function PlayerPostFeed(_props: PlayerPostFeedProps) {
  return null
}
