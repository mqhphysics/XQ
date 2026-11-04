import { Inject, Injectable } from '@nestjs/common'
import { randomInt } from 'node:crypto'
import { AdminCenterService } from './admin-center.service'
import { centerError } from './admin-center.policy'
import { hashPassword } from '../auth/password'
import type { AdminPasswordResetDto, AdminProvisionAccountsDto } from './admin-center.dto'
import {
  credentialFingerprint,
  openAssignedPassword,
  sealAssignedPassword,
  type AssignedPassword,
} from './admin-password-vault'

const assignmentAction = 'ADMIN_LOGIN_PASSWORD_ASSIGNED'
const randomPassword = () => randomInt(0, 1_000_000).toString().padStart(6, '0')

@Injectable()
export class AdminLoginAccessService {
  constructor(@Inject(AdminCenterService) private readonly center: AdminCenterService) {}

  view(auth: string | undefined, id: string) {
    return this.center.read(auth, async (tx, actor) => {
      const member = await tx.organizationMembership.findFirst({
        where: { organizationId: actor.organizationId, userId: id },
        select: { user: { select: { loginNameNormalized: true, passwordCredential: true } } },
      })
      if (!member) throw centerError(404, '本组织中不存在该账号')
      const entry = await tx.auditLog.findFirst({
        where: {
          organizationId: actor.organizationId,
          action: assignmentAction,
          targetType: 'User',
          targetId: id,
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      })
      const assigned = entry?.afterSummary as unknown as AssignedPassword | undefined
      let password: string | null = null
      let description = '尚未通过后台分配可查看的密码，可生成新的六位随机密码。'
      if (assigned && member.user.passwordCredential) {
        if (assigned.fingerprint !== credentialFingerprint(member.user.passwordCredential))
          description = '该用户已修改密码，之前分配的密码已失效；可重新分配。'
        else {
          try {
            password = await openAssignedPassword(assigned, `${actor.organizationId}:${id}`)
          } catch {
            description = '分配记录的密钥不可用，可重新分配密码。'
          }
          if (!password && description.startsWith('尚未'))
            description = '密码密钥未配置，可重新分配密码。'
        }
      }
      await this.center.auditWrite(
        tx,
        actor,
        'ADMIN_LOGIN_PASSWORD_VIEWED',
        'User',
        id,
        '管理员查看已分配的登录密码',
        'admin-password-read',
        null,
        { available: Boolean(password) },
      )
      return {
        username: member.user.loginNameNormalized,
        available: Boolean(password),
        password,
        assignedAt: password ? entry?.createdAt.toISOString() : null,
        description: password ? '本轮分配的登录密码；用户自行修改后不再显示旧密码。' : description,
      }
    })
  }

  reset(
    auth: string | undefined,
    id: string,
    input: AdminPasswordResetDto,
    key: string | undefined,
    requestId: string,
  ) {
    return this.center.write(
      auth,
      `POST /admin/center/users/${id}/login-password`,
      input,
      key,
      async (tx, actor) => {
        const member = await tx.organizationMembership.findFirst({
          where: { organizationId: actor.organizationId, userId: id },
          select: { user: { select: { id: true } } },
        })
        if (!member) throw centerError(404, '本组织中不存在该账号')
        const shared = await tx.organizationMembership.count({
          where: {
            userId: id,
            organizationId: { not: actor.organizationId },
            status: { not: 'LEFT' },
          },
        })
        if (
          shared &&
          !actor.user.roles.some((r) => r.role === 'PLATFORM_ADMIN' && r.scopeType === 'PLATFORM')
        )
          throw centerError(409, '跨组织账号的密码需平台管理员处理')
        const changed = await tx.user.updateMany({
          where: { id, updatedAt: new Date(input.expectedUpdatedAt) },
          data: { updatedAt: new Date() },
        })
        if (changed.count !== 1) throw centerError(409, '账号资料已变化，请刷新后重新核对')
        const password = randomPassword()
        const digest = hashPassword(password)
        const credential = {
          passwordHash: digest.hash,
          passwordSalt: digest.salt,
          algorithm: digest.algorithm,
        }
        const assigned = await sealAssignedPassword(
          password,
          credential,
          `${actor.organizationId}:${id}`,
        )
        await tx.passwordCredential.upsert({
          where: { userId: id },
          create: { userId: id, ...credential },
          update: credential,
        })
        const revoked = await tx.userSession.updateMany({
          where: { userId: id, revokedAt: null, id: { not: actor.sessionId } },
          data: { revokedAt: new Date() },
        })
        await this.center.auditWrite(
          tx,
          actor,
          assignmentAction,
          'User',
          id,
          input.reason,
          requestId,
          null,
          { ...assigned, revokedCount: revoked.count },
        )
        return { id, assigned: true, revokedSessionCount: revoked.count }
      },
    )
  }

  provision(
    auth: string | undefined,
    input: AdminProvisionAccountsDto,
    key: string | undefined,
    requestId: string,
  ) {
    return this.center.write(
      auth,
      'POST /admin/center/users/provision-from-players',
      input,
      key,
      async (tx, actor) => {
        const candidates = await tx.playerProfile.findMany({
          where: { organizationId: actor.organizationId, linkedUser: null },
          orderBy: [{ displayName: 'asc' }, { id: 'asc' }],
          select: { id: true, displayName: true, studentId: true },
        })
        const used = await tx.user.findMany({
          where: {
            studentId: { in: candidates.flatMap((p) => (p.studentId ? [p.studentId] : [])) },
          },
          select: { studentId: true },
        })
        const studentIds = new Set(used.map((u) => u.studentId))
        const selected = candidates
          .filter((p) => {
            if (!p.studentId) return true
            if (studentIds.has(p.studentId)) return false
            studentIds.add(p.studentId)
            return true
          })
          .slice(0, input.count)
        if (selected.length < input.count)
          throw centerError(
            409,
            `可创建的独立球员档案只有${selected.length}个，请调整数量或处理学号冲突`,
          )
        const ids: string[] = []
        for (const player of selected) {
          const stableLogin = `player-${player.id.replaceAll('-', '').slice(0, 20)}`
          const preferredLogin =
            player.studentId && /^[A-Za-z0-9_.-]{3,32}$/.test(player.studentId)
              ? player.studentId.toLowerCase()
              : stableLogin
          const occupied = await tx.user.findFirst({
            where: { loginNameNormalized: preferredLogin },
            select: { id: true },
          })
          const username = occupied ? stableLogin : preferredLogin
          const password = randomPassword()
          const digest = hashPassword(password)
          const credential = {
            passwordHash: digest.hash,
            passwordSalt: digest.salt,
            algorithm: digest.algorithm,
          }
          const user = await tx.user.create({
            data: {
              loginNameNormalized: username,
              displayName: player.displayName,
              studentId: player.studentId,
              playerProfileId: player.id,
              memberships: { create: { organizationId: actor.organizationId, status: 'ACTIVE' } },
              passwordCredential: { create: credential },
            },
          })
          const assigned = await sealAssignedPassword(
            password,
            credential,
            `${actor.organizationId}:${user.id}`,
          )
          await this.center.auditWrite(
            tx,
            actor,
            assignmentAction,
            'User',
            user.id,
            input.reason,
            requestId,
            null,
            { ...assigned, changedFields: ['playerProfileId', 'loginNameNormalized'] },
          )
          ids.push(user.id)
        }
        await this.center.auditWrite(
          tx,
          actor,
          'PLAYER_LOGIN_ACCOUNTS_CREATED',
          'Organization',
          actor.organizationId,
          input.reason,
          requestId,
          null,
          { count: ids.length },
        )
        return { createdCount: ids.length, userIds: ids }
      },
    )
  }
}
