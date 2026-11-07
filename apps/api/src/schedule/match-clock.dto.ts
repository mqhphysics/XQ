import { ApiProperty } from '@nestjs/swagger'
import { IsUUID } from 'class-validator'

export class StartMatchClockDto {
  @ApiProperty({ format: 'uuid' }) @IsUUID() clientActionId!: string
}
export class MatchClockDto {
  @ApiProperty() serverNow!: string
  @ApiProperty({ type: String, nullable: true }) scheduledStartAt!: string | null
  @ApiProperty({ type: String, nullable: true }) autoStartsAt!: string | null
  @ApiProperty({ type: String, nullable: true }) startedAt!: string | null
  @ApiProperty({ enum: ['MANUAL', 'AUTO', 'PENDING'] }) startSource!: 'MANUAL' | 'AUTO' | 'PENDING'
  @ApiProperty({
    enum: ['PENDING', 'FIRST_HALF', 'HALF_TIME', 'SECOND_HALF', 'FINISHED', 'UNAVAILABLE'],
  })
  phase!: 'PENDING' | 'FIRST_HALF' | 'HALF_TIME' | 'SECOND_HALF' | 'FINISHED' | 'UNAVAILABLE'
  @ApiProperty() periodMinutes!: number
  @ApiProperty() intervalMinutes!: number
  @ApiProperty() periods!: number
  @ApiProperty() elapsedSeconds!: number
  @ApiProperty() phaseElapsedSeconds!: number
  @ApiProperty({ type: String, nullable: true }) expectedEndAt!: string | null
  @ApiProperty({ type: String, nullable: true }) halfTimeStartsAt!: string | null
  @ApiProperty({ type: String, nullable: true }) secondHalfStartsAt!: string | null
  @ApiProperty({ type: String, nullable: true }) endedAt!: string | null
  @ApiProperty() canStart!: boolean
}
