import { ApiProperty } from '@nestjs/swagger'
import { Transform } from 'class-transformer'
import {
  IsBoolean,
  IsEmail,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  ValidateIf,
} from 'class-validator'

export class LoginDto {
  @ApiProperty({
    type: String,
    description: '用户名、昵称、真实姓名、学号或绑定邮箱',
    example: '2024990001',
  })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(2, 254)
  username!: string

  @ApiProperty({ type: String, example: 'Xiaoqiu2026!' })
  @IsString()
  @Length(6, 128)
  password!: string
}

export class RegisterDto {
  @ApiProperty({ required: false, description: '填写邮箱且邮箱服务启用时必填，6位邮件验证码' })
  @IsOptional()
  @IsString()
  @Matches(/^\d{6}$/)
  emailCode?: string
  @ApiProperty({
    type: String,
    required: false,
    description: '可省略，由系统生成内部标识；可用姓名或学号登录',
    example: 'linzhixia',
  })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsOptional()
  @IsString()
  @Length(2, 32)
  @Matches(/^[\p{L}\p{N}_.-]+$/u, { message: '用户名可使用中文、字母、数字、点、下划线和短横线' })
  username?: string

  @ApiProperty({
    type: String,
    required: false,
    description: '可省略，默认生成晓球加5位数字的昵称，注册后可修改',
    example: '知夏看球',
  })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsOptional()
  @IsString()
  @Length(2, 120)
  displayName?: string

