import { Module } from '@nestjs/common'

import { AuthModule } from '../auth/auth.module'
import { DatabaseModule } from '../database/database.module'
import { ResultsController } from './results.controller'
import { ResultsService } from './results.service'

@Module({
  imports: [AuthModule, DatabaseModule],
  controllers: [ResultsController],
  providers: [ResultsService],
  exports: [ResultsService],
})
export class ResultsModule {}
