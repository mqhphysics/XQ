export type HomeLoadState<T> =
  | { phase: 'loading' }
  | { phase: 'failed'; message: string }
  | { phase: 'empty' }
  | { phase: 'ready'; data: T }

/** Confirm a missing featured tournament against the organization's published list. */
export async function loadHomeWithEmptyState<T>(
  getHome: () => Promise<T>,
  listPublishedTournaments: () => Promise<{ items: Array<{ id: string }> }>,
): Promise<HomeLoadState<T>> {
  try {
    return { phase: 'ready', data: await getHome() }
  } catch (error) {
    if (
      error instanceof Error &&
      'statusCode' in error &&
      error.statusCode === 404 &&
      (await listPublishedTournaments()).items.length === 0
    ) {
      return { phase: 'empty' }
    }
    throw error
  }
}
