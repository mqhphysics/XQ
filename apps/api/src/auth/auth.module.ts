import { Global, Module } from '@nestjs/common'
import { APP_GUARD } from '@nestjs/core'

import { DatabaseModule } from '../database/database.module'
import { AccessPolicyService } from './access-policy.service'
import { AuthContextGuard } from './auth-context.guard'
import { AdminIdentityController } from './admin-identity.controller'
import { AuthController } from './auth.controller'
import { AuthService } from './auth.service'
import { EmailCodeService } from './email-code.service'
import { MailService } from './mail.service'
import { EmailChangeController } from './email-change.controller'
import { EmailChangeService } from './email-change.service'
import { TestRoleController } from './test-role.controller'

@Global()
@Module({
  imports: [DatabaseModule],
  controllers: [AuthController, AdminIdentityController, EmailChangeController, TestRoleController],
  exports: [AuthService, AccessPolicyService],
  providers: [
    AuthService,
    AccessPolicyService,
    EmailCodeService,
    MailService,
    EmailChangeService,
    { provide: APP_GUARD, useClass: AuthContextGuard },
  ],
})
export class AuthModule {}
