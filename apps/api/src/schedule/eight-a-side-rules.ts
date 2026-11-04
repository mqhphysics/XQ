import { HttpStatus } from '@nestjs/common'
import { ERROR_CODES } from '@xiaoqiu/contracts'
import { ApiHttpException } from '../common/api-http.exception'

/** Normalize new writes only; published historical rule versions stay immutable. */
export function eightASideRuleDocument(document: Record<string, unknown>): Record<string, unknown> {
  if (document.roster === undefined) return document
  const roster = document.roster
  if (
    !roster ||
    typeof roster !== 'object' ||
    Array.isArray(roster) ||
    ('playersOnPitch' in roster &&
      roster.playersOnPitch !== undefined &&
      roster.playersOnPitch !== 8)
  ) {
    throw new ApiHttpException(HttpStatus.BAD_REQUEST, {
      code: ERROR_CODES.VALIDATION_FAILED,
      message: '新规程仅支持八人制，playersOnPitch 必须为 8',
    })
  }
  return { ...document, roster: { ...roster, playersOnPitch: 8 } }
}
