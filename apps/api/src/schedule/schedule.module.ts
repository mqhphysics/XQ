import { Module } from '@nestjs/common'

import { DatabaseModule } from '../database/database.module'
import { AuthModule } from '../auth/auth.module'
import { ScheduleController } from './schedule.controller'
import { ScheduleService } from './schedule.service'
import { MatchClockService } from './match-clock.service'

@Module({
  controllers: [ScheduleController],
  imports: [DatabaseModule, AuthModule],
  providers: [ScheduleService, MatchClockService],
})
export class ScheduleModule {}
