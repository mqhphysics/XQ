import { ApiProperty } from '@nestjs/swagger'
import type { DependencyHealth, LivenessResponse, ReadinessResponse } from '@xiaoqiu/contracts'

export class DependencyHealthDto implements DependencyHealth {
  @ApiProperty({ type: String, enum: ['ok', 'down'], example: 'ok' })
  status!: DependencyHealth['status']

  @ApiProperty({ type: Number, example: 3.21, minimum: 0 })
  latencyMs!: number
}

export class LivenessResponseDto implements LivenessResponse {
  @ApiProperty({ type: String, enum: ['api'], example: 'api' })
  service!: 'api'

  @ApiProperty({ type: String, enum: ['ok'], example: 'ok' })
  status!: 'ok'

  @ApiProperty({ type: String, example: '0.1.0' })
  version!: string

  @ApiProperty({
    type: String,
    example: '2026-06-10T15:00:00.000Z',
    format: 'date-time',
  })
  timestamp!: string

  @ApiProperty({ type: String, example: 'f47ac10b-58cc-4372-a567-0e02b2c3d479' })
  requestId!: string
}

export class ReadinessResponseDto extends LivenessResponseDto implements ReadinessResponse {
  @ApiProperty({ type: () => DependencyHealthDto })
  database!: DependencyHealthDto
}
