import { Module } from '@nestjs/common'
import { DatabaseModule } from '../database/database.module'
import { MediaModule } from '../media/media.module'
import { CampusCommandService } from './campus-command.service'
import { StudentService } from './student.service'
import { ReporterQualityService } from './reporter-quality.service'
import { CompetitionCatalogService } from './competition-catalog.service'
import { CampusController, CampusPublicController } from './campus.controller'
import { TeamSeasonService } from './team-season.service'
import { StudentRegistrationService } from './student-registration.service'
import { StudentRegistrationController } from './student-registration.controller'

@Module({
  imports: [DatabaseModule, MediaModule],
  providers: [
    CampusCommandService,
    StudentService,
    ReporterQualityService,
    CompetitionCatalogService,
    TeamSeasonService,
    StudentRegistrationService,
  ],
  controllers: [CampusController, CampusPublicController, StudentRegistrationController],
  exports: [StudentService, ReporterQualityService],
})
export class CampusModule {}
