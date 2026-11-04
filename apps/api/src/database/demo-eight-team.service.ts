import { createHash } from 'node:crypto'
import type { AccessPolicyService } from '../auth/access-policy.service'
import type { AuthService } from '../auth/auth.service'
import type { Prisma } from '../generated/prisma/client'
import { AuditActorType, TeamRegistrationStatus, MatchStatus } from '../generated/prisma/client'
import type { PrismaService } from './prisma.service'
import { DEMO_ORGANIZATION_ID, DEMO_TOURNAMENT_TEAMS, fixtureId } from './demo-fixture'

const ACTION = 'demo.normalize-eight-teams.v1'
const TOURNAMENT_ID = fixtureId('tournament:2026')
const EXTRA_CODES = [
  'DEMO-LIT',
  'DEMO-HIS',
  'DEMO-ECON',
  'DEMO-FL',
  'DEMO-LAW',
  'DEMO-JOUR',
  'DEMO-MUSIC',
  'DEMO-ART',
]
const R16_CODES = Array.from({ length: 8 }, (_, i) => `GC26-R16-${String(i + 1).padStart(2, '0')}`)

/** Local demo maintenance application service. Never exposed as a public endpoint. */
export class DemoEightTeamService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
    private readonly policy: AccessPolicyService,
  ) {}

  async inspect(authorization: string) {
    await this.authorize(authorization)
    return this.prisma.$transaction((tx) => this.plan(tx), { isolationLevel: 'RepeatableRead' })
  }

  async apply(authorization: string, expectedHash: string, backupSha256: string) {
    if (!/^[a-f0-9]{64}$/.test(backupSha256))
      throw new Error('A verified backup SHA-256 is required.')
    const session = await this.authorize(authorization)
    return this.prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM tournaments WHERE id = ${TOURNAMENT_ID}::uuid AND organization_id = ${DEMO_ORGANIZATION_ID}::uuid FOR UPDATE`
        const plan = await this.plan(tx)
        const previous = await tx.auditLog.findFirst({
          where: { organizationId: DEMO_ORGANIZATION_ID, action: ACTION, targetId: TOURNAMENT_ID },
        })
        if (previous) {
          if (
            plan.matches.some((match) => match.status !== 'DRAFT') ||
            plan.registrations.some((registration) => registration.status !== 'WITHDRAWN')
          )
            throw new Error('Completed normalization has drifted; manual review required.')
          return { changed: false, auditId: previous.id, activeTeams: plan.activeTeams }
        }
        if (plan.hash !== expectedHash)
          throw new Error('Demo data changed since inspection; inspect and back up again.')
        for (const match of plan.matches) {
          const updated = await tx.match.updateMany({
            where: {
              id: match.id,
              organizationId: DEMO_ORGANIZATION_ID,
              tournamentId: TOURNAMENT_ID,
              status: match.status,
              updatedAt: new Date(match.updatedAt),
              reportVersion: 0,
            },
            data: {
              status: MatchStatus.DRAFT,
              statusReason: '八队演示整理：前序十六强保留为非公开历史记录',
            },
          })
          if (updated.count !== 1) throw new Error('Match changed while applying normalization.')
        }
        for (const registration of plan.registrations) {
          const updated = await tx.teamRegistration.updateMany({
            where: {
              id: registration.id,
              organizationId: DEMO_ORGANIZATION_ID,
              tournamentId: TOURNAMENT_ID,
              updatedAt: new Date(registration.updatedAt),
              status: registration.status,
            },
            data: { status: TeamRegistrationStatus.WITHDRAWN },
          })
          if (updated.count !== 1)
            throw new Error('Registration changed while applying normalization.')
        }
        const currentRule = await tx.competitionRuleVersion.findFirst({
          where: { organizationId: DEMO_ORGANIZATION_ID, tournamentId: TOURNAMENT_ID },
          orderBy: { version: 'desc' },
        })
        if (!currentRule) throw new Error('Demo rule version missing.')
        const rules = currentRule.rules as Prisma.JsonObject
        const rule = await tx.competitionRuleVersion.create({
          data: {
            organizationId: DEMO_ORGANIZATION_ID,
            tournamentId: TOURNAMENT_ID,
            version: currentRule.version + 1,
            name: '2026 绿茵杯八队演示规程',
            status: 'PUBLISHED',
            rules: {
              ...rules,
              summary:
                '8 支球队参加小组赛与演示淘汰赛。冠军主线为八强、半决赛和决赛，三四名赛独立展示；小组前两名标绿，演示签位不替代正式晋级规程。',
            } as Prisma.InputJsonValue,
          },
        })
        const audit = await tx.auditLog.create({
          data: {
            organizationId: DEMO_ORGANIZATION_ID,
            actorType: AuditActorType.ADMIN,
            actorUserId: session.userId,
            actorRoleSnapshot: JSON.parse(JSON.stringify(session.user.roles)),
            action: ACTION,
            targetType: 'TOURNAMENT',
            targetId: TOURNAMENT_ID,
            beforeSummary: JSON.parse(JSON.stringify(plan)),
            afterSummary: {
              activeTeams: 8,
              matchesRetainedAsDraft: plan.matches.map((match) => match.id),
              withdrawnRegistrations: plan.registrations.map((registration) => registration.id),
              ruleVersionId: rule.id,
              backupSha256,
            },
            reason: '用户确认演示赛事整理为 8 队，保留全部历史比赛事实、账号及球员档案',
            requestId: ACTION,
            correlationId: plan.hash,
            source: 'DEMO_MAINTENANCE',
          },
        })
        return {
          changed: true,
          auditId: audit.id,
          activeTeams: 8,
          hiddenMatches: plan.matches.length,
          withdrawnRegistrations: plan.registrations.length,
        }
      },
      { isolationLevel: 'Serializable', timeout: 15000 },
    )
  }

  private async authorize(authorization: string) {
    if (DEMO_TOURNAMENT_TEAMS.length !== 8)
      throw new Error(
        'Eight-team normalization is retired: 16 teams enter, 8 qualify for knockouts.',
      )
    const session = await this.auth.requireSession(authorization)
    if (session.organizationId !== DEMO_ORGANIZATION_ID)
      throw new Error('Only the local demo organization is supported.')
    await this.policy.requireTournamentAdministrator(session, TOURNAMENT_ID)
    return session
  }

  private async plan(tx: Prisma.TransactionClient) {
    const tournament = await tx.tournament.findFirst({
      where: {
        id: TOURNAMENT_ID,
        organizationId: DEMO_ORGANIZATION_ID,
        tournamentCode: 'DEMO-GREEN-CUP-2026',
      },
    })
    if (!tournament) throw new Error('Canonical demo tournament not found.')
    // Real report revisions must remain on the normal report workflow.
    if (
      await tx.match.count({
        where: {
          organizationId: DEMO_ORGANIZATION_ID,
          tournamentId: TOURNAMENT_ID,
          reportVersion: { gt: 0 },
        },
      })
    )
      throw new Error('This tournament contains workflow reports; normalization refused.')
    const matches = await tx.match.findMany({
      where: {
        organizationId: DEMO_ORGANIZATION_ID,
        tournamentId: TOURNAMENT_ID,
        matchCode: { in: R16_CODES },
      },
      select: { id: true, matchCode: true, status: true, updatedAt: true },
      orderBy: { matchCode: 'asc' },
    })
    const registrations = await tx.teamRegistration.findMany({
      where: {
        organizationId: DEMO_ORGANIZATION_ID,
        tournamentId: TOURNAMENT_ID,
        team: { teamCode: { in: EXTRA_CODES } },
      },
      select: { id: true, teamId: true, status: true, updatedAt: true },
      orderBy: { id: 'asc' },
    })
    if (
      matches.length !== 8 ||
      matches.some((match) => match.id !== fixtureId(`match:${match.matchCode}`))
    )
      throw new Error('Unexpected legacy match identity or count.')
    if (
      registrations.length !== 8 ||
      registrations.some(
        (registration) =>
          !EXTRA_CODES.some(
            (code) =>
              registration.id === fixtureId(`registration:2026:${code}`) &&
              registration.teamId === fixtureId(`team:${code}`),
          ),
      )
    )
      throw new Error('Unexpected legacy registration identity or count.')
    const active = await tx.teamRegistration.findMany({
      where: {
        organizationId: DEMO_ORGANIZATION_ID,
        tournamentId: TOURNAMENT_ID,
        status: 'APPROVED',
        team: { teamCode: { notIn: EXTRA_CODES } },
      },
      select: { teamId: true },
    })
    if (
      active.length !== 8 ||
      active.some(
        (registration) =>
          !DEMO_TOURNAMENT_TEAMS.some(
            (team) => registration.teamId === fixtureId(`team:${team.code}`),
          ),
      )
    )
      throw new Error('Expected original eight active teams.')
    const records = {
      tournamentId: TOURNAMENT_ID,
      activeTeams: active.length,
      matches: matches.map((match) => ({ ...match, updatedAt: match.updatedAt.toISOString() })),
      registrations: registrations.map((registration) => ({
        ...registration,
        updatedAt: registration.updatedAt.toISOString(),
      })),
    }
    return { ...records, hash: createHash('sha256').update(JSON.stringify(records)).digest('hex') }
  }
}
