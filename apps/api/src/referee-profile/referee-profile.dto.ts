import { ApiProperty } from '@nestjs/swagger'
import { IsString, MaxLength } from 'class-validator'
export class RefereeBioDto {
  @ApiProperty({ maxLength: 500 }) @IsString() @MaxLength(500) bio!: string
}
export class RefereeAppearanceDto {
  @ApiProperty() matchId!: string
  @ApiProperty() tournamentId!: string
  @ApiProperty() label!: string
  @ApiProperty({ type: String, nullable: true }) scheduledStartAt!: string | null
  @ApiProperty({ type: [String] }) roles!: string[]
}
export class RefereeProfileDto {
  @ApiProperty() isReferee!: boolean
  @ApiProperty() totalMatches!: number
  @ApiProperty() refereeMatches!: number
  @ApiProperty() assistantMatches!: number
  @ApiProperty() fourthOfficialMatches!: number
  @ApiProperty() yellowCards!: number
  @ApiProperty() redCards!: number
  @ApiProperty() bio!: string
  @ApiProperty({ type: [RefereeAppearanceDto] }) matches!: RefereeAppearanceDto[]
}
export class RefereePersonDto {
  @ApiProperty() role!: string
  @ApiProperty() displayName!: string
  @ApiProperty({ type: String, nullable: true }) userId!: string | null
  @ApiProperty({ type: String, nullable: true }) playerId!: string | null
}
export class RefereePeopleDto {
  @ApiProperty({ type: [RefereePersonDto] }) items!: RefereePersonDto[]
}
