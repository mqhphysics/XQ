import {
  Body,
  Controller,
  Get,
  Headers,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
} from '@nestjs/common'
import { ApiBearerAuth, ApiBody, ApiHeader, ApiTags } from '@nestjs/swagger'
import { AuthorizeInApplicationService } from '../auth/application-authorization'
import type { RequestWithId } from '../common/request-context'
import { StudentRegistrationService } from './student-registration.service'
import {
  StudentRegistrationCorrectionDto,
  StudentRegistrationReviewDto,
} from './student-registration.dto'

@Controller()
@ApiTags('campus')
@ApiBearerAuth()
@AuthorizeInApplicationService()
export class StudentRegistrationController {
  constructor(@Inject(StudentRegistrationService) readonly service: StudentRegistrationService) {}
  @Get('admin/campus/registrations') admin(@Headers('authorization') auth?: string) {
    return this.service.list(auth, true)
  }
  @Get('me/campus/registration') mine(@Headers('authorization') auth?: string) {
    return this.service.list(auth, false)
  }
  @Post('admin/campus/registrations/:id/review')
  @ApiHeader({ name: 'Idempotency-Key', required: true, description: '8–128字符的幂等键' })
  @ApiBody({ type: StudentRegistrationReviewDto })
  review(
    @Headers('authorization') auth: string | undefined,
    @Headers('idempotency-key') key: string | undefined,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: StudentRegistrationReviewDto,
    @Req() req: RequestWithId,
  ) {
    return this.service.review(auth, id, body, key, req.requestId ?? 'registration')
  }
  @Post('me/campus/registration')
  @ApiHeader({ name: 'Idempotency-Key', required: true, description: '8–128字符的幂等键' })
  @ApiBody({ type: StudentRegistrationCorrectionDto })
  correct(
    @Headers('authorization') auth: string | undefined,
    @Headers('idempotency-key') key: string | undefined,
    @Body() body: StudentRegistrationCorrectionDto,
    @Req() req: RequestWithId,
  ) {
    return this.service.correct(auth, body, key, req.requestId ?? 'registration')
  }
}
