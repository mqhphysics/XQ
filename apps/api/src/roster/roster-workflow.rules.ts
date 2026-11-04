import { HttpStatus } from '@nestjs/common'
import { ERROR_CODES } from '@xiaoqiu/contracts'

import { ApiHttpException } from '../common/api-http.exception'

export type RosterAction = 'SAVE' | 'SUBMIT' | 'RETURN' | 'APPROVE' | 'LOCK' | 'REOPEN'
export interface RosterPlayerInput {
  playerId: string
  shirtNumber: string | null
}
export interface RosterPolicy {
  playersOnPitch?: 5 | 7 | 8 | 11
  minPlayers: number
  maxPlayers: number
  submissionDeadline: string
  eligiblePlayerIds: string[]
}

export function rosterError(status: number, message: string): ApiHttpException {
  return new ApiHttpException(status, {
    code:
      status === 401
        ? ERROR_CODES.UNAUTHORIZED
        : status === 403
          ? ERROR_CODES.FORBIDDEN
          : status === 404
            ? ERROR_CODES.NOT_FOUND
            : status === 409
              ? ERROR_CODES.CONFLICT
              : ERROR_CODES.VALIDATION_FAILED,
    message,
  })
}

// Qualification is an explicit, organizer-approved ID list. Names are never identity keys.
// No default deadline or qualification policy is invented for an unconfigured tournament.
export function parseRosterPolicy(rules: unknown): RosterPolicy | null {
  if (!rules || typeof rules !== 'object' || !('roster' in rules)) return null
  const value = rules.roster as Partial<RosterPolicy> | null
  if (
    !value ||
    !Number.isInteger(value.minPlayers) ||
    !Number.isInteger(value.maxPlayers) ||
    value.minPlayers! < 1 ||
    value.maxPlayers! < value.minPlayers! ||
    value.maxPlayers! > 100 ||
    typeof value.submissionDeadline !== 'string' ||
    !Number.isFinite(Date.parse(value.submissionDeadline)) ||
    !/(Z|[+-]\d{2}:\d{2})$/.test(value.submissionDeadline) ||
    !Array.isArray(value.eligiblePlayerIds) ||
    !value.eligiblePlayerIds.every((id) => typeof id === 'string')
  )
    return null
  return value as RosterPolicy
}

export function nextRosterStatus(
  action: RosterAction,
  status: string | null,
  reason?: string,
): string {
  const editable = status === null || ['DRAFT', 'RETURNED', 'REOPENED'].includes(status)
  if (['RETURN', 'REOPEN'].includes(action) && (!reason?.trim() || reason.trim().length > 500)) {
    throw rosterError(HttpStatus.BAD_REQUEST, '退回或补报必须填写原因（1–500 字）')
  }
  if (action === 'SAVE' && editable) return 'DRAFT'
  if (action === 'SUBMIT' && editable) return 'SUBMITTED'
  if (action === 'RETURN' && ['SUBMITTED', 'APPROVED'].includes(status ?? '')) return 'RETURNED'
  if (action === 'APPROVE' && status === 'SUBMITTED') return 'APPROVED'
  if (action === 'LOCK' && status === 'APPROVED') return 'LOCKED'
  if (action === 'REOPEN' && status === 'LOCKED') return 'REOPENED'
  throw rosterError(HttpStatus.CONFLICT, '当前名单状态不允许此操作，请重新读取最新版本')
}

export function validateRosterPlayers(
  players: RosterPlayerInput[],
  policy: RosterPolicy,
  complete: boolean,
): void {
  if (players.length > policy.maxPlayers || (complete && players.length < policy.minPlayers)) {
    throw rosterError(
      HttpStatus.BAD_REQUEST,
      `名单需 ${policy.minPlayers}–${policy.maxPlayers} 人，草稿可暂不足最低人数`,
    )
  }
  if (new Set(players.map((player) => player.playerId)).size !== players.length) {
    throw rosterError(HttpStatus.BAD_REQUEST, '名单中不能重复选择同一球员')
  }
  const numbers = players.map((player) => player.shirtNumber?.trim()).filter(Boolean)
  if (new Set(numbers).size !== numbers.length)
    throw rosterError(HttpStatus.BAD_REQUEST, '球衣号码不能重复')
  if (complete && players.some((player) => !player.shirtNumber?.trim()))
    throw rosterError(HttpStatus.BAD_REQUEST, '提交前请补齐每位球员的球衣号码')
  const eligible = new Set(policy.eligiblePlayerIds)
  if (players.some((player) => !eligible.has(player.playerId)))
    throw rosterError(HttpStatus.BAD_REQUEST, '存在未通过本赛事资格审核的球员')
}
