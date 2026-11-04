import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Length,
  Min,
  MaxLength,
  IsUUID,
} from 'class-validator'

export class AiProviderDto {
  @ApiPropertyOptional({ format: 'uuid' }) @IsOptional() @IsUUID() id?: string
  @ApiProperty() @IsString() @Length(1, 80) name!: string
  @ApiProperty({ enum: ['DEEPSEEK', 'QWEN', 'GLM', 'DOUBAO', 'CUSTOM'] })
  @IsIn(['DEEPSEEK', 'QWEN', 'GLM', 'DOUBAO', 'CUSTOM'])
  provider!: string
  @ApiProperty() @IsString() @Length(1, 512) baseUrl!: string
  @ApiProperty() @IsString() @Length(0, 120) model!: string
  @ApiProperty({ enum: ['CHAT_COMPLETIONS', 'REVIEW_GATEWAY'] })
  @IsIn(['CHAT_COMPLETIONS', 'REVIEW_GATEWAY'])
  protocol!: 'CHAT_COMPLETIONS' | 'REVIEW_GATEWAY'
  @ApiPropertyOptional({ description: '仅写入；已保存连接留空保留' })
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  apiKey?: string
  @ApiPropertyOptional() @IsOptional() @IsBoolean() clearKey?: boolean
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) expectedVersion?: number
}
export class AiRulesDto {
  @ApiProperty() @IsBoolean() enabled!: boolean
  @ApiProperty() @IsInt() @Min(0) expectedVersion!: number
  @ApiProperty({ type: Object }) @IsObject() policies!: Record<string, unknown>
}
export class AiModerationConfigDto {
  @ApiProperty() @IsBoolean() enabled!: boolean
  @ApiProperty() @IsString() @Length(0, 512) baseUrl!: string
  @ApiProperty() @IsString() @Length(0, 120) model!: string
  @ApiProperty({ enum: ['CHAT_COMPLETIONS', 'REVIEW_GATEWAY'] })
  @IsIn(['CHAT_COMPLETIONS', 'REVIEW_GATEWAY'])
  protocol!: 'CHAT_COMPLETIONS' | 'REVIEW_GATEWAY'
  @ApiPropertyOptional({ description: '新密钥，仅写入；留空保留原密钥' })
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  apiKey?: string
  @ApiPropertyOptional() @IsOptional() @IsBoolean() clearKey?: boolean
  @ApiProperty() @IsInt() @Min(0) expectedVersion!: number
  @ApiProperty({ type: Object }) @IsObject() policies!: Record<string, unknown>
}
export class AiModerationDecisionDto {
  @ApiProperty({ enum: ['ALLOW', 'BLOCK'] }) @IsIn(['ALLOW', 'BLOCK']) decision!: 'ALLOW' | 'BLOCK'
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) reason?: string
}
