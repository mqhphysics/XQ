import { Module } from '@nestjs/common'

import { DatabaseModule } from '../database/database.module'
import { AuthModule } from '../auth/auth.module'
import { ScheduleController } from './schedule.controller'
import { ScheduleService } from './schedule.service'
import { MatchClockService } from './match-clock.service'
import { MatchClockController } from './match-clock.controller'

@Module({
  controllers: [ScheduleController, MatchClockController],
  imports: [DatabaseModule, AuthModule],
  providers: [ScheduleService, MatchClockService],
})
export class ScheduleModule {}
