import { Controller, Get, Header, Headers, Inject, Req } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import type { RequestWithId } from '../common/request-context'
import { AccountCapabilitiesService } from './account-capabilities.service'
import { ProductConfigService } from './product-config.service'

@ApiTags('product-config')
@Controller()
export class ProductConfigController {
  constructor(
    @Inject(ProductConfigService) private readonly configuration: ProductConfigService,
    @Inject(AccountCapabilitiesService) private readonly capabilities: AccountCapabilitiesService,
  ) {}

  @Get('product/config')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: '匿名读取产品开关；不返回组织、账号或业务数据，不授予权限' })
  getConfiguration() {
    return this.configuration.getConfiguration()
  }

  @Get('me/capabilities')
  @ApiBearerAuth()
  @ApiOperation({ summary: '验证当前会话后读取组织内操作能力；命令仍重新鉴权' })
  getCapabilities(
    @Headers('authorization') authorization: string | undefined,
    @Req() request: RequestWithId,
  ) {
    return this.capabilities.get(authorization, request)
  }
}
