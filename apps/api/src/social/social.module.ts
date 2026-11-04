import { Module } from '@nestjs/common'

import { AuthModule } from '../auth/auth.module'
import { MessagingService } from './messaging.service'
import { BadgePreferenceService } from './badge-preference.service'
import { HubStripOrderService } from './hub-strip-order.service'
import { SocialController } from './social.controller'
import { SocialService } from './social.service'

@Module({
  controllers: [SocialController],
  exports: [SocialService],
  imports: [AuthModule],
  providers: [MessagingService, SocialService, BadgePreferenceService, HubStripOrderService],
})
export class SocialModule {}
