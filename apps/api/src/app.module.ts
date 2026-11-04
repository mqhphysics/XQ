import { Module } from '@nestjs/common'

import { AppController } from './app.controller'
import { AppService } from './app.service'
import { AuthModule } from './auth/auth.module'
import { IdentityModule } from './identity/identity.module'
import { DatabaseModule } from './database/database.module'
import { ExperienceModule } from './experience/experience.module'
import { MediaModule } from './media/media.module'
import { MatchReportModule } from './match-report/match-report.module'
import { RosterModule } from './roster/roster.module'
import { ResultsModule } from './results/results.module'
import { ScheduleModule } from './schedule/schedule.module'
import { SocialModule } from './social/social.module'
import { AdminCenterModule } from './admin-center/admin-center.module'
import { ProductConfigModule } from './product-config/product-config.module'
import { CampusModule } from './campus/campus.module'
import { AiModerationModule } from './ai-moderation/ai-moderation.module'
import { TechnicalStatisticsModule } from './technical-statistics/technical-statistics.module'
import { GettingStartedModule } from './getting-started/getting-started.module'
import { RefereeProfileModule } from './referee-profile/referee-profile.module'

@Module({
  controllers: [AppController],
  imports: [
    DatabaseModule,
    AiModerationModule,
    AuthModule,
    IdentityModule,
    ExperienceModule,
    MediaModule,
    RosterModule,
    MatchReportModule,
    ResultsModule,
    ScheduleModule,
    SocialModule,
    AdminCenterModule,
    ProductConfigModule,
    CampusModule,
    TechnicalStatisticsModule,
    GettingStartedModule,
    RefereeProfileModule,
  ],
  providers: [AppService],
})
export class AppModule {}
