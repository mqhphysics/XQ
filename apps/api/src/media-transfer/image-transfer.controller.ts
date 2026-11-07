import {
  Body,
  Controller,
  Headers,
  Inject,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Put,
} from '@nestjs/common'
import { ApiBearerAuth, ApiBody, ApiOkResponse, ApiTags } from '@nestjs/swagger'
import { ImageTransferService } from './image-transfer.service'
import { BeginImageTransferDto, ImageTransferDto, ImageTransferPartDto } from './image-transfer.dto'

@ApiTags('image-transfer')
@ApiBearerAuth()
@Controller('me/image-transfers/:id')
export class ImageTransferController {
  constructor(@Inject(ImageTransferService) private readonly transfers: ImageTransferService) {}
  @Put()
  @ApiBody({ type: BeginImageTransferDto })
  @ApiOkResponse({ type: ImageTransferDto })
  begin(
    @Headers('authorization') authorization: string | undefined,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: BeginImageTransferDto,
  ) {
    return this.transfers.begin(authorization, id, body.characters)
  }
  @Put('parts/:index')
  @ApiBody({ type: ImageTransferPartDto })
  @ApiOkResponse({ type: ImageTransferDto })
  part(
    @Headers('authorization') authorization: string | undefined,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('index', ParseIntPipe) index: number,
    @Body() body: ImageTransferPartDto,
  ) {
    return this.transfers.part(authorization, id, index, body.content)
  }
}
