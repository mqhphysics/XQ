import type { Plugin } from 'vite'
export function localManagementPlugin(options: {
  databaseUrl: string
  legacyRepository: string
  publicApiBaseUrl: string
  enabled: boolean
  development: boolean
  organizationId: string
  ownerLoginName: string
  ownerUserId?: string
}): Plugin
