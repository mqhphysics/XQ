import { Type } from 'class-transformer'
import {
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  Min,
  ValidateNested,
  ValidateIf,
  IsUUID,
} from 'class-validator'
import { PlayerPosition, DominantFoot } from '../generated/prisma/client'

export class SelfPlayerPatchDto {
  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @Length(2, 120)
  displayName?: string
  @IsOptional() @IsString() @Length(0, 120) jerseyName?: string | null
  @IsOptional() @IsIn(Object.values(PlayerPosition)) position?: PlayerPosition | null
  @IsOptional() @IsIn(Object.values(PlayerPosition)) secondaryPosition?: PlayerPosition | null
  @IsOptional() @IsIn(Object.values(DominantFoot)) dominantFoot?: DominantFoot | null
  @IsOptional() @Type(() => Number) @IsInt() @Min(50) @Max(250) heightCm?: number | null
  @IsOptional() @IsString() @Length(0, 32) academicYear?: string | null
  @IsOptional() @IsString() @Length(0, 120) major?: string | null
  @IsOptional() @IsString() @Length(0, 120) hometown?: string | null
  @IsOptional() @IsString() @Length(0, 600) bio?: string | null
  @IsOptional() @Matches(/^#[0-9a-fA-F]{6}$/) profileColor?: string | null
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(100) ratingShooting?: number | null
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(100) ratingSpeed?: number | null
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(100) ratingDribbling?: number | null
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(100) ratingPassing?: number | null
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(100) ratingDefending?: number | null
}
export class SelfPlayerProfileDto {
  @IsUUID() playerId!: string
  @IsISO8601() expectedUpdatedAt!: string
  @ValidateNested() @Type(() => SelfPlayerPatchDto) patch!: SelfPlayerPatchDto
}
