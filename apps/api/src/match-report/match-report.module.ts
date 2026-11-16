import { SheetRecognitionController } from './sheet-recognition.controller'
import { SheetRecognitionService } from './sheet-recognition.service'
import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module'
import { DatabaseModule } from '../database/database.module'
import { ResultsModule } from '../results/results.module'
import { MatchReportController, MatchReportOverviewController } from './match-report.controller'
import { MatchReportService } from './match-report.service'

@Module({
  imports: [AuthModule, DatabaseModule, ResultsModule],
  controllers: [MatchReportController, MatchReportOverviewController, SheetRecognitionController],
  providers: [MatchReportService, SheetRecognitionService],
  exports: [MatchReportService],
})
export class MatchReportModule {}
