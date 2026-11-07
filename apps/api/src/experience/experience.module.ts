import { Module } from '@nestjs/common'

import { AuthModule } from '../auth/auth.module'
import { ImageTransferModule } from '../media-transfer/image-transfer.module'
import { SocialModule } from '../social/social.module'
import { MediaModule } from '../media/media.module'
import { ResultsModule } from '../results/results.module'
import { ExperienceController } from './experience.controller'
import { ExperienceService } from './experience.service'
import { SelfPlayerProfileController } from './self-player-profile.controller'
import { SelfPlayerProfileService } from './self-player-profile.service'
import { FeedService } from '../recommendation/feed.service'
import { FeedController } from '../recommendation/feed.controller'
import { FocusMatchesController } from '../recommendation/focus-matches.controller'
import { FocusMatchesService } from '../recommendation/focus-matches.service'
import { MatchCheckinController } from './match-checkin.controller'
import { MatchCheckinService } from './match-checkin.service'

@Module({
  controllers: [
    ExperienceController,
    SelfPlayerProfileController,
    FeedController,
    FocusMatchesController,
    MatchCheckinController,
  ],
  imports: [AuthModule, SocialModule, MediaModule, ResultsModule, ImageTransferModule],
  providers: [
    ExperienceService,
    SelfPlayerProfileService,
    FeedService,
    FocusMatchesService,
    MatchCheckinService,
  ],
})
export class ExperienceModule {}
