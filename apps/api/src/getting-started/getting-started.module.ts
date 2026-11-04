import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module'
import { DatabaseModule } from '../database/database.module'
import { GettingStartedController } from './getting-started.controller'
import { GettingStartedService } from './getting-started.service'
@Module({
  imports: [AuthModule, DatabaseModule],
  controllers: [GettingStartedController],
  providers: [GettingStartedService],
})
export class GettingStartedModule {}
