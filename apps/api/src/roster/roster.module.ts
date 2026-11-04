import { Module } from '@nestjs/common'

import { DatabaseModule } from '../database/database.module'
import { AuthModule } from '../auth/auth.module'
import { RosterWorkflowController } from './roster-workflow.controller'
import { RosterWorkflowService } from './roster-workflow.service'
import { LineupPlanController } from './lineup-plan.controller'
import { LineupPlanService } from './lineup-plan.service'
import { RosterController } from './roster.controller'
import { RosterService } from './roster.service'

@Module({
  controllers: [RosterController, RosterWorkflowController, LineupPlanController],
  imports: [DatabaseModule, AuthModule],
  providers: [RosterService, RosterWorkflowService, LineupPlanService],
})
export class RosterModule {}
