import { Global, Module } from '@nestjs/common'
import { DatabaseModule } from '../database/database.module'
import { AuthModule } from '../auth/auth.module'
import { AiModerationService } from './ai-moderation.service'
import { AiModerationController } from './ai-moderation.controller'
@Global()
@Module({
  imports: [DatabaseModule, AuthModule],
  providers: [AiModerationService],
  controllers: [AiModerationController],
  exports: [AiModerationService],
})
export class AiModerationModule {}
