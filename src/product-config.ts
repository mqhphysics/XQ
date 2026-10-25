/** Additive v1 contract. Unknown module/action keys never grant client capabilities. */
export type ProductModuleId =
  | 'home'
  | 'schedule'
  | 'data'
  | 'teams'
  | 'community'
  | 'teamManagement'
  | 'matchReporting'
  | 'administration'
  | 'directMessages'
  | 'identityApplications'
  | 'goalMedia'

export interface FeatureAvailability {
  enabled: boolean
  reason: string | null
}

export interface GuestEntryPolicy extends FeatureAvailability {
  visible: boolean
}

export interface ProductConfiguration {
  schemaVersion: 1
  revision: string
  accountRequired: boolean
  serverGuestAccess: boolean
  guest: GuestEntryPolicy
  sport: { format: 'EIGHT_A_SIDE'; playersPerSide: 8 }
  modules: Record<ProductModuleId, FeatureAvailability>
}

export type ProductActionId =
  | 'home.read'
  | 'schedule.read'
  | 'data.read'
  | 'teams.read'
  | 'community.write'
  | 'teams.manage'
  | 'lineups.manage'
  | 'matchReports.write'
  | 'tournaments.manage'
  | 'administration.manage'
  | 'messages.read'
  | 'messages.send'
  | 'identityApplications.submit'
  | 'identityApplications.review'
  | 'goalMedia.submit'
  | 'goalMedia.review'
  | 'goalMedia.publish'

/** Object scope describes an entry point; every command rechecks its own policy and state. */
export interface CapabilityScope {
  type: 'ORGANIZATION' | 'TEAM' | 'TOURNAMENT' | 'MATCH' | 'PLATFORM'
  id: string
}

export interface ScopedCapability extends FeatureAvailability {
  scopes: CapabilityScope[]
}

export interface AccountCapabilities {
  schemaVersion: 1
  revision: string
  organizationId: string
  /** Verified team captain/coach scopes; older v1 clients may omit this additive field. */
  managedTeamIds?: string[]
  modules: Record<ProductModuleId, FeatureAvailability>
  actions: Record<ProductActionId, ScopedCapability>
}
