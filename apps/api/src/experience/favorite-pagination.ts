import { HttpStatus } from '@nestjs/common'
import { ERROR_CODES } from '@xiaoqiu/contracts'
import { ApiHttpException } from '../common/api-http.exception'

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export function encodeFavoriteCursor(
  row: { id: string; createdAt: Date },
  organizationId: string,
  userId: string,
) {
  return Buffer.from(
    JSON.stringify({
      v: 1,
      id: row.id,
      at: row.createdAt.toISOString(),
      org: organizationId,
      user: userId,
    }),
  ).toString('base64url')
}
export function decodeFavoriteCursor(
  cursor: string,
  organizationId: string,
  userId: string,
): { id: string; createdAt: Date } | null {
  if (uuid.test(cursor)) return null // Existing callers may still pass an owned favorite row UUID.
  try {
    const value: unknown = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'))
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error()
    const data = value as Record<string, unknown>
    if (
      data.v !== 1 ||
      data.org !== organizationId ||
      data.user !== userId ||
      typeof data.id !== 'string' ||
      !uuid.test(data.id) ||
      typeof data.at !== 'string'
    )
      throw new Error()
    const createdAt = new Date(data.at)
    if (!Number.isFinite(createdAt.getTime()) || createdAt.toISOString() !== data.at)
      throw new Error()
    return { id: data.id, createdAt }
  } catch {
    throw new ApiHttpException(HttpStatus.BAD_REQUEST, {
      code: ERROR_CODES.BAD_REQUEST,
      message: '收藏游标无效或不属于当前账号，请刷新列表',
    })
  }
}
