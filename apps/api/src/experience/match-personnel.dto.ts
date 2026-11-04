import { ApiProperty } from '@nestjs/swagger'

export class MatchOfficialDto {
  @ApiProperty({ enum: ['REFEREE', 'ASSISTANT_REFEREE_1', 'ASSISTANT_REFEREE_2', 'FOURTH_OFFICIAL'] })
  role!: 'REFEREE' | 'ASSISTANT_REFEREE_1' | 'ASSISTANT_REFEREE_2' | 'FOURTH_OFFICIAL'

  @ApiProperty() displayName!: string
  @ApiProperty({ type: String, nullable: true, format: 'uuid', description: '已有球员档案时返回；裁判无需创建球员档案' })
  playerId!: string | null
}
