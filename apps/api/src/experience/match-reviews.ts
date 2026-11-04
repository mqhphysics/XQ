import { HttpStatus } from '@nestjs/common'
import { ERROR_CODES } from '@xiaoqiu/contracts'
import { ApiHttpException } from '../common/api-http.exception'
import type { PrismaClient } from '../generated/prisma/client'

export function summarizeMatchRatings(reviews: Array<{ rating: number }>) {
  const counts = [0, 0, 0, 0, 0]
  let total = 0
  let ratingCount = 0
  for (const { rating } of reviews) {
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) continue
    counts[rating - 1]!++
    ratingCount++
    total += rating
  }
  return {
    averageRating: ratingCount ? Math.round((total / ratingCount) * 10) / 10 : null,
    ratingCount,
    ratingDistribution: counts.map((count, index) => ({ rating: index + 1, count })),
  }
}

export async function saveMatchReview(
  prisma: Pick<PrismaClient, '$transaction'>,
  organizationId: string,
  userId: string,
  matchId: string,
  input: { rating?: number; body?: string },
) {
  const fail = (message: string, status = HttpStatus.BAD_REQUEST) => {
    throw new ApiHttpException(status, {
      code: status === HttpStatus.CONFLICT ? ERROR_CODES.CONFLICT : ERROR_CODES.BAD_REQUEST,
      message,
    })
  }
  if (
    input.rating !== undefined &&
    (!Number.isInteger(input.rating) || input.rating < 1 || input.rating > 5)
  )
    fail('请选择 1 至 5 分')
  const body = input.body?.trim()
  if (input.rating === undefined && !body) fail('请填写评论或选择评分')
  if (body && body.length > 500) fail('评论最多 500 字')

  return prisma.$transaction(async (tx) => {
    // Serialize writes on this tenant-scoped match, including concurrent first ratings.
    const matches = await tx.$queryRaw<Array<{ id: string; status: string }>>`
      SELECT id, status FROM matches
      WHERE id = ${matchId}::uuid AND organization_id = ${organizationId}::uuid
      FOR UPDATE
    `
    const match = matches[0]
    if (!match) {
      throw new ApiHttpException(HttpStatus.NOT_FOUND, {
        code: ERROR_CODES.NOT_FOUND,
        message: '比赛不存在',
      })
    }
    if (!['FINISHED', 'CONFIRMED'].includes(match.status)) fail('比赛结束后才可评分和评论')
    const existing = await tx.matchReview.findFirst({ where: { organizationId, matchId, userId } })
    if (
      existing &&
      existing.rating > 0 &&
      input.rating !== undefined &&
      input.rating !== existing.rating
    )
      fail('评分确认后不可修改', HttpStatus.CONFLICT)
    if (existing) {
      return tx.matchReview.update({
        where: { id: existing.id },
        data: {
          ...(existing.rating === 0 && input.rating !== undefined ? { rating: input.rating } : {}),
          ...(body ? { body } : {}),
        },
      })
    }
    return tx.matchReview.create({
      data: { organizationId, matchId, userId, rating: input.rating ?? 0, body: body ?? null },
    })
  })
}
