/** Public authoring is retired; official administration and notifications stay available. */
export const RETIRED_UGC_REASON = '发帖、评论和私信功能已退出，官方内容与系统通知继续保留。'

export function retiredUgcRequest(
  method: string | undefined,
  route: string,
  body?: unknown,
): boolean {
  const path = route
    .replace(/^\/api\//i, '')
    .replace(/^\/+|\/+$/g, '')
    .toLowerCase()
  const verb = (method ?? 'GET').toUpperCase()
  if (path.startsWith('messages/')) return true
  if (path === 'community/posts' && verb === 'POST') return true
  if (/^community\/posts\/:[^/]+$/.test(path) && ['PATCH', 'DELETE'].includes(verb)) return true
  if (
    /^community\/posts\/:[^/]+\/comments(?:\/:[^/]+)?$/.test(path) &&
    ['POST', 'PATCH', 'DELETE'].includes(verb)
  )
    return true
  return (
    /^matches\/:[^/]+\/reviews$/.test(path) &&
    verb === 'POST' &&
    !!body &&
    typeof body === 'object' &&
    'body' in body &&
    typeof body.body === 'string' &&
    body.body.trim().length > 0
  )
}
