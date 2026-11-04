import { HttpStatus } from '@nestjs/common'
import { ERROR_CODES } from '@xiaoqiu/contracts'
import { createHash } from 'node:crypto'
import { ApiHttpException } from '../common/api-http.exception'

export function centerError(status: number, message: string): ApiHttpException {
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

export function maskIdentity(value: string | null): string | null {
  if (!value) return null
  return value.length <= 4 ? '****' : `${value.slice(0, 2)}****${value.slice(-2)}`
}

export function maskEmail(value: string | null): string | null {
  if (!value) return null
  const at = value.lastIndexOf('@')
  return at > 0 ? `${value.slice(0, 1)}***${value.slice(at)}` : '***'
}

export function commandHash(value: unknown): string {
  const normalize = (input: unknown): unknown => {
    if (Array.isArray(input)) return input.map(normalize)
    if (input && typeof input === 'object')
      return Object.fromEntries(
        Object.entries(input)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([key, item]) => [key, normalize(item)]),
      )
    return input
  }
  return createHash('sha256')
    .update(JSON.stringify(normalize(value)))
    .digest('hex')
}

const teamStrings: Record<string, number> = {
  name: 160,
  shortName: 80,
  collegeName: 160,
  description: 600,
  motto: 160,
  primaryColor: 16,
  secondaryColor: 16,
}
const playerStrings: Record<string, number> = {
  studentId: 32,
  displayName: 120,
  jerseyName: 120,
  academicYear: 32,
  major: 120,
  hometown: 120,
  bio: 600,
  profileColor: 16,
}
const positions = ['GOALKEEPER', 'DEFENDER', 'MIDFIELDER', 'FORWARD']

/** Admin-authorized fields only; stable IDs, source keys and memberships are never editable here. */
export function publicProfilePatch(
  kind: 'Team' | 'PlayerProfile',
  input: Record<string, unknown>,
): Record<string, string | number | null> {
  const strings = kind === 'Team' ? teamStrings : playerStrings
  const numbers: Record<string, [number, number]> =
    kind === 'Team' ? { foundedYear: [1800, 2200] } : { heightCm: [80, 250] }
  const enums: Record<string, string[]> =
    kind === 'Team'
      ? {}
      : {
          position: positions,
          secondaryPosition: positions,
          dominantFoot: ['LEFT', 'RIGHT', 'BOTH'],
        }
  const required = kind === 'Team' ? 'name' : 'displayName'
  const keys = Object.keys(input)
  if (!keys.length || keys.length > 20)
    throw centerError(HttpStatus.BAD_REQUEST, '请至少修改一个资料字段')
  const output: Record<string, string | number | null> = {}
  for (const key of keys) {
    const value = input[key]
    if (!Object.hasOwn(strings, key) && !Object.hasOwn(numbers, key) && !Object.hasOwn(enums, key))
      throw centerError(400, `不允许修改字段 ${key}`)
    if (value === null && key !== required) {
      output[key] = null
      continue
    }
    if (key in strings) {
      if (typeof value !== 'string') throw centerError(400, `${key} 必须是文字`)
      const trimmed = value.trim()
      if (trimmed.length > strings[key]! || (key === required && !trimmed))
        throw centerError(400, `${key} 文字长度不符合要求`)
      if (key.toLowerCase().includes('color') && trimmed && !/^#[0-9a-f]{6}$/i.test(trimmed))
        throw centerError(400, `${key} 应使用 #RRGGBB 颜色`)
      output[key] = trimmed || null
    } else if (key in numbers) {
      const [min, max] = numbers[key]!
      if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max)
        throw centerError(400, `${key} 数值不符合要求`)
      output[key] = value
    } else {
      if (typeof value !== 'string' || !enums[key]!.includes(value))
        throw centerError(400, `${key} 选项不符合要求`)
      output[key] = value
    }
  }
  if (kind === 'PlayerProfile' && Object.hasOwn(output, 'studentId'))
    output.studentIdMasked = maskIdentity(output.studentId as string | null)
  return output
}

/** Older audit JSON can contain private identities, media and free-form content. Do not return it. */
export function safeAuditSummary(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const result: Record<string, unknown> = {}
  const allowed = new Set([
    'version',
    'previousVersion',
    'nextVersion',
    'reportVersion',
    'confirmedReportVersion',
    'status',
    'action',
    'actionTaken',
    'count',
    'revokedCount',
    'changedFields',
    'scopeType',
  ])
  for (const [key, item] of Object.entries(value)) {
    if (!allowed.has(key)) continue
    if (typeof item === 'number' || typeof item === 'boolean' || item === null) result[key] = item
    else if (typeof item === 'string' && /^[A-Z0-9_:.-]{1,120}$/.test(item)) result[key] = item
    else if (key === 'changedFields' && Array.isArray(item))
      result[key] = item
        .filter((field) => typeof field === 'string' && /^[A-Za-z]{1,40}$/.test(field))
        .slice(0, 20)
  }
  return Object.keys(result).length ? result : null
}
