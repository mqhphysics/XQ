import { HttpStatus, Inject, Injectable } from '@nestjs/common'
import { ERROR_CODES } from '@xiaoqiu/contracts'
import type {
  AccountCapabilities,
  CapabilityScope,
  ProductModuleId,
  ScopedCapability,
} from '@xiaoqiu/contracts'
import { isUUID } from 'class-validator'
import { AccessPolicyService } from '../auth/access-policy.service'
import { AuthService } from '../auth/auth.service'
import { resolveOrganizationSelector } from '../auth/auth-context.guard'
import { ApiHttpException } from '../common/api-http.exception'
import type { RequestWithId } from '../common/request-context'
import { PrismaService } from '../database/prisma.service'
import { mediaPermissions } from '../managed-media/media-policy'
import { canSendDirectMessages } from '../social/messaging.service'
import { ProductConfigService, UNAVAILABLE_FEATURE_REASON } from './product-config.service'

@Injectable()
export class AccountCapabilitiesService {
  constructor(
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AccessPolicyService) private readonly policy: AccessPolicyService,
    @Inject(ProductConfigService) private readonly configuration: ProductConfigService,
  ) {}

  async get(
    authorization: string | undefined,
    request: RequestWithId,
  ): Promise<AccountCapabilities> {
    const session = await this.auth.requireSession(authorization)
    if (resolveOrganizationSelector(request, session.organizationId) !== session.organizationId) {
      throw new ApiHttpException(HttpStatus.FORBIDDEN, {
        code: ERROR_CODES.FORBIDDEN,
        message: '组织选择与当前会话不一致',
      })
    }
    const roles = await this.prisma.roleAssignment.findMany({
      where: {
        userId: session.userId,
        revokedAt: null,
        grantedAt: { lte: new Date() },
        OR: [
          { organizationId: session.organizationId },
          { organizationId: null, role: 'PLATFORM_ADMIN', scopeType: 'PLATFORM' },
        ],
      },
      select: { role: true, scopeType: true, scopeId: true },
    })
    const actor = { ...session, user: { ...session.user, roles } }
    const media = mediaPermissions(actor)
    const config = this.configuration.getConfiguration()
    const organization: CapabilityScope[] = [{ type: 'ORGANIZATION', id: session.organizationId }]
    const administrator = this.policy.isOrganizationAdministrator(actor)
    const candidateIds = (type: string) => [
      ...new Set(
        roles
          .filter((role) => role.scopeType === type && isUUID(role.scopeId))
          .map((role) => role.scopeId.toLowerCase()),
      ),
    ]
    const [teams, tournaments, matches] = await Promise.all([
      this.prisma.team.findMany({
        where: {
          organizationId: session.organizationId,
          ...(administrator ? {} : { id: { in: candidateIds('TEAM') } }),
        },
        select: { id: true },
      }),
      this.prisma.tournament.findMany({
        where: { organizationId: session.organizationId, id: { in: candidateIds('TOURNAMENT') } },
        select: { id: true },
      }),
      this.prisma.match.findMany({
        where: {
          organizationId: session.organizationId,
          OR: [
            { id: { in: candidateIds('MATCH') } },
            { tournamentId: { in: candidateIds('TOURNAMENT') } },
          ],
        },
        select: { id: true, tournamentId: true },
      }),
    ])
    const teamScopes: CapabilityScope[] = []
    const tournamentScopes: CapabilityScope[] = administrator ? organization : []
    const reportScopes: CapabilityScope[] = administrator ? organization : []
    for (const team of teams)
      if (await allowed(() => this.policy.requireTeamCaptain(actor, team.id)))
        teamScopes.push({ type: 'TEAM', id: team.id })
    if (!administrator) {
      for (const tournament of tournaments)
        if (await allowed(() => this.policy.requireTournamentAdministrator(actor, tournament.id)))
          tournamentScopes.push({ type: 'TOURNAMENT', id: tournament.id })
      for (const match of matches)
        if (await allowed(() => this.policy.requireMatchReporter(actor, match.id))) {
          const tournamentAssignment = roles.some(
            (role) =>
              role.scopeType === 'TOURNAMENT' &&
              role.scopeId.toLowerCase() === match.tournamentId &&
              (role.role === 'MATCH_REPORTER' || role.role === 'TOURNAMENT_ADMIN'),
          )
          reportScopes.push({
            type: tournamentAssignment ? 'TOURNAMENT' : 'MATCH',
            id: tournamentAssignment ? match.tournamentId : match.id,
          })
        }
    }
    const capability = (module: ProductModuleId, scopes: CapabilityScope[]): ScopedCapability => {
      const unique = [
        ...new Map(scopes.map((scope) => [`${scope.type}:${scope.id}`, scope])).values(),
      ]
      const enabled = config.modules[module].enabled && unique.length > 0
      return {
        enabled,
        reason: enabled
          ? null
          : !config.modules[module].enabled
            ? UNAVAILABLE_FEATURE_REASON
            : '当前账号没有此范围的操作权限',
        scopes: enabled ? unique : [],
      }
    }
    return {
      schemaVersion: 1,
      revision: config.revision,
      organizationId: session.organizationId,
      managedTeamIds: teamScopes.map((scope) => scope.id),
      modules: config.modules,
      actions: {
        'home.read': capability('home', organization),
        'schedule.read': capability('schedule', organization),
        'data.read': capability('data', organization),
        'teams.read': capability('teams', organization),
        'community.write': capability('community', organization),
        'teams.manage': capability(
          'teamManagement',
          administrator ? [...organization, ...teamScopes] : teamScopes,
        ),
        'lineups.manage': capability(
          'teamManagement',
          administrator ? [...organization, ...teamScopes] : teamScopes,
        ),
        'matchReports.write': capability('matchReporting', reportScopes),
        'tournaments.manage': capability('administration', tournamentScopes),
        'administration.manage': capability('administration', administrator ? organization : []),
        'messages.read': capability('directMessages', organization),
        'messages.send': capability(
          'directMessages',
          canSendDirectMessages(actor) ? organization : [],
        ),
        'identityApplications.submit': capability('identityApplications', organization),
        'identityApplications.review': capability(
          'identityApplications',
          administrator ? organization : [],
        ),
        'goalMedia.submit': capability('goalMedia', media.canSubmit ? organization : []),
        'goalMedia.review': capability('goalMedia', media.canReview ? organization : []),
        'goalMedia.publish': capability('goalMedia', media.canDirectPublish ? organization : []),
      },
    }
  }
}

async function allowed(check: () => Promise<unknown>): Promise<boolean> {
  try {
    await check()
    return true
  } catch (error) {
    if (error instanceof ApiHttpException && [403, 404].includes(error.getStatus())) return false
    throw error
  }
}
