import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module'
import { DatabaseModule } from '../database/database.module'
import { RefereeProfileService } from './referee-profile.service'
import { RefereeProfileController } from './referee-profile.controller'
@Module({
  imports: [AuthModule, DatabaseModule],
  providers: [RefereeProfileService],
  controllers: [RefereeProfileController],
})
export class RefereeProfileModule {}
