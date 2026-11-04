import { Transform, Type } from 'class-transformer'
import { ApiProperty } from '@nestjs/swagger'
import { IsIn, IsInt, IsOptional, IsString, IsUUID, Length, Min, MaxLength } from 'class-validator'

export const IDENTITY_KINDS = [
  'STUDENT',
  'PLAYER',
  'TEAM_CAPTAIN',
  'TEAM_COACH',
  'MATCH_REPORTER',
  'TOURNAMENT_ADMIN',
] as const
export type IdentityKind = (typeof IDENTITY_KINDS)[number]

export class IdentityApplicationDto {
  @IsIn(IDENTITY_KINDS)
  kind!: IdentityKind

  @IsOptional()
  @IsString()
  @Length(40, 43)
  candidateId?: string

  @IsOptional()
  @IsUUID()
  teamId?: string

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(8, 1000)
  message!: string
}

export class IdentityReviewDto {
  @ApiProperty({ required: false, enum: ['MATCH', 'TOURNAMENT'], description: '无任职候选时，管理员为信息员或赛事管理员指定范围' })
  @IsOptional()
  @IsIn(['MATCH', 'TOURNAMENT'])
  scopeType?: 'MATCH' | 'TOURNAMENT'

  @ApiProperty({ required: false, format: 'uuid' })
  @IsOptional()
  @IsUUID()
  scopeId?: string

  @ApiProperty({ enum: ['APPROVED', 'REJECTED'] })
  @IsIn(['APPROVED', 'REJECTED'])
  decision!: 'APPROVED' | 'REJECTED'

  @ApiProperty({ minimum: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  expectedVersion!: number

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @Length(40, 43)
  resolvedCandidateId?: string

  @ApiProperty({ required: false, maxLength: 1000, description: '通过可留空，拒绝需至少两字原因' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string
}

export class IdentityRecordDto {
  @IsOptional()
  @IsUUID()
  verifiedUserId?: string
  @IsIn(IDENTITY_KINDS)
  kind!: IdentityKind

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(2, 120)
  displayName!: string

  @IsOptional()
  @IsUUID()
  teamId?: string

  @IsOptional()
  @IsUUID()
  playerProfileId?: string

  @IsOptional()
  @IsIn(['MATCH', 'TOURNAMENT'])
  scopeType?: 'MATCH' | 'TOURNAMENT'

  @IsOptional()
  @IsUUID()
  scopeId?: string

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(8, 1000)
  reason!: string
}

export class ConfirmIdentityDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().replace(/^record:/i, '') : value))
  @IsUUID()
  recordId!: string
  @Type(() => Number)
  @IsInt()
  @Min(1)
  expectedVersion!: number
}

export class RevokeIdentityRecordDto {
  // Both pending verified and active records can be withdrawn by administrators.
  @Type(() => Number)
  @IsInt()
  @Min(1)
  expectedVersion!: number

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(8, 1000)
  reason!: string
}
export class VerifyIdentityUserDto {
  @IsUUID() verifiedUserId!: string
  @Type(() => Number) @IsInt() @Min(1) expectedVersion!: number
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(8, 1000)
  reason!: string
}
