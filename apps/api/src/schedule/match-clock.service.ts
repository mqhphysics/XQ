import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import { PrismaService } from '../database/prisma.service'
import { reportingWindow } from '../match-report/reporting-window'

@Injectable()
export class MatchClockService implements OnModuleInit, OnModuleDestroy {
  private timer?: ReturnType<typeof setInterval>
  private running = false
  private readonly logger = new Logger(MatchClockService.name)
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}
  onModuleInit() {
    if (process.env.NODE_ENV === 'test') return
    void this.tick()
    this.timer = setInterval(() => void this.tick(), 15000)
    this.timer.unref()
  }
  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer)
  }
  async tick(now = new Date()) {
    if (this.running) return
    this.running = true
    try {
      const matches = await this.prisma.match.findMany({
        where: {
          status: { in: ['SCHEDULED', 'LIVE'] },
          scheduledStartAt: { lte: now },
          homeTeamId: { not: null },
          awayTeamId: { not: null },
          tournament: { status: 'PUBLISHED', organization: { status: 'ACTIVE' } },
        },
        select: { id: true, tournamentId: true, status: true, scheduledStartAt: true },
      })
      if (!matches.length) return
      const rules = await this.prisma.competitionRuleVersion.findMany({
        where: {
          tournamentId: { in: [...new Set(matches.map((match) => match.tournamentId))] },
          status: 'PUBLISHED',
        },
        orderBy: { version: 'desc' },
        select: { tournamentId: true, rules: true },
      })
      for (const match of matches) {
        const window = reportingWindow(
          match.scheduledStartAt,
          rules.find((rule) => rule.tournamentId === match.tournamentId)?.rules,
          now.getTime(),
        )
        if (!window) continue
        const status = now.getTime() >= window.estimatedEndAt ? 'FINISHED' : 'LIVE'
        if (status === match.status) continue
        await this.prisma.match.updateMany({
          where: { id: match.id, status: match.status, scheduledStartAt: match.scheduledStartAt },
          data: { status },
        })
      }
    } catch (error) {
      this.logger.error('比赛时间状态更新失败', error)
    } finally {
      this.running = false
    }
  }
}
