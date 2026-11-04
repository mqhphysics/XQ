function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
function canonical(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']'
  if (record(value))
    return (
      '{' +
      Object.keys(value)
        .sort()
        .map((key) => JSON.stringify(key) + ':' + canonical(value[key]))
        .join(',') +
      '}'
    )
  return JSON.stringify(value) ?? 'null'
}
/** Expanding eligibility alone cannot invalidate prior scores; every other rule stays identical. */
export function compatibleRosterExpansion(previous: unknown, current: unknown): boolean {
  if (!record(previous) || !record(current) || !record(previous.roster) || !record(current.roster))
    return false
  const oldIds = previous.roster.eligiblePlayerIds,
    newIds = current.roster.eligiblePlayerIds
  if (
    !Array.isArray(oldIds) ||
    !Array.isArray(newIds) ||
    ![...oldIds, ...newIds].every((id) => typeof id === 'string')
  )
    return false
  const allowed = new Set(newIds)
  if (!oldIds.every((id) => allowed.has(id))) return false
  const withoutEligibility = (rule: Record<string, unknown>) => {
    const roster = { ...(rule.roster as Record<string, unknown>) }
    delete roster.eligiblePlayerIds
    return { ...rule, roster }
  }
  return canonical(withoutEligibility(previous)) === canonical(withoutEligibility(current))
}
