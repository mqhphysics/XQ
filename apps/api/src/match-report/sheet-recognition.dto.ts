import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { ArrayMaxSize, ArrayMinSize, IsArray, IsOptional, IsString, MaxLength } from 'class-validator'

export class RecognizeMatchSheetDto {
  @ApiProperty({ type: [String], description: '本场四官表 JPEG、PNG 或 WebP data URL，最多3张，每张4MB，总计10MB' })
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(3)
  @IsString({ each: true }) @MaxLength(5_600_000, { each: true })
  images!: string[]

  @ApiPropertyOptional({ description: '辅助辨认的备注，不作为比赛事实' })
  @IsOptional() @IsString() @MaxLength(800)
  notes?: string
}

export class RecognizeMatchSheetResponseDto {
  @ApiProperty({ type: Object, description: '待核对的单场比赛信息；不保存赛果或发布内容' })
  sheet!: Record<string, unknown>
  @ApiProperty()
  model!: string
}
