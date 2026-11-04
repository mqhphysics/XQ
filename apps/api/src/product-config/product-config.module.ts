import { Module } from '@nestjs/common'
import { APP_GUARD } from '@nestjs/core'
import { AuthModule } from '../auth/auth.module'
import { DatabaseModule } from '../database/database.module'
import { AccountCapabilitiesService } from './account-capabilities.service'
import { ProductConfigController } from './product-config.controller'
import { ProductConfigService } from './product-config.service'
import { ProductModuleGuard } from './product-module.guard'

@Module({
  imports: [AuthModule, DatabaseModule],
  controllers: [ProductConfigController],
  providers: [
    ProductConfigService,
    AccountCapabilitiesService,
    { provide: APP_GUARD, useClass: ProductModuleGuard },
  ],
  exports: [ProductConfigService, AccountCapabilitiesService],
})
export class ProductConfigModule {}
