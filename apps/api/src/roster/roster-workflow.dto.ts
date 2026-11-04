import { Type } from 'class-transformer'
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  Min,
  ValidateNested,
} from 'class-validator'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'

export class RosterWorkflowPlayerDto {
  @ApiProperty({ type: String, format: 'uuid' })
  @IsUUID()
  playerId!: string

  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @IsString()
  @Length(1, 16)
  shirtNumber!: string | null
}

export class RosterWorkflowCommandDto {
  @ApiProperty({ enum: ['SAVE', 'SUBMIT', 'RETURN', 'APPROVE', 'LOCK', 'REOPEN'] })
  @IsIn(['SAVE', 'SUBMIT', 'RETURN', 'APPROVE', 'LOCK', 'REOPEN'])
  action!: 'SAVE' | 'SUBMIT' | 'RETURN' | 'APPROVE' | 'LOCK' | 'REOPEN'

  @ApiProperty({ type: Number, minimum: 0 })
  @IsInt()
  @Min(0)
  @Max(2147483646)
  expectedVersion!: number

  @ApiPropertyOptional({ type: () => [RosterWorkflowPlayerDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => RosterWorkflowPlayerDto)
  players?: RosterWorkflowPlayerDto[]

  @ApiPropertyOptional({ type: String, maxLength: 500 })
  @IsOptional()
  @IsString()
  @Length(1, 500)
  reason?: string
}
