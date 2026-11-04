import { isUUID } from 'class-validator'

const SEED_ORGANIZATION_ID = '00000000-0000-4000-8000-000000000001'

/** A deployment may opt one isolated organization into explicitly fictional seed facts. */
export function isDemoFixtureOrganization(organizationId: string): boolean {
  if (organizationId === SEED_ORGANIZATION_ID) return true
  const configured = process.env.DEMO_FIXTURE_ORGANIZATION_ID?.trim()
  return Boolean(configured && isUUID(configured) && organizationId === configured)
}
