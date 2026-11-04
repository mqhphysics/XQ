import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module'
import { MatchReportModule } from '../match-report/match-report.module'
import { TechnicalStatisticsController } from './technical-statistics.controller'
import { TechnicalStatisticsService } from './technical-statistics.service'
@Module({
  imports: [AuthModule, MatchReportModule],
  controllers: [TechnicalStatisticsController],
  providers: [TechnicalStatisticsService],
})
export class TechnicalStatisticsModule {}
