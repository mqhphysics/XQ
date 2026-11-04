import { ApiProperty } from '@nestjs/swagger'
import { IsInt, IsString, IsUUID, Length, Matches, Max, Min } from 'class-validator'

export class ProgressionPreviewDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  ruleVersionId!: string
}

export class ProgressionConfirmDto extends ProgressionPreviewDto {
  @ApiProperty({ minimum: 0 })
  @IsInt()
  @Min(0)
  @Max(2147483646)
  expectedVersion!: number

  @ApiProperty({ description: '当前预览来源 SHA-256' })
  @Matches(/^[a-f0-9]{64}$/)
  sourceHash!: string

  @ApiProperty({ maxLength: 500 })
  @IsString()
  @Length(1, 500)
  reason!: string
}
