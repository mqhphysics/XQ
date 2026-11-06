import { createHash } from 'node:crypto'
import { Injectable } from '@nestjs/common'
import type { FeatureAvailability, ProductConfiguration, ProductModuleId } from '@xiaoqiu/contracts'

export const UNAVAILABLE_FEATURE_REASON = '功能暂未开放'

const moduleEnvironment: Record<ProductModuleId, string> = {
  home: 'XIAOQIU_FEATURE_HOME',
  schedule: 'XIAOQIU_FEATURE_SCHEDULE',
  data: 'XIAOQIU_FEATURE_DATA',
  teams: 'XIAOQIU_FEATURE_TEAMS',
  community: 'XIAOQIU_FEATURE_COMMUNITY',
  teamManagement: 'XIAOQIU_FEATURE_TEAM_MANAGEMENT',
  matchReporting: 'XIAOQIU_FEATURE_MATCH_REPORTING',
  administration: 'XIAOQIU_FEATURE_ADMINISTRATION',
  directMessages: 'XIAOQIU_FEATURE_DIRECT_MESSAGES',
  identityApplications: 'XIAOQIU_FEATURE_IDENTITY_APPLICATIONS',
  goalMedia: 'XIAOQIU_FEATURE_GOAL_MEDIA',
}

/** Reserved modules remain unavailable until their real services/policies are integrated. */
const implementedModules = new Set<ProductModuleId>([
  'home',
  'schedule',
  'data',
  'teams',
  'community',
  'teamManagement',
  'matchReporting',
  'administration',
  'directMessages',
  'identityApplications',
  'goalMedia',
])

export function buildProductConfiguration(
  environment: Record<string, string | undefined>,
): ProductConfiguration {
  const modules = Object.fromEntries(
    Object.entries(moduleEnvironment).map(([id, variable]) => {
      const value = environment[variable]?.trim().toLowerCase()
      const enabled =
        implementedModules.has(id as ProductModuleId) &&
        (value === undefined || value === '' || value === '1' || value === 'true')
      return [id, { enabled, reason: enabled ? null : UNAVAILABLE_FEATURE_REASON }]
    }),
  ) as Record<ProductModuleId, FeatureAvailability>
  const content = {
    schemaVersion: 1 as const,
    accountRequired: false as const,
    serverGuestAccess: true as const,
    guest: { visible: true, enabled: true, reason: null },
    sport: { format: 'EIGHT_A_SIDE' as const, playersPerSide: 8 as const },
    modules,
  }
  return {
    ...content,
    revision: createHash('sha256').update(JSON.stringify(content)).digest('hex').slice(0, 16),
  }
}

@Injectable()
export class ProductConfigService {
  getConfiguration(): ProductConfiguration {
    return buildProductConfiguration(process.env)
  }
}
