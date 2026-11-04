import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'

export class PostIdentityDto {
  @ApiProperty() id!: string
  @ApiProperty() displayName!: string
  @ApiProperty() verificationLevel!: string
  @ApiProperty({ type: String, nullable: true }) avatarUrl!: string | null
  @ApiPropertyOptional({ type: String, nullable: true }) coverUrl?: string | null
  @ApiProperty({ type: [String] }) roles!: string[]
  @ApiProperty() official!: boolean
  @ApiProperty() messageable!: boolean
  @ApiPropertyOptional({ type: String, nullable: true }) displayedBadgeKind?: string | null
  @ApiPropertyOptional() showPlayerIdentity?: boolean
}

export class PostTeamDto {
  @ApiProperty() id!: string
  @ApiProperty() teamCode!: string
  @ApiProperty() name!: string
  @ApiProperty() shortName!: string
  @ApiProperty({ type: String, nullable: true }) collegeName!: string | null
  @ApiProperty({ type: String, nullable: true }) primaryColor!: string | null
  @ApiProperty({ type: String, nullable: true }) secondaryColor!: string | null
  @ApiProperty({ type: String, nullable: true }) crestUrl!: string | null
  @ApiProperty({ type: String, nullable: true }) coverUrl!: string | null
}

export class PostResponseTagDto {
  @ApiProperty({ enum: ['TOPIC', 'TEAM', 'PLAYER'] }) kind!: string
  @ApiProperty() label!: string
  @ApiPropertyOptional({ type: String }) targetId?: string
}

export class PostSummaryDto {
  @ApiProperty() id!: string
  @ApiPropertyOptional() tournamentId?: string
  @ApiProperty({ type: [PostResponseTagDto] }) tags!: PostResponseTagDto[]
  @ApiProperty() type!: string
  @ApiProperty({ type: String, nullable: true }) title!: string | null
  @ApiProperty() body!: string
  @ApiProperty({ type: String, nullable: true }) imageUrl!: string | null
  @ApiProperty({ type: [String] }) imageUrls!: string[]
  @ApiProperty({ format: 'date-time' }) publishedAt!: string
  @ApiProperty({ format: 'date-time' }) updatedAt!: string
  @ApiProperty({ type: PostIdentityDto }) author!: PostIdentityDto
  @ApiProperty({ type: PostTeamDto, nullable: true }) team!: PostTeamDto | null
  @ApiProperty() likeCount!: number
  @ApiProperty() commentCount!: number
  @ApiProperty() likedByMe!: boolean
  @ApiProperty() favoritedByMe!: boolean
  @ApiProperty({ type: String, nullable: true }) quotedPostId!: string | null
  @ApiProperty({ type: () => PostSummaryDto, nullable: true }) quotedPost!: PostSummaryDto | null
}

export class CommentResponseDto {
  @ApiProperty() id!: string
  @ApiProperty() body!: string
  @ApiProperty({
    type: [String],
    description: '按上传顺序排列，无图为 []；隐藏、删除或原动态不可访问时图片停止公开。',
  })
  imageUrls!: string[]
  @ApiProperty({ type: String, nullable: true }) parentCommentId!: string | null
  @ApiProperty({ format: 'date-time' }) createdAt!: string
  @ApiProperty({ format: 'date-time' }) updatedAt!: string
  @ApiProperty({ type: PostIdentityDto }) author!: PostIdentityDto
  @ApiProperty() likeCount!: number
  @ApiProperty() likedByMe!: boolean
  @ApiPropertyOptional({ type: PostSummaryDto, nullable: true })
  repostedPost?: PostSummaryDto | null
}

export class PostDetailDto extends PostSummaryDto {
  @ApiProperty({ enum: ['PUBLISHED', 'PENDING_REVIEW'] }) publicationState!: string
  @ApiProperty({ type: [CommentResponseDto] }) comments!: CommentResponseDto[]
}

export class FavoritePostsDto {
  @ApiProperty({ type: [PostSummaryDto] }) items!: PostSummaryDto[]
}
