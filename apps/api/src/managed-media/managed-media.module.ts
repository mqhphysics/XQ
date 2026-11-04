import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module'
import { ResultsModule } from '../results/results.module'
import { ManagedMediaController } from './managed-media.controller'
import { ManagedMediaService } from './managed-media.service'

@Module({
  imports: [AuthModule, ResultsModule],
  controllers: [ManagedMediaController],
  providers: [ManagedMediaService],
  exports: [ManagedMediaService],
})
export class ManagedMediaModule {}
