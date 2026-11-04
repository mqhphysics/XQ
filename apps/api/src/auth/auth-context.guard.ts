import {
  HttpStatus,
  Inject,
  Injectable,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common'
import { ERROR_CODES } from '@xiaoqiu/contracts'
import { Reflector } from '@nestjs/core'
import { isUUID } from 'class-validator'

import { ApiHttpException } from '../common/api-http.exception'
import type { RequestWithId } from '../common/request-context'
import { PrismaService } from '../database/prisma.service'
import { DEMO_ORGANIZATION_ID } from '../database/demo-fixture'
import { AccessPolicyService } from './access-policy.service'
import { AuthService } from './auth.service'
import { APPLICATION_AUTHORIZATION } from './application-authorization'

const TOURNAMENT_ADMIN_ROUTES = new Set([
  'admin/tournaments/:id/rule-versions',
  'admin/tournaments/:id/teams',
  'admin/tournaments/:id/matches',
  'admin/tournaments/:tournamentid/team-registrations',
  'admin/tournaments/:tournamentid/team-registrations/:registrationid',
])
const EXISTING_APPLICATION_AUTHORIZED_ROUTES = new Set([
  'admin/identities',
  'admin/reports',
  'admin/reports/:reportid',
])

/** One server-owned context for the old schedule/roster adapters and public reads. */
@Injectable()
export class AuthContextGuard implements CanActivate {
  constructor(
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(AccessPolicyService) private readonly policy: AccessPolicyService,
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(Reflector) private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithId>()
    // Express accepts trailing slashes. Use its matched route template so a
    // different spelling of the URL cannot skip an exact authorization check.
    const routePath: unknown = request.route?.path
    const path = (typeof routePath === 'string' ? routePath : request.path)
      .replace(/^\/api\//, '')
      .replace(/\/+$/, '')
      .toLowerCase()
    const publicRead = path.startsWith('public/')
    const login = [
      'auth/login',
      'auth/register',
      'auth/registration-check',
      'auth/registration-feedback',
      'auth/email/code',
      'auth/email/login',
      'auth/password/reset-by-email',
    ].includes(path)
    const admin = path.startsWith('admin/')
    if (!publicRead && !login && !admin) return true

    // Public reads stay anonymous unless a bearer token is present. A presented
    // token still has to be valid, so a revoked session cannot silently continue.
    const session =
      !login && (admin || (publicRead && request.headers.authorization !== undefined))
        ? await this.auth.requireSession(request.headers.authorization)
        : undefined
    const organizationId = resolveOrganizationSelector(request, session?.organizationId)
    if (session && session.organizationId !== organizationId) {
      throw new ApiHttpException(HttpStatus.FORBIDDEN, {
        code: ERROR_CODES.FORBIDDEN,
        message: '组织选择与当前会话不一致，请重新登录该组织',
      })
    }
    if (!session) {
      const organization = await this.prisma.organization.findFirst({
        where: { id: organizationId, status: 'ACTIVE' },
        select: { id: true },
      })
      if (!organization)
        throw new ApiHttpException(HttpStatus.NOT_FOUND, {
          code: ERROR_CODES.NOT_FOUND,
          message: '组织不存在或不可用',
        })
    }
    request.organizationId = organizationId
    request.authenticatedSession = session

    if (!admin || !session) return true
    if (
      this.reflector.getAllAndOverride<boolean>(APPLICATION_AUTHORIZATION, [
        context.getHandler(),
        context.getClass(),
      ])
    )
      return true
    // Other admin controllers retain their application-service authorization.
    if (path === 'admin/schedule-workbench') {
      request.administeredTournamentIds = await this.policy.administeredTournamentIds(session)
      request.scheduleAdministratorAuthorized = true
    } else if (TOURNAMENT_ADMIN_ROUTES.has(path)) {
      await this.policy.requireTournamentAdministrator(
        session,
        requireUuid(request.params.id ?? request.params.tournamentId),
      )
      request.scheduleAdministratorAuthorized = true
    } else if (path === 'admin/schedule-plans') {
      await this.policy.requireTournamentAdministrator(
        session,
        requireUuid(request.body?.tournamentId),
      )
      request.scheduleAdministratorAuthorized = true
    } else if (
      ['admin/schedule-plans/:id/validate', 'admin/schedule-plans/:id/publish'].includes(path)
    ) {
      const plan = await this.prisma.schedulePlan.findFirst({
        where: { id: requireUuid(request.params.id), organizationId },
        select: { tournamentId: true },
      })
      if (!plan)
        throw new ApiHttpException(HttpStatus.NOT_FOUND, {
          code: ERROR_CODES.NOT_FOUND,
          message: '赛程草案不存在',
        })
      await this.policy.requireTournamentAdministrator(session, plan.tournamentId)
      request.scheduleAdministratorAuthorized = true
    } else if (['admin/seasons', 'admin/venues', 'admin/tournaments'].includes(path)) {
      this.policy.requireOrganizationAdministrator(session)
      request.scheduleAdministratorAuthorized = true
    } else if (!EXISTING_APPLICATION_AUTHORIZED_ROUTES.has(path)) {
      throw new ApiHttpException(HttpStatus.FORBIDDEN, {
        code: ERROR_CODES.FORBIDDEN,
        message: '管理接口尚未配置服务端授权策略',
      })
    }
    return true
  }
}

export function resolveOrganizationSelector(
  request: RequestWithId,
  sessionOrganizationId?: string,
): string {
  const canonical = readSelector(request, 'x-organization-id')
  const legacy = readSelector(request, 'x-dev-organization-id')
  if (canonical && legacy && canonical !== legacy) throw badRequest('组织选择不一致')
  if (process.env.NODE_ENV === 'production' && legacy && !canonical) {
    throw badRequest('正式环境请使用 x-organization-id')
  }
  const selected =
    canonical ??
    (process.env.NODE_ENV !== 'production' ? legacy : undefined) ??
    sessionOrganizationId ??
    (process.env.DEFAULT_ORGANIZATION_ID?.trim() || undefined) ??
    (process.env.NODE_ENV !== 'production' ? DEMO_ORGANIZATION_ID : undefined)
  return requireUuid(selected)
}

function readSelector(request: RequestWithId, name: string): string | undefined {
  const value = request.headers[name]
  if (value === undefined) return undefined
  if (typeof value !== 'string' || !value.trim()) throw badRequest('组织选择必须是单个 UUID')
  return requireUuid(value.trim())
}

function requireUuid(value: unknown): string {
  if (typeof value !== 'string' || !isUUID(value)) throw badRequest('缺少有效的组织或对象 UUID')
  return value.toLowerCase()
}

function badRequest(message: string) {
  return new ApiHttpException(HttpStatus.BAD_REQUEST, { code: ERROR_CODES.BAD_REQUEST, message })
}
