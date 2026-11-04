import { ApiProperty } from '@nestjs/swagger'
import { IsIn, IsUUID } from 'class-validator'
import { AuthUserDto } from '../auth/auth.dto'
export class GettingStartedPlayerDto {
  @ApiProperty() id!: string
  @ApiProperty() name!: string
  @ApiProperty({ type: String, nullable: true }) avatarUrl!: string | null
  @ApiProperty({ type: String, nullable: true }) portraitUrl!: string | null
  @ApiProperty() collegeName!: string
  @ApiProperty() academicYear!: string
  @ApiProperty({ type: [String] }) teamNames!: string[]
}
export class GettingStartedTeamDto {
  @ApiProperty() id!: string
  @ApiProperty() name!: string
}
export class GettingStartedResponseDto {
  @ApiProperty({ type: AuthUserDto }) user!: AuthUserDto
  @ApiProperty() completed!: boolean
  @ApiProperty({ type: [GettingStartedPlayerDto] }) players!: GettingStartedPlayerDto[]
  @ApiProperty({ type: [GettingStartedTeamDto] }) captainTeams!: GettingStartedTeamDto[]
  @ApiProperty({ type: [String] }) newlyInheritedTeamIds!: string[]
}
export class GettingStartedActionDto {
  @ApiProperty({ format: 'uuid' }) @IsUUID() clientActionId!: string
}
export class GettingStartedPlayerClaimDto extends GettingStartedActionDto {
  @ApiProperty({ format: 'uuid' }) @IsUUID() playerId!: string
}
export class GettingStartedCompleteDto extends GettingStartedActionDto {
  @ApiProperty({ enum: ['DONE', 'SKIPPED'] }) @IsIn(['DONE', 'SKIPPED']) outcome!:
    | 'DONE'
    | 'SKIPPED'
}
