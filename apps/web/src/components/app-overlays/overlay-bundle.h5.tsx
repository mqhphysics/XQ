import { useEffect } from 'react'

import { PostOverlayHost } from '../post-overlay'
import { TeamOverlayHost } from '../team-hub'
import { PlayerOverlayHost } from '../player-overlay'
import { MatchOverlayHost } from '../match-overlay'
import { MessagingOverlayHost } from '../messaging-drawer/host'
import { CaptainManageHost } from '../../features/captain-roster/manage-modal'
import { flushOverlayBuffer } from './overlay-buffer.h5'

export default function OverlayBundle({ publicOnly = false }: { publicOnly?: boolean }) {
  useEffect(() => {
    flushOverlayBuffer()
  }, [])
  return (
    <>
      <PostOverlayHost />
      <TeamOverlayHost />
      <PlayerOverlayHost />
      <MatchOverlayHost />
      {!publicOnly && <MessagingOverlayHost />}
      {!publicOnly && <CaptainManageHost />}
    </>
  )
}
