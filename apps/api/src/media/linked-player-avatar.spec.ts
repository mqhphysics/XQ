import assert from 'node:assert/strict'
import test from 'node:test'
import { syncLinkedPlayerAvatar } from './linked-player-avatar'

test('linked avatar propagation preserves custom player photos and respects identity visibility', async () => {
  let avatarUrl: string | null = '/api/media/defaults/player-avatar-01-v1.webp'
  let visible = true,
    updates = 0
  const db = {
    user: {
      findUnique: async () => ({
        playerProfileId: 'player',
        showPlayerIdentity: visible,
        status: 'ACTIVE',
        memberships: [{ id: 'm' }],
      }),
    },
    playerProfile: {
      findFirst: async () => ({ id: 'player', avatarUrl }),
      updateMany: async ({ data }: { data: { avatarUrl: string } }) => {
        avatarUrl = data.avatarUrl
        updates++
        return { count: 1 }
      },
    },
  } as unknown as Parameters<typeof syncLinkedPlayerAvatar>[0]
  await syncLinkedPlayerAvatar(db, 'org', 'user', null, '/new.webp')
  assert.equal(avatarUrl, '/new.webp')
  await syncLinkedPlayerAvatar(db, 'org', 'user', '/new.webp', '/next.webp')
  assert.equal(avatarUrl, '/next.webp')
  avatarUrl = '/player-custom.webp'
  await syncLinkedPlayerAvatar(db, 'org', 'user', '/next.webp', '/third.webp')
  assert.equal(avatarUrl, '/player-custom.webp')
  visible = false
  avatarUrl = null
  await syncLinkedPlayerAvatar(db, 'org', 'user', null, '/third.webp')
  assert.equal(avatarUrl, null)
  assert.equal(updates, 2)
})
