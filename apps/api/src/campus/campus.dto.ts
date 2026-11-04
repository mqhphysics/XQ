import { Type, Transform } from 'class-transformer'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { CCNU_COLLEGES } from './student-catalog'
import {
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  IsISO8601,
  Matches,
  Length,
  Min,
  Max,
  ArrayMaxSize,
} from 'class-validator'

export class CampusReasonDto {
  @ApiProperty({ description: '操作原因', minLength: 2, maxLength: 1000 })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(2, 1000)
  reason!: string
}
export class CampusVersionDto extends CampusReasonDto {
  @ApiProperty({ minimum: 1 }) @Type(() => Number) @IsInt() @Min(1) expectedVersion!: number
}
export class StudentRecordDto {
  @ApiPropertyOptional({ description: '新增时可不填；修改已有档案时需说明原因' })
  @IsOptional()
  @IsString()
  @Length(0, 1000)
  reason: string = ''
  @ApiProperty({ description: '学生姓名' }) @IsString() @Length(2, 120) realName!: string
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: '组织内唯一的10位学号；尚未提供时留空，不推测或补零',
  })
  @IsOptional()
  @Transform(({ value }) => (value === '' ? null : value))
  @IsString()
  @Length(10, 10)
  @Matches(/^20\d{8}$/)
  studentNumber?: string | null
  @ApiProperty({ enum: ['MALE', 'FEMALE', 'UNSPECIFIED'] })
  @IsIn(['MALE', 'FEMALE', 'UNSPECIFIED'])
  gender!: string
  @ApiPropertyOptional({ enum: ['', ...CCNU_COLLEGES] })
  @IsOptional()
  @IsString()
  @IsIn(['', ...CCNU_COLLEGES])
  collegeName?: string
  @ApiPropertyOptional({ description: '有学号时自动按前四位生成，如2025级；无学号时可选择年级' })
  @IsOptional()
  @IsString()
  @Matches(/^$|^20\d{2}级$/)
  academicYear?: string
  @ApiPropertyOptional({ minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  expectedVersion?: number
  @ApiPropertyOptional({ enum: ['ACTIVE', 'PENDING', 'ARCHIVED'] })
  @IsOptional()
  @IsIn(['ACTIVE', 'PENDING', 'ARCHIVED'])
  status?: string
}
export class StudentCatalogDto {
  @ApiProperty({ type: [String], enum: CCNU_COLLEGES }) colleges!: string[]
  @ApiProperty({ type: [String] }) academicYears!: string[]
  @ApiProperty() collegeSource!: string
  @ApiProperty() checkedOn!: string
}
export class StudentAccountLinkDto extends CampusVersionDto {
  @ApiProperty({ format: 'uuid' }) @IsUUID() userId!: string
}
export class StudentPlayerLinkDto extends CampusVersionDto {
  @ApiProperty({ format: 'uuid' }) @IsUUID() playerId!: string
}
export class CampusOnboardingDto {
  @ApiProperty({ enum: ['TUTORIAL_COMPLETE', 'CONFIRM_PLAYER', 'DISMISS_PLAYER'] })
  @IsIn(['TUTORIAL_COMPLETE', 'CONFIRM_PLAYER', 'DISMISS_PLAYER'])
  action!: string
  @ApiPropertyOptional({ format: 'uuid' }) @IsOptional() @IsUUID() playerId?: string
}
export class CampusProfileDto extends CampusReasonDto {
  @ApiProperty({ format: 'date-time' }) @IsISO8601() expectedUpdatedAt!: string
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(1, 120) displayName?: string
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(0, 280) bio?: string
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(0, 512) avatarUrl?: string
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(0, 512) coverUrl?: string
}
export class CampusMediaDto extends CampusReasonDto {
  @ApiProperty({ enum: ['USER', 'PLAYER'] }) @IsIn(['USER', 'PLAYER']) targetType!:
    | 'USER'
    | 'PLAYER'
  @ApiProperty({ format: 'uuid' }) @IsUUID() targetId!: string
  @ApiProperty({ enum: ['AVATAR', 'COVER', 'PORTRAIT'] })
  @IsIn(['AVATAR', 'COVER', 'PORTRAIT'])
  slot!: 'AVATAR' | 'COVER' | 'PORTRAIT'
  @ApiProperty({ format: 'date-time' }) @IsISO8601() expectedUpdatedAt!: string
  @ApiProperty({ description: '裁剪压缩后的图片Data URL' })
  @IsString()
  @Length(32, 8_388_640)
  dataUrl!: string
}
export class CampusPlayerDto extends CampusReasonDto {
  @ApiProperty({ format: 'date-time' }) @IsISO8601() expectedUpdatedAt!: string
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(0, 120) jerseyName?: string
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(0, 600) bio?: string
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(0, 120) major?: string
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(0, 120) hometown?: string
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(0, 32) academicYear?: string
  @ApiPropertyOptional({ enum: ['GOALKEEPER', 'DEFENDER', 'MIDFIELDER', 'FORWARD'] })
  @IsOptional()
  @IsIn(['GOALKEEPER', 'DEFENDER', 'MIDFIELDER', 'FORWARD'])
  position?: 'GOALKEEPER' | 'DEFENDER' | 'MIDFIELDER' | 'FORWARD'
  @ApiPropertyOptional({ enum: ['LEFT', 'RIGHT', 'BOTH'] })
  @IsOptional()
  @IsIn(['LEFT', 'RIGHT', 'BOTH'])
  dominantFoot?: 'LEFT' | 'RIGHT' | 'BOTH'
  @ApiPropertyOptional({ minimum: 80, maximum: 250 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(80)
  @Max(250)
  heightCm?: number
  @ApiPropertyOptional({ minimum: 0, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  ratingShooting?: number
  @ApiPropertyOptional({ minimum: 0, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  ratingSpeed?: number
  @ApiPropertyOptional({ minimum: 0, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  ratingDribbling?: number
  @ApiPropertyOptional({ minimum: 0, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  ratingPassing?: number
  @ApiPropertyOptional({ minimum: 0, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  ratingDefending?: number
}
export class CampusSeasonTeamDto extends CampusReasonDto {
  @ApiProperty({ format: 'date-time' }) @IsISO8601() expectedUpdatedAt!: string
  @ApiProperty() @IsString() @Length(1, 160) name!: string
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(0, 80) shortName?: string
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(0, 160) collegeName?: string
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(0, 600) description?: string
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(0, 160) motto?: string
}
export class ReporterCaseDto {
  @ApiProperty({ format: 'uuid' }) @IsUUID() reportRevisionId!: string
  @ApiProperty({ description: '同一报告中的差错位置' })
  @Transform(({ value }) =>
    typeof value === 'string'
      ? value.normalize('NFKC').trim().toLowerCase().replace(/\s+/g, '')
      : value,
  )
  @IsString()
  @Length(3, 120)
  errorKey!: string
  @ApiProperty({ minLength: 8, maxLength: 2000 })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(8, 2000)
  description!: string
  @ApiPropertyOptional({ type: [String], maxItems: 5 })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5)
  @IsString({ each: true })
  @Length(1, 512, { each: true })
  evidence?: string[]
}
export class ReporterReviewDto extends CampusVersionDto {
  @ApiProperty({ enum: ['CONFIRMED', 'DISMISSED', 'OVERTURNED'] })
  @IsIn(['CONFIRMED', 'DISMISSED', 'OVERTURNED'])
  decision!: string
}
export class ReporterAppealDto {
  @ApiProperty({ minLength: 8, maxLength: 2000 })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(8, 2000)
  reason!: string
  @ApiProperty({ minimum: 1 }) @Type(() => Number) @IsInt() @Min(1) expectedVersion!: number
}
export class ReporterReinstatementDto {
  @ApiProperty({ minLength: 8, maxLength: 2000 })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(8, 2000)
  reason!: string
}
export class ReporterReinstateReviewDto extends CampusVersionDto {
  @ApiProperty({ enum: ['APPROVED', 'REJECTED'] }) @IsIn(['APPROVED', 'REJECTED']) decision!: string
}
