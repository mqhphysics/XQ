export function studentNumberLabel(
  verified: string | null | undefined,
  items: ReadonlyArray<{ status: string; studentNumber: string }>,
): string {
  if (verified) return verified
  const latest = items[0]
  if (!latest || !/^20\d{8}$/.test(latest.studentNumber)) return ''
  if (latest.status === 'PENDING') return `${latest.studentNumber}（待核验）`
  if (latest.status === 'RETURNED') return `${latest.studentNumber}（待更正）`
  return ''
}
