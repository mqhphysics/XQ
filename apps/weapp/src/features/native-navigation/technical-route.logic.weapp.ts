export const nativeTechnicalPath = '/recording/technical/index'
export function nativeTechnicalUrl(matchId: string) {
  return `${nativeTechnicalPath}?matchId=${encodeURIComponent(matchId)}`
}
/** Old shared links retain their destination without pulling the recorder into the main package. */
export function redirectedTechnicalUrl(url: string): string | null {
  const [path, query = ''] = url.split('?')
  if (path !== nativeTechnicalPath && path !== '/pages/readonly-match-detail/index') return null
  const values: Record<string, string> = {}
  try {
    for (const pair of query.split('&')) {
      const cut = pair.indexOf('=')
      if (cut >= 0)
        values[decodeURIComponent(pair.slice(0, cut))] = decodeURIComponent(pair.slice(cut + 1))
    }
  } catch {
    return null
  }
  if (!values.matchId?.trim() || (path !== nativeTechnicalPath && values.technical !== '1'))
    return null
  return nativeTechnicalUrl(values.matchId)
}
