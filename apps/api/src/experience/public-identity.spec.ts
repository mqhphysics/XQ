import 'reflect-metadata'
import assert from 'node:assert/strict'
import test from 'node:test'
import type { AuthService } from '../auth/auth.service'
import type { PrismaService } from '../database/prisma.service'
import type { SocialService } from '../social/social.service'
import type { MediaService } from '../media/media.service'
import { ApiHttpException } from '../common/api-http.exception'
import { ExperienceService } from './experience.service'
import { publicIdentity, publicIdentitySelect } from './public-identity'
import { validate } from 'class-validator'
import { UpdateProfileDto } from '../auth/auth.dto'

const org = '00000000-0000-4000-8000-000000000001'
const otherOrg = '00000000-0000-4000-8000-000000000099'
const id = '00000000-0000-4000-8000-000000000002'
const tournamentId = '00000000-0000-4000-8000-000000000003'
const account = {
  id,
  displayName: '公开昵称',
  avatarUrl: null,
  bio: '公开简介',
  status: 'ACTIVE',
  verificationLevel: 'STAFF_VERIFIED',
  playerProfile: null,
  memberships: [{ organizationId: org, status: 'ACTIVE' }],
  roleAssignments: [
    { organizationId: org, role: 'MATCH_REPORTER', scopeType: 'TOURNAMENT', revokedAt: null },
    { organizationId: org, role: 'TEAM_CAPTAIN', scopeType: 'TEAM', revokedAt: null },
    {
      organizationId: otherOrg,
      role: 'ORGANIZATION_ADMIN',
      scopeType: 'ORGANIZATION',
      revokedAt: null,
    },
    {
      organizationId: org,
      role: 'TOURNAMENT_ADMIN',
      scopeType: 'TOURNAMENT',
      revokedAt: new Date(),
    },
    { organizationId: null, role: 'PLATFORM_ADMIN', scopeType: 'PLATFORM', revokedAt: null },
  ],
}
test('public identities filter revoked/cross-organization roles and do not expose private fields', () => {
  const identity = publicIdentity(
    {
      ...account,
      realName: '受限姓名',
      studentId: 'private-student',
      email: 'private@example.test',
    } as typeof account,
    org,
    id,
  )
  assert.deepEqual(identity.roles, ['MATCH_REPORTER', 'TEAM_CAPTAIN', 'PLATFORM_ADMIN'])
  assert.equal(identity.messageable, false)
  for (const field of [
    'realName',
    'studentId',
    'email',
    'memberships',
    'roleAssignments',
    'scopeId',
    'bio',
  ])
    assert.equal(field in identity, false)
  for (const field of ['realName', 'studentId', 'email', 'passwordCredential', 'sessions'])
    assert.equal(field in publicIdentitySelect, false)
  assert.deepEqual(
    publicIdentity(
      { ...account, memberships: [{ organizationId: otherOrg, status: 'ACTIVE' }] },
      org,
    ).roles,
    [],
  )
  assert.equal(publicIdentity({ ...account, status: 'SUSPENDED' }, org).messageable, false)
})

test('user identity keeps its own nickname, avatar and cover when linked to a player', () => {
  const identity = publicIdentity(
    {
      ...account,
      avatarUrl: '/user-avatar.png',
      coverUrl: '/user-cover.png',
      showPlayerIdentity: false,
      profileCohort: 'OFFICIAL',
      playerProfile: { id: 'player-id', organizationId: org, avatarUrl: '/player-avatar.png' },
    },
    org,
  )
  assert.equal(identity.displayName, '公开昵称')
  assert.equal(identity.avatarUrl, '/user-avatar.png')
  assert.equal(identity.coverUrl, '/user-cover.png')
  assert.equal(identity.showPlayerIdentity, false)
  assert.equal(identity.official, true)
})

test('profile identity visibility accepts false but rejects null and string input', async () => {
  for (const value of [true, false, undefined]) {
    assert.equal(
      (await validate(Object.assign(new UpdateProfileDto(), { showPlayerIdentity: value }))).length,
      0,
    )
  }
  for (const value of [null, 'false']) {
    assert.ok(
      (await validate(Object.assign(new UpdateProfileDto(), { showPlayerIdentity: value }))).some(
        (error) => error.property === 'showPlayerIdentity',
      ),
    )
  }
})
test('public person reads by stable user ID, requires active membership and returns one organization only', async () => {
  let allowed = true
  let hiddenLinkedPlayer = false
  const tx = {
    tournament: {
      findFirst: async ({ where }: { where: { organizationId: string; status: string } }) => {
        assert.equal(where.organizationId, org)
        assert.equal(where.status, 'PUBLISHED')
        return { id: tournamentId, name: '公开赛事' }
      },
    },
    organizationMembership: {
      findFirst: async ({
        where,
        include,
      }: {
        where: { organizationId: string; userId: string; status: string; user: { status: string } }
        include: unknown
      }) => {
        assert.deepEqual(where, {
          organizationId: org,
          userId: id,
          status: 'ACTIVE',
          user: { status: 'ACTIVE' },
        })
        assert.ok(JSON.stringify(include).includes('roleAssignments'))
        return allowed
          ? {
              user: hiddenLinkedPlayer
                ? {
                    ...account,
                    showPlayerIdentity: false,
                    playerProfile: { id: 'hidden-player', organizationId: org, avatarUrl: null },
                  }
                : account,
              organization: { name: '公开组织' },
            }
          : null
      },
    },
    post: {
      findMany: async ({
        where,
      }: {
        where: {
          organizationId: string
          tournamentId: string
          authorUserId: string
          status: string
        }
      }) => {
        assert.deepEqual(where, {
          organizationId: org,
          status: 'PUBLISHED',
          OR: [
            { authorUserId: id },
            ...(hiddenLinkedPlayer
              ? [{ tags: { some: { organizationId: org, playerId: 'hidden-player' } } }]
              : []),
          ],
        })
        return []
      },
    },
  }
  const prisma = {
    $transaction: async (action: (db: typeof tx) => Promise<unknown>) => action(tx),
  } as unknown as PrismaService
  const auth = { getSession: async () => null } as unknown as AuthService
  const service = new ExperienceService(prisma, auth, {} as SocialService, {} as MediaService)
  const profile = await service.getPerson(org, id, tournamentId)
  assert.equal(profile.id, id)
  assert.equal(profile.player, null)
  assert.equal(profile.bio, '公开简介')
  assert.deepEqual(profile.posts, [])
  assert.equal('studentId' in profile, false)
  assert.equal('realName' in profile, false)
  assert.equal('email' in profile, false)
  hiddenLinkedPlayer = true
  assert.equal((await service.getPerson(org, id, tournamentId)).player, null)
  allowed = false
  await assert.rejects(
    service.getPerson(org, id, tournamentId),
    (error: unknown) => error instanceof ApiHttpException && error.getStatus() === 404,
  )
  await assert.rejects(
    service.getPerson(org, '姓名', tournamentId),
    (error: unknown) => error instanceof ApiHttpException && error.getStatus() === 400,
  )
})
