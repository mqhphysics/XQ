import { openPlayer } from '../../features/product/player-navigation'
import { TeamTrigger } from '../team-trigger'
import { PlayerTrigger } from '../player-trigger'
import { openTeam } from '../../features/product/team-navigation'
import type { PostTagsProps } from './index'
import './index.h5.scss'

export function PostTags({ tags, tournamentId }: PostTagsProps) {
  if (!window.matchMedia('(min-width: 721px)').matches || !tags?.length) return null
  return (
    <div className="post-tags" aria-label="动态标签">
      {tags.map((tag) => {
        const key = `${tag.kind}:${tag.targetId ?? tag.label}`
        const content =
          tag.targetId && tag.kind !== 'TOPIC' ? (
            <button
              key={key}
              type="button"
              className="post-tag"
              data-post-tag
              onClick={(event) => {
                event.stopPropagation()
                if (tag.kind === 'TEAM') void openTeam(tag.targetId!, tournamentId ?? undefined)
                else void openPlayer(tag.targetId!, tournamentId ?? '')
              }}
            >
              #{tag.label}
            </button>
          ) : (
            <span key={key} className="post-tag post-tag--topic">
              #{tag.label}
            </span>
          )
        return tag.targetId && tag.kind === 'TEAM' ? (
          <TeamTrigger
            key={key}
            teamId={tag.targetId}
            name={tag.label}
            tournamentId={tournamentId ?? undefined}
          >
            {content}
          </TeamTrigger>
        ) : tag.targetId && tag.kind === 'PLAYER' ? (
          <PlayerTrigger
            key={key}
            playerId={tag.targetId}
            name={tag.label}
            tournamentId={tournamentId ?? ''}
          >
            {content}
          </PlayerTrigger>
        ) : (
          content
        )
      })}
    </div>
  )
}
