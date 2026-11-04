import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module'
import { DatabaseModule } from '../database/database.module'
import { MatchReportController, MatchReportOverviewController } from './match-report.controller'
import { MatchReportService } from './match-report.service'

@Module({
  imports: [AuthModule, DatabaseModule],
  controllers: [MatchReportController, MatchReportOverviewController],
  providers: [MatchReportService],
  exports: [MatchReportService],
})
export class MatchReportModule {}
