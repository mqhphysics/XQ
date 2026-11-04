import type { Prisma } from '../generated/prisma/client'
import { defaultCover } from '../media/default-media'

/** IDs and memberships never come from a display snapshot. */
export function withSeasonTeamProfile<T extends { name: string }>(
  team: T,
  snapshot: Prisma.JsonValue | undefined | null,
): T {
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) return team
  const output: Record<string, string | null> = {}
  for (const field of [
    'name',
    'shortName',
    'collegeName',
    'description',
    'motto',
    'crestUrl',
    'coverUrl',
    'primaryColor',
    'secondaryColor',
  ]) {
    const value = snapshot[field]
    if (typeof value === 'string' && (field !== 'name' || value.trim())) output[field] = value
    else if (value === null && field !== 'name') output[field] = null
  }
  return {
    ...team,
    ...output,
    coverUrl: defaultCover(
      'team',
      output.coverUrl ?? (team as T & { coverUrl?: string | null }).coverUrl,
    ),
  }
}
