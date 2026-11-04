import { AdminAccess, AdminUnavailable } from './features/adminAuth/AdminAccess'
import { configuredAdminApi } from './features/adminAuth/config'

export function App() {
  const api = configuredAdminApi()
  return api ? <AdminAccess api={api} /> : <AdminUnavailable />
}
