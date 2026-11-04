export type Section =
  | 'overview'
  | 'intake'
  | 'ai'
  | 'accounts'
  | 'people'
  | 'events'
  | 'content'
  | 'publish'
  | 'review'
  | 'media'
  | 'reporters'
  | 'audit'
  | 'system'
export type DirectoryTab = 'students' | 'users' | 'players' | 'teams'
export type Navigate = (section: Section, view?: string, query?: string) => void
const sections: Section[] = [
  'intake',
  'ai',
  'overview',
  'accounts',
  'people',
  'events',
  'content',
  'publish',
  'review',
  'media',
  'reporters',
  'audit',
  'system',
]
const views: Partial<Record<Section, string[]>> = {
  accounts: ['logins', 'identities'],
  people: ['students', 'users', 'players', 'teams'],
  events: ['reports', 'sheet', 'rosters', 'schedule', 'events', 'teams', 'progression'],
  reporters: ['people', 'cases', 'applications'],
  review: ['pending', 'messages'],
}
export function workspaceLocation(hash: string) {
  const [candidate = '', query = ''] = hash.replace(/^#/, '').split('?', 2)
  const section = sections.includes(candidate as Section) ? (candidate as Section) : 'overview'
  const params = new URLSearchParams(query)
  const candidateView = params.get('view') ?? ''
  return {
    section,
    view: views[section]?.includes(candidateView) ? candidateView : '',
    query: (params.get('q') ?? '').trim().slice(0, 120),
  }
}
export function workspaceHash(section: Section, view = '', query = '') {
  const params = new URLSearchParams()
  if (view && views[section]?.includes(view)) params.set('view', view)
  if (query.trim()) params.set('q', query.trim().slice(0, 120))
  return `#${section}${params.size ? '?' + params.toString() : ''}`
}
export function directoryTab(view: string): DirectoryTab {
  return ['students', 'users', 'players', 'teams'].includes(view)
    ? (view as DirectoryTab)
    : 'students'
}
export const navigationGroups = [
  { title: '工作空间', items: ['overview', 'intake', 'events'] },
  { title: '资料与人员', items: ['people', 'accounts'] },
  { title: '内容与记录', items: ['review', 'ai', 'publish', 'reporters', 'content'] },
  { title: '设置与历史', items: ['audit', 'system'] },
] as const
