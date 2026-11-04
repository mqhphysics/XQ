import { Type } from 'class-transformer'
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsUUID,
  Max,
  Min,
  ValidateNested,
} from 'class-validator'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { PostSummaryDto } from '../experience/post-response.dto'
export class FeedQueryDto {
  @ApiPropertyOptional({ format: 'uuid' }) @IsOptional() @IsUUID() tournamentId?: string
  @ApiPropertyOptional({ format: 'uuid' }) @IsOptional() @IsUUID() competitionId?: string
  @ApiPropertyOptional({ format: 'uuid' }) @IsOptional() @IsUUID() seasonId?: string
  @ApiPropertyOptional({ format: 'uuid' }) @IsOptional() @IsUUID() batchId?: string
  @ApiPropertyOptional({ format: 'uuid' }) @IsOptional() @IsUUID() refresh?: string
  @ApiPropertyOptional({ minimum: 0, maximum: 400 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(400)
  cursor?: number
}
export class FeedEventDto {
  @ApiProperty({ format: 'uuid' }) @IsUUID() eventId!: string
  @ApiProperty({ format: 'uuid' }) @IsUUID() postId!: string
  @ApiPropertyOptional({ format: 'uuid' }) @IsOptional() @IsUUID() batchId?: string
  @ApiProperty({ enum: ['IMPRESSION', 'READ'] }) @IsIn(['IMPRESSION', 'READ']) kind!:
    | 'IMPRESSION'
    | 'READ'
  @ApiProperty({ minimum: 0, maximum: 120000 })
  @IsInt()
  @Min(0)
  @Max(120000)
  durationMs!: number
}
export class FeedEventsDto {
  @ApiProperty({ type: [FeedEventDto], maxItems: 25 })
  @IsArray()
  @ArrayMaxSize(25)
  @ValidateNested({ each: true })
  @Type(() => FeedEventDto)
  events!: FeedEventDto[]
}
export class FeedResponseDto {
  @ApiProperty({ type: [PostSummaryDto] }) items!: PostSummaryDto[]
  @ApiProperty({ format: 'uuid' }) batchId!: string
  @ApiProperty({ format: 'uuid' }) tournamentId!: string
  @ApiProperty({ type: Number, nullable: true }) nextCursor!: number | null
  @ApiProperty() algorithm!: string
  @ApiProperty({ enum: ['READY', 'TRAINING', 'COLD'] }) modelState!: 'READY' | 'TRAINING' | 'COLD'
  @ApiProperty({ type: String, nullable: true }) modelVersion!: string | null
}
export class FeedEventsResponseDto {
  @ApiProperty() accepted!: number
}
