export interface SubmissionAttempt {
  key: string
  fingerprint: string
}

export async function resolveSubmissionAttempt(
  previous: SubmissionAttempt | null,
  payload: unknown,
  createKey: () => string,
  confirmChanged: () => Promise<boolean>,
): Promise<SubmissionAttempt | null> {
  const fingerprint = JSON.stringify(payload)
  if (previous?.fingerprint === fingerprint) return previous
  if (previous && !(await confirmChanged())) return null
  return { key: createKey(), fingerprint }
}
