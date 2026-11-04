import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { ERROR_CODES, type ApiErrorResponse } from '@xiaoqiu/contracts'

export class ApiErrorResponseDto implements ApiErrorResponse {
  @ApiProperty({
    type: String,
    enum: Object.values(ERROR_CODES),
    example: ERROR_CODES.VALIDATION_FAILED,
  })
  code!: ApiErrorResponse['code']

  @ApiProperty({ type: String, example: '请求参数校验失败' })
  message!: string

  @ApiProperty({ type: String, example: 'f47ac10b-58cc-4372-a567-0e02b2c3d479' })
  requestId!: string

  @ApiPropertyOptional({
    additionalProperties: true,
    type: 'object',
  })
  details?: Record<string, unknown>
}
