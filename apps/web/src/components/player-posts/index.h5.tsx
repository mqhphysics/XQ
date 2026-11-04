
import { useEffect, useState } from 'react'

import { Empty, TeamPost } from '../team-hub/content.h5'

import type { PlayerPostFeedProps } from './index'
import '../team-hub/index.h5.scss'

export function PlayerPostFeed({
  playerName,
  tournamentId,
  posts: initialPosts,
}: PlayerPostFeedProps) {
  const [posts, setPosts] = useState(initialPosts)
  
  useEffect(() => setPosts(initialPosts), [initialPosts])
  if (!window.matchMedia('(min-width: 721px)').matches) return null
  return (
    <section className="th-root th-surface player-post-feed" style={{ marginTop: 28 }}>
      <div className="th-heading">
        <h2>球员动态</h2>
        </div>
      {posts.length ? (
        posts.map((post) => <TeamPost key={post.id} post={post} tournamentId={tournamentId} />)
      ) : (
        <Empty title="还没有相关动态" copy={`添加「${playerName}」球员标签的动态会在这里展示。`} />
      )}
      </section>
  )
}
