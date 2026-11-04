import { ApiProperty } from '@nestjs/swagger'
import { Transform } from 'class-transformer'
import { IsEmail, IsIn, IsString, Length, Matches } from 'class-validator'
import type { EmailPurpose } from './mail.service'

export class EmailCodeRequestDto {
  @ApiProperty({ format: 'email' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsEmail()
  @Length(5, 254)
  email!: string

  @ApiProperty({ enum: ['REGISTER', 'RESET_PASSWORD', 'LOGIN', 'VERIFY_EMAIL'] })
  @IsIn(['REGISTER', 'RESET_PASSWORD', 'LOGIN', 'VERIFY_EMAIL'])
  purpose!: EmailPurpose
}

export class EmailVerificationDto {
  @ApiProperty({ format: 'email' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsEmail()
  @Length(5, 254)
  email!: string

  @ApiProperty({ description: '邮件中的6位数字验证码' })
  @IsString()
  @Matches(/^\d{6}$/)
  emailCode!: string
}

export class EmailPasswordResetDto extends EmailVerificationDto {
  @ApiProperty({ minLength: 6, maxLength: 128, description: '至少6位，不限制字符类型' })
  @IsString()
  @Length(6, 128)
  newPassword!: string
}
