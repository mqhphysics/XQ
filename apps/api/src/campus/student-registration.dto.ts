import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsIn, IsInt, IsOptional, IsString, IsUUID, Length, Matches, Min } from 'class-validator'
import { Transform, Type } from 'class-transformer'
import { CampusVersionDto } from './campus.dto'

export class StudentRegistrationReviewDto extends CampusVersionDto {
  @ApiPropertyOptional({
    enum: [7, 14],
    default: 14,
    description: '退回后建议更正期限；不会自动封禁',
  })
  @IsOptional()
  @IsIn([7, 14])
  deadlineDays?: 7 | 14
  @ApiProperty({ enum: ['APPROVE', 'RETURN'] }) @IsIn(['APPROVE', 'RETURN']) decision!:
    | 'APPROVE'
    | 'RETURN'
  @ApiPropertyOptional({
    format: 'uuid',
    description: '只有重名歧义时需要选择；唯一姓名的待补学号档案由服务端确定',
  })
  @IsOptional()
  @IsUUID()
  studentRecordId?: string
}
export class StudentRegistrationCorrectionDto {
  @ApiProperty({ minimum: 0, description: '无历史申请时使用0，否则使用最新申请版本' })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  expectedVersion!: number
  @ApiPropertyOptional({ description: '申请更正后的真实姓名；旧客户端省略时沿用当前姓名' })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.normalize('NFKC').trim() : value))
  @IsString()
  @Length(2, 120)
  realName?: string
  @ApiPropertyOptional({ description: '选填的更正说明', maxLength: 500 })
  @IsOptional()
  @IsString()
  @Length(0, 500)
  reason?: string
  @ApiProperty({ description: '本人填写的学号，经管理员核验后才写入学生档案' })
  @IsString()
  @Length(10, 10)
  @Matches(/^20\d{8}$/)
  studentNumber!: string
}

export class RegistrationApplicantDto {
  @ApiProperty() id!: string
  @ApiProperty({ nullable: true, type: String }) realName!: string | null
  @ApiProperty() displayName!: string
  @ApiProperty({ nullable: true, type: String }) loginNameNormalized!: string | null
}
export class RegistrationCandidateUserDto {
  @ApiProperty() id!: string
}
export class StudentRegistrationCandidateDto {
  @ApiProperty() id!: string
  @ApiProperty() realName!: string
  @ApiProperty({ nullable: true, type: String }) studentNumber!: string | null
  @ApiProperty() collegeName!: string
  @ApiProperty() version!: number
  @ApiProperty({ nullable: true, type: () => RegistrationCandidateUserDto })
  user!: RegistrationCandidateUserDto | null
}
export class StudentRegistrationItemDto {
  @ApiProperty() id!: string
  @ApiProperty() version!: number
  @ApiProperty() status!: string
  @ApiProperty() realName!: string
  @ApiProperty() studentNumber!: string
  @ApiProperty() reason!: string
  @ApiProperty({ nullable: true, type: String }) decisionNote!: string | null
  @ApiProperty({ type: String, format: 'date-time' }) createdAt!: Date
  @ApiProperty({ type: () => RegistrationApplicantDto }) user!: RegistrationApplicantDto
  @ApiPropertyOptional({ type: () => [StudentRegistrationCandidateDto] })
  candidates?: StudentRegistrationCandidateDto[]
  @ApiProperty({ nullable: true, type: String }) currentStudentRecordId!: string | null
}
export class StudentRegistrationCurrentDto {
  @ApiProperty() realName!: string
  @ApiProperty() studentNumber!: string
}
export class StudentRegistrationListDto {
  @ApiProperty({ type: () => [StudentRegistrationItemDto] }) items!: StudentRegistrationItemDto[]
  @ApiPropertyOptional({ type: () => StudentRegistrationCurrentDto })
  current?: StudentRegistrationCurrentDto
}
export class StudentRegistrationSavedDto {
  @ApiProperty() saved!: boolean
}
