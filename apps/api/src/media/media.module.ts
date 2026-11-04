import { Module } from '@nestjs/common'

import { AuthModule } from '../auth/auth.module'
import { ManagedMediaModule } from '../managed-media/managed-media.module'
import { MediaController } from './media.controller'
import { MediaService } from './media.service'

@Module({
  controllers: [MediaController],
  imports: [AuthModule, ManagedMediaModule],
  providers: [MediaService],
  exports: [MediaService],
})
export class MediaModule {}
