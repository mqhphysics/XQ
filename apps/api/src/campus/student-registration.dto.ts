import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsIn, IsOptional, IsString, IsUUID, Length, Matches } from 'class-validator'
import { CampusVersionDto } from './campus.dto'

export class StudentRegistrationReviewDto extends CampusVersionDto {
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
export class StudentRegistrationCorrectionDto extends CampusVersionDto {
  @ApiProperty({ description: '本人填写的学号，经管理员核验后才写入学生档案' })
  @IsString()
  @Length(10, 10)
  @Matches(/^20\d{8}$/)
  studentNumber!: string
}
