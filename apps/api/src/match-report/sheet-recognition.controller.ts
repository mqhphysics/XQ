import { Body, Controller, Headers, HttpCode, Inject, Param, ParseUUIDPipe, Post } from '@nestjs/common'
import { ApiBearerAuth, ApiBody, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger'
import { AuthorizeInApplicationService } from '../auth/application-authorization'
import { RecognizeMatchSheetDto, RecognizeMatchSheetResponseDto } from './sheet-recognition.dto'
import { SheetRecognitionService } from './sheet-recognition.service'

@ApiTags('match-report')
@ApiBearerAuth()
@Controller('matches/:matchId/report')
@AuthorizeInApplicationService()
export class SheetRecognitionController {
  constructor(@Inject(SheetRecognitionService) private readonly recognition: SheetRecognitionService) {}

  @Post('recognize-sheet')
  @HttpCode(200)
  @ApiBody({ type: RecognizeMatchSheetDto })
  @ApiOkResponse({ type: RecognizeMatchSheetResponseDto })
  @ApiOperation({ summary: '使用当前组织的AI连接识别四官表，仅返回待核对字段，不保存或发布' })
  recognize(
    @Headers('authorization') authorization: string | undefined,
    @Param('matchId', ParseUUIDPipe) matchId: string,
    @Body() body: RecognizeMatchSheetDto,
  ) {
    return this.recognition.recognize(authorization, matchId, body)
  }
}
