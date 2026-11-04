import { IsIn, IsInt, IsOptional, IsString, IsUUID, Length, MaxLength, Min } from 'class-validator'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'

export const MEDIA_PURPOSES = [
  'GOAL_GIF',
  'EVENT_CLIP',
  'USER_AVATAR',
  'PLAYER_AVATAR',
  'USER_BACKGROUND',
  'PLAYER_BACKGROUND',
  'PLAYER_PORTRAIT',
  'TEAM_CREST',
  'TEAM_BACKGROUND',
] as const
export type MediaPurpose = (typeof MEDIA_PURPOSES)[number]

export class SubmitMediaDto {
  @ApiProperty({enum:MEDIA_PURPOSES})
  @IsIn(MEDIA_PURPOSES)
  purpose!: MediaPurpose

  @ApiProperty({format:'uuid'})
  @IsUUID()
  targetId!: string

  @ApiProperty({minLength:8,maxLength:120})
  @IsString()
  @Length(8, 120)
  clientSubmissionId!: string

  // GIF/photo ≤ 6 MiB; EVENT_CLIP MP4 ≤ 10 MiB (base64 ≈ 13.99 M characters).
  @ApiProperty({type:String,minLength:32,maxLength:14000000})
  @IsString()
  @Length(32, 14_000_000)
  dataUrl!: string

  /** EVENT_CLIP MP4 only: a still frame captured by the client, re-encoded by the server. */
  @ApiPropertyOptional({type:String,minLength:32,maxLength:2800000})
  @IsOptional()
  @IsString()
  @Length(32, 2_800_000)
  posterDataUrl?: string
}

export class ReviewMediaDto {
  @ApiProperty({enum:['APPROVE','REJECT']})
  @IsIn(['APPROVE', 'REJECT'])
  action!: 'APPROVE' | 'REJECT'

  @ApiProperty({minimum:0})
  @IsInt()
  @Min(0)
  expectedVersion!: number

  @ApiPropertyOptional({type:String,description:'通过可不填；驳回需说明原因',maxLength:1000})
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string
}

export class MediaVisibilityDto {
  @IsIn(['HIDE', 'DELETE', 'RESTORE'])
  action!: 'HIDE' | 'DELETE' | 'RESTORE'

  @IsInt()
  @Min(0)
  expectedVersion!: number

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string
}
