import { ApiProperty } from '@nestjs/swagger'
import { Transform } from 'class-transformer'
import { IsEmail, IsString, IsUUID, Length, Matches, ValidateIf } from 'class-validator'

export class EmailChangeReferenceDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  changeId!: string
}
export class EmailChangeCodeDto extends EmailChangeReferenceDto {
  @ApiProperty({ format: 'email', required: false })
  @ValidateIf((_object, value) => value !== undefined)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsEmail()
  @Length(5, 254)
  newEmail?: string
}
export class EmailChangeVerifyDto extends EmailChangeReferenceDto {
  @ApiProperty({ description: '邮件中的6位验证码' })
  @IsString()
  @Matches(/^\d{6}$/)
  emailCode!: string
}
