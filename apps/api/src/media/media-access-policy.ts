import { createHash } from 'node:crypto'
import { Prisma } from '../generated/prisma/client'

export function mediaPath(value: string): string {
  let path = value
  if (/^https?:\/\//i.test(value)) {
    const parsed = new URL(value)
    path = parsed.pathname
  }
  if (
    !/^\/api\/media\/(?:avatars\/[a-f0-9]{64}\.(?:png|jpg|webp)|demo\/(?:crests|portraits|photos)\/(?:0[1-9]|1[0-6])\.(?:png|jpg|webp)|posts\/[a-f0-9-]{36}\/[a-f0-9-]{36}\/[a-f0-9]{64}(?:-[2-9]-[0-8])?\.webp)$/.test(
      path,
    )
  )
    throw new Error('仅支持本站公开图片地址')
  return path
}
export function mediaKey(url: string) {
  return createHash('sha256').update(mediaPath(url)).digest('hex')
}
export async function mediaPolicies(tx: Prisma.TransactionClient, url: string, org?: string) {
  const key = mediaKey(url)
  return tx.$queryRaw<Array<{ organizationId: string; state: Prisma.JsonValue; id: string }>>(
    Prisma.sql`SELECT DISTINCT ON (organization_id) organization_id AS "organizationId",after_summary AS state,id::text FROM audit_logs WHERE target_type='MediaURL' AND target_id=${key} AND action IN ('MEDIA_BLOCKED','MEDIA_RESTORED') ${org ? Prisma.sql`AND organization_id=${org}::uuid` : Prisma.empty} ORDER BY organization_id,COALESCE((after_summary->>'policyVersion')::int,0) DESC,created_at DESC,id DESC`,
  )
}
export async function assertMediaReadable(tx: Prisma.TransactionClient, url: string) {
  const rows = await mediaPolicies(tx, url)
  if (
    rows.some(
      (row) =>
        row.state &&
        typeof row.state === 'object' &&
        !Array.isArray(row.state) &&
        row.state.blocked === true,
    )
  )
    return false
  return true
}
