import type { ReactNode } from 'react'

import { PostOverlayHost } from '../post-overlay'
import { TeamOverlayHost } from '../team-hub'
import { PlayerOverlayHost } from '../player-overlay'
import { MatchOverlayHost } from '../match-overlay'
import { MessagingOverlayHost } from '../messaging-drawer/host'
import { CaptainManageHost } from '../../features/captain-roster/manage-modal'

/** WeChat keeps the existing eager hosts. H5 loads this module lazily. */
export function AppOverlays(): ReactNode {
  return (
    <>
      <PostOverlayHost />
      <TeamOverlayHost />
      <PlayerOverlayHost />
      <MatchOverlayHost />
      <MessagingOverlayHost />
      <CaptainManageHost />
    </>
  )
}

/** Native pages keep their current detail navigation. */
export function PublicAppOverlays(): ReactNode {
  return null
}
