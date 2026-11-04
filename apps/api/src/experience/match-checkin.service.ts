import { randomUUID } from 'node:crypto'
import { HttpStatus, Inject, Injectable } from '@nestjs/common'
import { ERROR_CODES } from '@xiaoqiu/contracts'
import { AuthService } from '../auth/auth.service'
import { ApiHttpException } from '../common/api-http.exception'
import { selectPublicTournament } from '../common/public-tournament'
import { PrismaService } from '../database/prisma.service'
import type { Prisma } from '../generated/prisma/client'

type ReadStore = Pick<PrismaService, 'match' | 'tournament' | 'matchCheckin'>

@Injectable()
export class MatchCheckinService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuthService) private readonly auth: AuthService,
  ) {}

  private async match(store: ReadStore, organizationId: string, matchId: string) {
    const match = await store.match.findFirst({
      where: { id: matchId.toLowerCase(), organizationId, status: { not: 'DRAFT' } },
      select: { id: true, tournamentId: true },
    })
    if (!match)
      throw new ApiHttpException(HttpStatus.NOT_FOUND, {
        code: ERROR_CODES.NOT_FOUND,
        message: '比赛不存在或尚未公开',
      })
    await selectPublicTournament(store, organizationId, match.tournamentId)
    return match
  }

  private async summary(
    store: Pick<ReadStore, 'matchCheckin'>,
    organizationId: string,
    matchId: string,
    userId?: string,
  ) {
    const [count, own] = await Promise.all([
      store.matchCheckin.count({ where: { organizationId, matchId } }),
      userId
        ? store.matchCheckin.findUnique({
            where: { matchId_userId: { matchId, userId } },
            select: { createdAt: true },
          })
        : null,
    ])
    return { matchId, count, checkedIn: !!own, checkedInAt: own?.createdAt.toISOString() ?? null }
  }

  async get(organizationId: string, matchId: string, authorization?: string) {
    const session = await this.auth.getSession(authorization)
    if (session && session.organizationId !== organizationId)
      throw new ApiHttpException(HttpStatus.FORBIDDEN, {
        code: ERROR_CODES.FORBIDDEN,
        message: '组织与当前账号不一致',
      })
    const match = await this.match(this.prisma, organizationId, matchId)
    return this.summary(this.prisma, organizationId, match.id, session?.userId)
  }

  async checkIn(authorization: string | undefined, matchId: string) {
    const session = await this.auth.requireSession(authorization)
    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const match = await this.match(tx, session.organizationId, matchId)
      // The database unique constraint makes retries and simultaneous taps idempotent.
      await tx.matchCheckin.createMany({
        data: [
          {
            id: randomUUID(),
            organizationId: session.organizationId,
            matchId: match.id,
            userId: session.userId,
          },
        ],
        skipDuplicates: true,
      })
      return this.summary(tx, session.organizationId, match.id, session.userId)
    })
  }
}
