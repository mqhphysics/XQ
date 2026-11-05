import { Transform, Type } from 'class-transformer'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator'

export class SearchQueryDto {
  @ApiPropertyOptional({ type: String, format: 'uuid' })
  @IsOptional()
  @IsUUID()
  competitionId?: string
  @ApiPropertyOptional({ type: String, format: 'uuid' }) @IsOptional() @IsUUID() seasonId?: string
  @ApiPropertyOptional({ type: String, format: 'uuid' })
  @IsOptional()
  @IsUUID()
  tournamentId?: string

  @ApiProperty({ type: String, example: '物院' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(1, 60)
  query!: string

  @ApiPropertyOptional({ type: String, enum: ['ALL', 'PLAYER', 'TEAM', 'MATCH', 'POST'] })
  @IsOptional()
  @IsIn(['ALL', 'PLAYER', 'TEAM', 'MATCH', 'POST'])
  category: 'ALL' | 'PLAYER' | 'TEAM' | 'MATCH' | 'POST' = 'ALL'
}

export class UpdateTeamPreferencesDto {
  @ApiProperty({
    type: String,
    format: 'uuid',
    nullable: true,
    description: 'null 表示取消主队，保留传入的其他关注球队',
  })
  @ValidateIf((_object, value) => value !== null)
  @IsUUID()
  primaryTeamId!: string | null

  @ApiProperty({ type: [String], maxItems: 12 })
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(12)
  @IsUUID('4', { each: true })
  followedTeamIds!: string[]
}

export class PostTagDto {
  @ApiProperty({ enum: ['TOPIC', 'TEAM', 'PLAYER'] })
  @IsIn(['TOPIC', 'TEAM', 'PLAYER'])
  kind!: 'TOPIC' | 'TEAM' | 'PLAYER'

  @ApiPropertyOptional({ type: String, maxLength: 160 })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  label?: string

  @ApiPropertyOptional({ type: String, format: 'uuid' })
  @IsOptional()
  @IsUUID()
  targetId?: string
}

export class PostTagQueryDto {
  @ApiPropertyOptional({ type: String, format: 'uuid' })
  @IsOptional()
  @IsUUID()
  tournamentId?: string

  @ApiPropertyOptional({ type: String, maxLength: 60 })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsOptional()
  @IsString()
  @MaxLength(60)
  query?: string
}

export class CreatePostDto {
  @ApiPropertyOptional({ type: String, format: 'uuid', description: '引用的已发布动态' })
  @IsOptional()
  @IsUUID()
  quotedPostId?: string
  @ApiProperty({ type: String, description: '客户端生成的动态发布幂等键' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(8, 120)
  clientPostId!: string

  @ApiPropertyOptional({ type: String, format: 'uuid' })
  @IsOptional()
  @IsUUID()
  tournamentId?: string

  @ApiPropertyOptional({ type: [PostTagDto], maxItems: 10 })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => PostTagDto)
  tags?: PostTagDto[]

  @ApiPropertyOptional({ type: String, format: 'uuid', description: '以球队成员身份发布球队动态' })
  @IsOptional()
  @IsUUID()
  teamId?: string

  @ApiPropertyOptional({ type: String })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsOptional()
  @IsString()
  @Length(2, 180)
  title?: string

  @ApiProperty({ type: String })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(0, 1000)
  body!: string

  @ApiPropertyOptional({
    type: String,
    description: '兼容旧客户端的单张 JPEG/PNG/WebP/GIF 图片，最大 4 MiB',
  })
  @IsOptional()
  @IsString()
  @MaxLength(5_600_000)
  imageDataUrl?: string

  @ApiPropertyOptional({
    type: [String],
    maxItems: 9,
    description: '按展示顺序上传，最多 9 张；与 imageDataUrl 二选一',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(9)
  @IsString({ each: true })
  @MaxLength(5_600_000, { each: true })
  imageDataUrls?: string[]
}

export class CreateCommentDto {
  @ApiPropertyOptional({ type: Boolean, description: '发表评论时同步发布引用原帖的动态，不带标签' })
  @IsOptional()
  @IsBoolean()
  repostToFeed?: boolean

  @ApiProperty({ type: String, description: '客户端生成的评论幂等键' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(8, 120)
  clientCommentId!: string

  @ApiPropertyOptional({ type: String, format: 'uuid', description: '回复的评论 ID' })
  @IsOptional()
  @IsUUID()
  parentCommentId?: string

  @ApiProperty({ type: String })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(0, 300)
  body!: string

  @ApiPropertyOptional({
    type: [String],
    maxItems: 3,
    description: 'JPEG/PNG/WebP/GIF，单张最大 4 MiB；GIF 保留动画。有图时正文可为空。',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(3)
  @IsString({ each: true })
  @MaxLength(5_600_000, { each: true })
  imageDataUrls?: string[]
}

export class CreateMatchReviewDto {
  @ApiPropertyOptional({ type: Number, minimum: 1, maximum: 5 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  rating?: number

  @ApiPropertyOptional({ type: String, maxLength: 500 })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsOptional()
  @IsString()
  @Length(1, 500)
  body?: string
}

export class ContentVersionDto {
  @ApiProperty({ type: String, format: 'date-time', description: '最后读取的内容版本时间' })
  @IsDateString()
  expectedUpdatedAt!: string
}

export class UpdatePostDto extends ContentVersionDto {
  @ApiProperty({ type: String, maxLength: 1000 })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(0, 1000)
  body!: string
}

export class UpdateCommentDto extends ContentVersionDto {
  @ApiProperty({ type: String, maxLength: 300 })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(1, 300)
  body!: string
}
