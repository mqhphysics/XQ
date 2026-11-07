import { Type } from 'class-transformer'
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsUUID,
  Min,
  Max,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
export class TechnicalTotalsDto {
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) @Max(100000) corners?: number
  @ApiProperty() @IsInt() @Min(0) @Max(100000) passSuccess!: number
  @ApiProperty() @IsInt() @Min(0) @Max(100000) passFailure!: number
  @ApiProperty() @IsInt() @Min(0) @Max(100000) tackleSuccess!: number
  @ApiProperty() @IsInt() @Min(0) @Max(100000) tackleFailure!: number
  @ApiProperty() @IsInt() @Min(0) @Max(100000) dribbleSuccess!: number
  @ApiProperty() @IsInt() @Min(0) @Max(100000) dribbleFailure!: number
  @ApiProperty() @IsInt() @Min(0) @Max(100000) shotsOnTarget!: number
  @ApiProperty() @IsInt() @Min(0) @Max(100000) shotsOffTarget!: number
  @ApiProperty() @IsInt() @Min(0) @Max(100000) goals!: number
  @ApiProperty() @IsInt() @Min(0) @Max(100000) unclassifiedShots!: number
  @ApiProperty() @IsInt() @Min(0) @Max(100000) fouls!: number
  @ApiProperty() @IsInt() @Min(0) @Max(100000) yellowCards!: number
  @ApiProperty() @IsInt() @Min(0) @Max(100000) redCards!: number
  @ApiProperty() @IsInt() @Min(0) @Max(100000) chancesCreated!: number
  @ApiProperty() @IsInt() @Min(0) @Max(100000) chancesMissed!: number
}
export class TechnicalStatisticsQueryDto {
  @ApiPropertyOptional({ enum: [1, 2, 3] })
  @IsOptional()
  @Type(() => Number)
  @IsIn([1, 2, 3])
  schemaVersion?: number
}

export class TechnicalOperationDto {
  @ApiProperty({ format: 'uuid' }) @IsUUID() id!: string
  @ApiProperty({ enum: ['COUNT', 'GOAL', 'UNDO', 'SET_TOTALS'] })
  @IsIn(['COUNT', 'GOAL', 'UNDO', 'SET_TOTALS'])
  kind!: 'COUNT' | 'GOAL' | 'UNDO' | 'SET_TOTALS'
  @ApiProperty({ format: 'date-time' }) @IsISO8601({ strict: true }) occurredAt!: string
  @ApiPropertyOptional({ format: 'uuid' }) @IsOptional() @IsUUID() teamId?: string
  @ApiPropertyOptional({ format: 'uuid', nullable: true }) @IsOptional() @IsUUID() playerId?:
    | string
    | null
  @ApiPropertyOptional({ enum: ['PASS', 'TACKLE', 'DRIBBLE', 'SHOT', 'FOUL', 'CHANCE', 'CORNER'] })
  @IsOptional()
  @IsIn(['PASS', 'TACKLE', 'DRIBBLE', 'SHOT', 'FOUL', 'CHANCE', 'CORNER'])
  metric?: 'PASS' | 'TACKLE' | 'DRIBBLE' | 'SHOT' | 'FOUL' | 'CHANCE' | 'CORNER'
  @ApiPropertyOptional({
    enum: [
      'SUCCESS',
      'FAILURE',
      'ATTEMPT',
      'ON_TARGET',
      'OFF_TARGET',
      'GOAL',
      'FOUL',
      'YELLOW_CARD',
      'RED_CARD',
    ],
  })
  @IsOptional()
  @IsIn([
    'SUCCESS',
    'FAILURE',
    'ATTEMPT',
    'ON_TARGET',
    'OFF_TARGET',
    'GOAL',
    'FOUL',
    'YELLOW_CARD',
    'RED_CARD',
  ])
  outcome?:
    | 'SUCCESS'
    | 'FAILURE'
    | 'ATTEMPT'
    | 'ON_TARGET'
    | 'OFF_TARGET'
    | 'GOAL'
    | 'FOUL'
    | 'YELLOW_CARD'
    | 'RED_CARD'
  @ApiPropertyOptional({ format: 'uuid' }) @IsOptional() @IsUUID() shotId?: string
  @ApiPropertyOptional({ format: 'uuid' }) @IsOptional() @IsUUID() targetId?: string
  @ApiPropertyOptional({ type: TechnicalTotalsDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => TechnicalTotalsDto)
  totals?: TechnicalTotalsDto
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(240) reason?: string
}
export class RecordTechnicalStatisticsDto {
  @ApiPropertyOptional({ enum: [1, 2, 3] }) @IsOptional() @IsIn([1, 2, 3]) schemaVersion?: number
  @ApiProperty({ minimum: 0 }) @IsInt() @Min(0) expectedVersion!: number
  @ApiProperty({ type: [TechnicalOperationDto], minItems: 1, maxItems: 100 })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => TechnicalOperationDto)
  operations!: TechnicalOperationDto[]
}
export class TechnicalPlayerDto {
  @ApiProperty() id!: string
  @ApiProperty() displayName!: string
  @ApiProperty({ type: String, nullable: true }) shirtNumber!: string | null
  @ApiPropertyOptional({ type: String, nullable: true }) avatarUrl?: string | null
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    enum: ['GOALKEEPER', 'DEFENDER', 'MIDFIELDER', 'FORWARD'],
  })
  position?: string | null
  @ApiPropertyOptional({
    type: Boolean,
    nullable: true,
    description: 'Starter in the confirmed match lineup; null when none is confirmed.',
  })
  starter?: boolean | null
}
export class TechnicalTeamDto {
  @ApiProperty() id!: string
  @ApiProperty() name!: string
  @ApiProperty() shortName!: string
  @ApiProperty({ type: [TechnicalPlayerDto] }) players!: TechnicalPlayerDto[]
}
export class TechnicalStatisticsResponseDto {
  @ApiProperty() matchId!: string
  @ApiProperty() tournamentId!: string
  @ApiProperty() title!: string
  @ApiProperty() recorderUserId!: string
  @ApiProperty() canRecord!: boolean
  @ApiProperty({ type: String, nullable: true }) reason!: string | null
  @ApiProperty() version!: number
  @ApiProperty({ type: [TechnicalTeamDto] }) teams!: TechnicalTeamDto[]
  @ApiProperty({ type: [TechnicalOperationDto] }) operations!: TechnicalOperationDto[]
}
