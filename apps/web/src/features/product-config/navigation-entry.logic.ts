import type {
  AccountCapabilities,
  CapabilityScope,
  ProductActionId,
  ProductConfiguration,
  ProductModuleId,
} from '../../../../../packages/contracts/src/product-config'
import { configuredGuestAccess } from './access-boundary.logic.ts'
import { capabilityAllows, UNAVAILABLE_FEATURE_MESSAGE } from './product-config.logic.ts'

export type NavigationSection =
  | 'home'
  | 'schedule'
  | 'data'
  | 'team'
  | 'me'
  | 'tournaments'
  | 'teams'
const modules: Partial<Record<NavigationSection, ProductModuleId>> = {
  home: 'home',
  schedule: 'schedule',
  data: 'data',
  team: 'teams',
  teams: 'teams',
  tournaments: 'schedule',
}
const actions: Partial<Record<NavigationSection, ProductActionId>> = {
  home: 'home.read',
  schedule: 'schedule.read',
  data: 'data.read',
  team: 'teams.read',
  teams: 'teams.read',
  tournaments: 'schedule.read',
}
const actionModules: Record<ProductActionId, ProductModuleId> = {
  'home.read': 'home',
  'schedule.read': 'schedule',
  'data.read': 'data',
  'teams.read': 'teams',
  'community.write': 'community',
  'teams.manage': 'teamManagement',
  'lineups.manage': 'teamManagement',
  'matchReports.write': 'matchReporting',
  'tournaments.manage': 'administration',
  'administration.manage': 'administration',
  'messages.read': 'directMessages',
  'messages.send': 'directMessages',
  'identityApplications.submit': 'identityApplications',
  'identityApplications.review': 'identityApplications',
  'goalMedia.submit': 'goalMedia',
  'goalMedia.review': 'goalMedia',
  'goalMedia.publish': 'goalMedia',
}

export interface NavigationDependencies {
  getConfiguration: () => Promise<ProductConfiguration>
  account: () => { hasSession: boolean; needsAccount: boolean; organizationId: string | null }
  getCapabilities: () => Promise<AccountCapabilities>
  navigate: () => void | Promise<void>
  notify: (message: string) => void | Promise<unknown>
}

/** Stable labels stay clickable. Account and role snapshots are fetched before private entry. */
export async function runNavigationEntry(
  section: NavigationSection,
  dependencies: NavigationDependencies,
): Promise<boolean> {
  try {
    const config = await dependencies.getConfiguration()
    const module = modules[section]
    if (module && config.modules[module]?.enabled !== true) return unavailable(dependencies)
    const account = dependencies.account()
    if (account.hasSession && account.organizationId) {
      const capabilities = await dependencies.getCapabilities()
      const current = dependencies.account()
      const action = actions[section]
      if (
        !current.hasSession ||
        current.organizationId !== account.organizationId ||
        capabilities.organizationId !== account.organizationId ||
        (module && capabilities.modules[module]?.enabled !== true) ||
        (action &&
          !capabilityAllows(capabilities.actions[action], {
            type: 'ORGANIZATION',
            id: account.organizationId,
          }))
      )
        return unavailable(dependencies)
    } else if (section === 'me' || account.needsAccount || !configuredGuestAccess(config))
      return unavailable(dependencies)
    await dependencies.navigate()
    return true
  } catch {
    return unavailable(dependencies)
  }
}

export async function runPrivateEntry(
  action: ProductActionId | null,
  dependencies: NavigationDependencies,
  scope?: CapabilityScope,
): Promise<boolean> {
  try {
    const config = await dependencies.getConfiguration()
    const module = action ? actionModules[action] : null
    if (action && (!module || config.modules[module]?.enabled !== true))
      return unavailable(dependencies)
    const before = dependencies.account()
    if (!before.hasSession || !before.organizationId) return unavailable(dependencies)
    const capabilities = await dependencies.getCapabilities()
    const after = dependencies.account()
    if (
      !after.hasSession ||
      after.organizationId !== before.organizationId ||
      capabilities.organizationId !== before.organizationId ||
      (scope?.type === 'ORGANIZATION' && scope.id !== before.organizationId) ||
      (module && capabilities.modules[module]?.enabled !== true) ||
      (action &&
        !capabilityAllows(
          capabilities.actions[action],
          scope ?? { type: 'ORGANIZATION', id: before.organizationId },
        ))
    )
      return unavailable(dependencies)
    await dependencies.navigate()
    return true
  } catch {
    return unavailable(dependencies)
  }
}

async function unavailable(dependencies: Pick<NavigationDependencies, 'notify'>): Promise<false> {
  await dependencies.notify(UNAVAILABLE_FEATURE_MESSAGE)
  return false
}
