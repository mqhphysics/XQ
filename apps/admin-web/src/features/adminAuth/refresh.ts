export const ADMIN_REFRESH_EVENT = 'xiaoqiu:admin-refresh'

export function refreshManagementData(paths?: string[]) {
  window.dispatchEvent(new CustomEvent(ADMIN_REFRESH_EVENT, { detail: { paths } }))
}
