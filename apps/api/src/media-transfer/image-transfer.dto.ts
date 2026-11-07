import { ApiProperty } from '@nestjs/swagger'
import { IsInt, IsString, Max, MaxLength, Min } from 'class-validator'

export const IMAGE_PART_CHARACTERS = 524288
export class BeginImageTransferDto {
  @ApiProperty({ minimum: 32, maximum: 5600000 })
  @IsInt()
  @Min(32)
  @Max(5600000)
  characters!: number
}
export class ImageTransferPartDto {
  @ApiProperty({ type: String, maxLength: IMAGE_PART_CHARACTERS })
  @IsString()
  @MaxLength(IMAGE_PART_CHARACTERS)
  content!: string
}
export class ImageTransferDto {
  @ApiProperty({ format: 'uuid' }) id!: string
  @ApiProperty() partCharacters!: number
  @ApiProperty() parts!: number
  @ApiProperty({ type: String, format: 'date-time' }) expiresAt!: string
  @ApiProperty({ type: [Number] }) received!: number[]
}
