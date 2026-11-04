import { Body, Controller, Get, Headers, HttpCode, Inject, Ip, Post, Req } from '@nestjs/common'
import { ApiProperty, ApiTags } from '@nestjs/swagger'
import { IsIn } from 'class-validator'
import { getRequestId, type RequestWithId } from '../common/request-context'
import { AuthService } from './auth.service'
import { TEST_ROLES, type TestRole } from './test-role-policy'

class SwitchTestRoleDto {
  @ApiProperty({ enum: TEST_ROLES.map((role) => role.id) })
  @IsIn(TEST_ROLES.map((role) => role.id))
  role!: TestRole
}

@ApiTags('auth')
@Controller('auth/test-roles')
export class TestRoleController {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}

  @Get()
  list(@Headers('authorization') authorization: string | undefined) {
    return this.auth.listTestRoles(authorization)
  }

  @Post('switch')
  @HttpCode(200)
  switch(
    @Headers('authorization') authorization: string | undefined,
    @Body() body: SwitchTestRoleDto,
    @Ip() ip: string,
    @Req() request: RequestWithId,
  ) {
    return this.auth.switchTestRole(authorization, body.role, {
      ip,
      userAgent: request.headers['user-agent'],
      requestId: getRequestId(request),
    })
  }
}
