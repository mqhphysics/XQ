import { Module } from '@nestjs/common'
import { DatabaseModule } from '../database/database.module'
import { IdentityController } from './identity.controller'
import { IdentityService } from './identity.service'
import { SocialModule } from '../social/social.module'

@Module({
  imports: [DatabaseModule, SocialModule],
  controllers: [IdentityController],
  providers: [IdentityService],
  exports: [IdentityService],
})
export class IdentityModule {}