  @ApiProperty({ type: String, description: '后台实名', example: '林知夏' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(2, 120)
  realName!: string

  @ApiProperty({ type: String, pattern: '^20\\d{8}$', example: '2024990001' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(10, 10)
  @Matches(/^20\d{8}$/, { message: '学号应为20开头的10位数字' })
  studentId!: string

  @ApiProperty({ type: String, format: 'email', required: false, example: 'student@example.com' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() || undefined : value))
  @IsOptional()
  @IsEmail()
  @Length(5, 254)
  email?: string

  @ApiProperty({
    type: String,
    minLength: 6,
    maxLength: 128,
    description: '至少6位，不限制字符类型',
    example: '123456',
  })
  @IsString()
  @Length(6, 128)
  password!: string
}

export class RegistrationCheckDto {
  @ApiProperty({ type: String, description: '姓名' })
  @Transform(({ value }) => (typeof value === 'string' ? value.normalize('NFKC').trim() : value))
  @IsString()
  @Length(2, 120)
  realName!: string

  @ApiProperty({ type: String, description: '学号', pattern: '^20\\d{8}$' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Matches(/^20\d{8}$/)
  studentId!: string
}

export class RegistrationFeedbackDto {
  @ApiProperty({ type: String, format: 'uuid' })
  @IsUUID()
  clientRequestId!: string
  @ApiProperty({ type: String, required: false, maxLength: 120 })
  @IsOptional()
  @IsString()
  @Length(0, 120)
  realName?: string
  @ApiProperty({ type: String, required: false, maxLength: 32 })
  @IsOptional()
  @IsString()
  @Length(0, 32)
  studentNumber?: string
  @ApiProperty({ type: String, required: false, format: 'email' })
  @IsOptional()
  @IsEmail()
  @Length(5, 254)
  contactEmail?: string
  @ApiProperty({ type: String, minLength: 2, maxLength: 1000 })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(2, 1000)
  details!: string
}

export class RegistrationCheckResponseDto {
  @ApiProperty({ type: Boolean }) eligible!: boolean
  @ApiProperty({ type: String }) reason!: string
  @ApiProperty({ type: String }) message!: string
}
export class RegistrationFeedbackResponseDto {
  @ApiProperty({ type: Boolean }) accepted!: boolean
  @ApiProperty({ type: String, format: 'uuid' }) id!: string
  @ApiProperty({ type: String }) message!: string
}

export class AuthRoleDto {
  @ApiProperty({ type: String, example: 'TEAM_CAPTAIN' })
  role!: string

  @ApiProperty({ type: String, example: 'TEAM' })
  scopeType!: string

  @ApiProperty({ type: String, example: '00000000-0000-4000-8000-000000000000' })
  scopeId!: string
}

export class LinkedPlayerDto {
  @ApiProperty({ type: String })
  id!: string

  @ApiProperty({ type: String })
  displayName!: string

  @ApiProperty({ type: String, required: false, nullable: true })
  position!: string | null

  @ApiProperty({ type: String, required: false, nullable: true })
  avatarUrl!: string | null
}

export class AuthUserDto {
  @ApiProperty({ type: String, required: false, nullable: true, description: '用户独立背景' })
  coverUrl?: string | null
  @ApiProperty({
    type: Boolean,
    required: false,
    description: '是否在用户主页显示已关联的球员身份',
  })
  showPlayerIdentity?: boolean
  @ApiProperty({ type: String, format: 'date-time', nullable: true, required: false })
  emailVerifiedAt?: string | null
  @ApiProperty({ type: String })
  id!: string

  @ApiProperty({ type: String, format: 'uuid', description: '当前会话绑定的组织' })
  organizationId!: string

  @ApiProperty({ type: String })
  username!: string

  @ApiProperty({ type: String })
  displayName!: string

  @ApiProperty({ type: String, required: false, nullable: true })
  realName!: string | null

  @ApiProperty({ type: String, required: false, nullable: true })
  studentId!: string | null

  @ApiProperty({ type: String, required: false, nullable: true })
  email!: string | null

  @ApiProperty({ type: String, required: false, nullable: true })
  bio!: string | null

  @ApiProperty({ type: String, required: false, nullable: true })
  avatarUrl!: string | null

  @ApiProperty({ type: String, example: 'STUDENT_VERIFIED' })
  verificationLevel!: string

  @ApiProperty({ type: () => [AuthRoleDto] })
  roles!: AuthRoleDto[]

  @ApiProperty({ type: () => LinkedPlayerDto, required: false, nullable: true })
  linkedPlayer!: LinkedPlayerDto | null
}

export class LoginResponseDto {
  @ApiProperty({ type: String })
  accessToken!: string

  @ApiProperty({ type: String, format: 'date-time' })
  expiresAt!: string

  @ApiProperty({ type: () => AuthUserDto })
  user!: AuthUserDto
}

export class ResetPasswordByIdentityDto {
  @ApiProperty({ type: String, example: '林知夏' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(2, 120)
  realName!: string

  @ApiProperty({ type: String, example: '2024990001' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(10, 10)
  @Matches(/^\d{10}$/, { message: '学号应为10位数字' })
  studentId!: string

  @ApiProperty({ type: String, example: 'Xiaoqiu2026!' })
  @IsString()
  @Length(6, 128)
  newPassword!: string
}

export class UpdateProfileDto {
  @ApiProperty({ type: Boolean, required: false, description: '在用户主页显示球员身份' })
  @ValidateIf((_object, value) => value !== undefined)
  @IsBoolean()
  showPlayerIdentity?: boolean
  @ApiProperty({ type: String, description: '公开昵称' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @Length(2, 120)
  displayName?: string

  @ApiProperty({
    type: String,
    format: 'email',
    required: false,
    description: '仅兼容提交当前邮箱；更换需专用验证流程',
  })
  @ValidateIf((_object, value) => value !== undefined)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsEmail()
  @Length(5, 254)
  email?: string

  @ApiProperty({ type: String, required: false, nullable: true, description: '公开简介' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsOptional()
  @IsString()
  @Length(0, 280)
  bio?: string
}

export class UploadAvatarDto {
  @ApiProperty({
    type: String,
    description: '浏览器裁剪压缩后的 data URL；最大约 72 KiB 原始文件',
  })
  @IsString()
  @Length(100, 100_000)
  dataUrl!: string
}

export class AdminIdentityDto {
  @ApiProperty({ type: String })
  id!: string

  @ApiProperty({ type: String })
  username!: string

  @ApiProperty({ type: String })
  displayName!: string

  @ApiProperty({ type: String, required: false, nullable: true })
  realName!: string | null

  @ApiProperty({ type: String, required: false, nullable: true })
  studentId!: string | null

  @ApiProperty({ type: String, required: false, nullable: true })
  email!: string | null

  @ApiProperty({ type: String })
  verificationLevel!: string

  @ApiProperty({ type: [String] })
  roles!: string[]
}
