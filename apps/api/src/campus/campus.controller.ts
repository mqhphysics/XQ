import {
  Body,
  Controller,
  Get,
  Headers,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common'
import {
  ApiBearerAuth,
  ApiBody,
  ApiHeader,
  ApiOperation,
  ApiQuery,
  ApiTags,
  ApiOkResponse,
} from '@nestjs/swagger'
import { AuthorizeInApplicationService } from '../auth/application-authorization'
import { getOrganizationId, type RequestWithId } from '../common/request-context'
import { StudentService } from './student.service'
import { ReporterQualityService } from './reporter-quality.service'
import { CompetitionCatalogService } from './competition-catalog.service'
import { TeamSeasonService } from './team-season.service'
import { CampusSeasonTeamDto } from './campus.dto'
import { CampusVersionDto } from './campus.dto'
import {
  CampusOnboardingDto,
  CampusProfileDto,
  CampusPlayerDto,
  CampusMediaDto,
  CampusReasonDto,
  ReporterAppealDto,
  ReporterCaseDto,
  ReporterReviewDto,
  ReporterReinstatementDto,
  ReporterReinstateReviewDto,
  StudentAccountLinkDto,
  StudentPlayerLinkDto,
  StudentRecordDto,
  StudentCatalogDto,
} from './campus.dto'

@Controller()
@ApiTags('campus')
@ApiBearerAuth()
@ApiHeader({
  name: 'Idempotency-Key',
  required: false,
  description: '写操作必填，8–128字符；读取可省略',
})
@AuthorizeInApplicationService()
export class CampusController {
  constructor(
    @Inject(StudentService) readonly students: StudentService,
    @Inject(ReporterQualityService) readonly quality: ReporterQualityService,
    @Inject(CompetitionCatalogService) readonly competitions: CompetitionCatalogService,
    @Inject(TeamSeasonService) readonly teams: TeamSeasonService,
  ) {}
  @Get('admin/campus/student-options')
  @ApiOkResponse({ type: StudentCatalogDto })
  studentOptions(@Headers('authorization') auth: string | undefined) {
    return this.students.options(auth)
  }
  @Get('admin/campus/students')
  @ApiQuery({ name: 'query', required: false, type: String })
  @ApiQuery({ name: 'cohort', required: false, type: String })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'kind', required: false, enum: ['students', 'users', 'players'] })
  @ApiQuery({ name: 'collegeName', required: false, type: String })
  @ApiQuery({ name: 'academicYear', required: false, type: String })
  studentsList(
    @Headers('authorization') auth: string | undefined,
    @Query('query') query = '',
    @Query('cohort') cohort = '',
    @Query('page') page = 1,
    @Query('kind') kind = 'students',
    @Query('collegeName') collegeName = '',
    @Query('academicYear') academicYear = '',
    @Req() req: RequestWithId,
  ) {
    return this.students.list(
      auth,
      query,
      cohort,
      page,
      kind,
      req.requestId,
      collegeName,
      academicYear,
    )
  }
  @Get('admin/campus/students/:id')
  student(
    @Headers('authorization') auth: string | undefined,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: RequestWithId,
  ) {
    return this.students.detail(auth, id, req.requestId)
  }
  @Post('admin/campus/students')
  @ApiBody({ type: StudentRecordDto })
  createStudent(
    @Headers('authorization') auth: string | undefined,
    @Headers('idempotency-key') key: string | undefined,
    @Body() body: StudentRecordDto,
    @Req() req: RequestWithId,
  ) {
    return this.students.save(auth, undefined, body, key, req.requestId ?? 'campus')
  }
  @Patch('admin/campus/students/:id')
  @ApiBody({ type: StudentRecordDto })
  editStudent(
    @Headers('authorization') auth: string | undefined,
    @Headers('idempotency-key') key: string | undefined,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: StudentRecordDto,
    @Req() req: RequestWithId,
  ) {
    return this.students.save(auth, id, body, key, req.requestId ?? 'campus')
  }
  @Post('admin/campus/students/:id/user')
  @ApiBody({ type: StudentAccountLinkDto })
  linkUser(
    @Headers('authorization') auth: string | undefined,
    @Headers('idempotency-key') key: string | undefined,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: StudentAccountLinkDto,
    @Req() req: RequestWithId,
  ) {
    return this.students.linkUser(auth, id, body, key, req.requestId ?? 'campus')
  }
  @Post('admin/campus/students/:id/player')
  @ApiBody({ type: StudentPlayerLinkDto })
  linkPlayer(
    @Headers('authorization') auth: string | undefined,
    @Headers('idempotency-key') key: string | undefined,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: StudentPlayerLinkDto,
    @Req() req: RequestWithId,
  ) {
    return this.students.linkPlayer(auth, id, body, key, req.requestId ?? 'campus')
  }
  @Patch('admin/campus/users/:id/profile')
  @ApiBody({ type: CampusProfileDto })
  editUser(
    @Headers('authorization') auth: string | undefined,
    @Headers('idempotency-key') key: string | undefined,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: CampusProfileDto,
    @Req() req: RequestWithId,
  ) {
    return this.students.editUser(auth, id, body, key, req.requestId ?? 'campus')
  }
  @Get('me/campus-profile') me(@Headers('authorization') auth: string | undefined) {
    return this.students.me(auth)
  }
  @Post('admin/campus/students/:id/player-profile')
  @ApiBody({ type: CampusVersionDto })
  createPlayer(
    @Headers('authorization') auth: string | undefined,
    @Headers('idempotency-key') key: string | undefined,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: CampusVersionDto,
    @Req() req: RequestWithId,
  ) {
    return this.students.createPlayer(auth, id, body, key, req.requestId ?? 'campus')
  }
  @Patch('admin/campus/players/:id/profile')
  @ApiBody({ type: CampusPlayerDto })
  editPlayer(
    @Headers('authorization') auth: string | undefined,
    @Headers('idempotency-key') key: string | undefined,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: CampusPlayerDto,
    @Req() req: RequestWithId,
  ) {
    return this.students.editPlayer(auth, id, body, key, req.requestId ?? 'campus')
  }
  @Post('admin/campus/profile-media')
  @ApiBody({ type: CampusMediaDto })
  uploadMedia(
    @Headers('authorization') auth: string | undefined,
    @Headers('idempotency-key') key: string | undefined,
    @Body() body: CampusMediaDto,
    @Req() req: RequestWithId,
  ) {
    return this.students.uploadMedia(auth, body, key, req.requestId ?? 'campus')
  }
  @Post('me/campus/onboarding')
  @ApiBody({ type: CampusOnboardingDto })
  onboarding(
    @Headers('authorization') auth: string | undefined,
    @Headers('idempotency-key') key: string | undefined,
    @Body() body: CampusOnboardingDto,
    @Req() req: RequestWithId,
  ) {
    return this.students.onboarding(auth, body, key, req.requestId ?? 'campus')
  }
  @Get('me/reporter-quality') myQuality(@Headers('authorization') auth: string | undefined) {
    return this.quality.me(auth)
  }
  @Get('admin/campus/reporters') reporters(@Headers('authorization') auth: string | undefined) {
    return this.quality.list(auth)
  }
  @Get('matches/:id/correction-context') correctionContext(
    @Headers('authorization') auth: string | undefined,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.quality.context(auth, id)
  }
  @Post('matches/:id/corrections')
  @ApiBody({ type: ReporterCaseDto })
  correction(
    @Headers('authorization') auth: string | undefined,
    @Headers('idempotency-key') key: string | undefined,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: ReporterCaseDto,
    @Req() req: RequestWithId,
  ) {
    return this.quality.createCase(auth, id, body, key, req.requestId ?? 'campus')
  }
  @Post('admin/campus/corrections/:id/review')
  @ApiBody({ type: ReporterReviewDto })
  reviewCorrection(
    @Headers('authorization') auth: string | undefined,
    @Headers('idempotency-key') key: string | undefined,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: ReporterReviewDto,
    @Req() req: RequestWithId,
  ) {
    return this.quality.review(auth, id, body, key, req.requestId ?? 'campus')
  }
  @Post('me/reporter-corrections/:id/appeal')
  @ApiBody({ type: ReporterAppealDto })
  appeal(
    @Headers('authorization') auth: string | undefined,
    @Headers('idempotency-key') key: string | undefined,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: ReporterAppealDto,
    @Req() req: RequestWithId,
  ) {
    return this.quality.appeal(auth, id, body, key, req.requestId ?? 'campus')
  }
  @Post('me/reporter-reinstatements')
  @ApiBody({ type: ReporterReinstatementDto })
  apply(
    @Headers('authorization') auth: string | undefined,
    @Headers('idempotency-key') key: string | undefined,
    @Body() body: ReporterReinstatementDto,
    @Req() req: RequestWithId,
  ) {
    return this.quality.applyReinstatement(auth, body, key, req.requestId ?? 'campus')
  }
  @Post('admin/campus/reinstatements/:id/review')
  @ApiBody({ type: ReporterReinstateReviewDto })
  reviewReinstatement(
    @Headers('authorization') auth: string | undefined,
    @Headers('idempotency-key') key: string | undefined,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: ReporterReinstateReviewDto,
    @Req() req: RequestWithId,
  ) {
    return this.quality.reviewReinstatement(auth, id, body, key, req.requestId ?? 'campus')
  }
  @Get('admin/campus/competitions') catalog(@Headers('authorization') auth: string | undefined) {
    return this.competitions.admin(auth)
  }
  @Get('admin/campus/team-seasons')
  @ApiQuery({ name: 'tournamentId', required: false, type: String, format: 'uuid' })
  teamSeasons(
    @Headers('authorization') auth: string | undefined,
    @Query('tournamentId') tournamentId = '',
  ) {
    return this.teams.list(auth, tournamentId)
  }
  @Patch('admin/campus/team-seasons/:id')
  @ApiBody({ type: CampusSeasonTeamDto })
  saveTeamSeason(
    @Headers('authorization') auth: string | undefined,
    @Headers('idempotency-key') key: string | undefined,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: CampusSeasonTeamDto,
    @Req() req: RequestWithId,
  ) {
    return this.teams.save(auth, id, body, key, req.requestId ?? 'campus')
  }
  @Post('admin/campus/competitions/:id/seasons/:seasonId')
  @ApiBody({ type: CampusReasonDto })
  createInstance(
    @Headers('authorization') auth: string | undefined,
    @Headers('idempotency-key') key: string | undefined,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('seasonId', ParseUUIDPipe) seasonId: string,
    @Body() body: CampusReasonDto,
    @Req() req: RequestWithId,
  ) {
    return this.competitions.createInstance(
      auth,
      id,
      seasonId,
      body,
      key,
      req.requestId ?? 'campus',
    )
  }
}

@Controller('public')
@ApiTags('campus')
export class CampusPublicController {
  constructor(@Inject(CompetitionCatalogService) readonly service: CompetitionCatalogService) {}
  @Get('competition-catalog')
  @ApiHeader({ name: 'X-Organization-Id', required: true })
  @ApiOperation({ summary: '读取独立赛事目录与赛季，可用组合与空组合明确区分' })
  catalog(@Req() req: RequestWithId) {
    return this.service.catalog(getOrganizationId(req))
  }
}
