import { Type } from 'class-transformer'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsDefined,
  IsObject,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  Min,
  ValidateNested,
} from 'class-validator'

export class LineupSlotDto {
  @ApiProperty({ type: String })
  @IsString()
  @Length(1, 32)
  slotId!: string
  @ApiProperty({ type: String })
  @IsString()
  @Length(1, 12)
  label!: string
  @ApiProperty({ type: Number, minimum: 0, maximum: 100 })
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(0)
  @Max(100)
  x!: number
  @ApiProperty({ type: Number, minimum: 0, maximum: 100 })
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(0)
  @Max(100)
  y!: number
  @ApiPropertyOptional({ type: String, format: 'uuid', nullable: true })
  @IsOptional()
  @IsUUID()
  playerId!: string | null
}

export class LineupPayloadDto {
  @ApiPropertyOptional({
    type: String,
    format: 'uuid',
    nullable: true,
    description: '本场或默认阵容队长；不授予账号管理权限',
  })
  @IsOptional()
  @IsUUID()
  captainPlayerId?: string | null
  @ApiProperty({ type: String })
  @IsString()
  @Length(1, 32)
  formation!: string
  @ApiProperty({ enum: [8] })
  @IsIn([8])
  format!: 8
  @ApiProperty({ type: () => [LineupSlotDto] })
  @IsArray()
  @ArrayMinSize(8)
  @ArrayMaxSize(8)
  @ValidateNested({ each: true })
  @Type(() => LineupSlotDto)
  slots!: LineupSlotDto[]
  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMaxSize(100)
  @IsUUID(undefined, { each: true })
  benchPlayerIds!: string[]
}

export class SaveLineupPlanDto {
  @ApiPropertyOptional({ type: String, format: 'uuid' })
  @IsOptional()
  @IsUUID()
  planId?: string
  @ApiProperty({ type: String })
  @IsString()
  @Length(1, 60)
  name!: string
  @ApiProperty({ enum: ['TACTIC', 'MATCH_LINEUP'] })
  @IsIn(['TACTIC', 'MATCH_LINEUP'])
  kind!: 'TACTIC' | 'MATCH_LINEUP'
  @ApiProperty({ type: Number, minimum: 0 })
  @IsInt()
  @Min(0)
  @Max(2147483646)
  expectedVersion!: number
  @ApiPropertyOptional({ type: String, format: 'uuid', nullable: true })
  @IsOptional()
  @IsUUID()
  tournamentId?: string | null
  @ApiPropertyOptional({ type: String, format: 'uuid', nullable: true })
  @IsOptional()
  @IsUUID()
  matchId?: string | null
  @ApiPropertyOptional({ type: String, format: 'uuid', nullable: true })
  @IsOptional()
  @IsUUID()
  rosterSnapshotId?: string | null
  @ApiProperty({ type: () => LineupPayloadDto })
  @IsDefined()
  @IsObject()
  @ValidateNested()
  @Type(() => LineupPayloadDto)
  payload!: LineupPayloadDto
}

export class LineupPlanCommandDto {
  @ApiProperty({ type: Number, minimum: 1 })
  @IsInt()
  @Min(1)
  @Max(2147483646)
  expectedVersion!: number
}
