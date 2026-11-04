import type {
  FeatureAvailability,
  GuestEntryPolicy,
  ProductConfiguration,
  ProductModuleId,
  ScopedCapability,
  CapabilityScope,
} from '../../../../../packages/contracts/src/product-config'

export const UNAVAILABLE_FEATURE_MESSAGE = '功能暂未开放'
export const CLOSED_GUEST_POLICY: GuestEntryPolicy = {
  visible: true,
  enabled: false,
  reason: UNAVAILABLE_FEATURE_MESSAGE,
}

const moduleIds: ProductModuleId[] = [
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
]

/** Unknown schema, missing flags and malformed values cannot enable a feature. */
export function parseProductConfiguration(value: unknown): ProductConfiguration {
  const root = record(value)
  const guest = record(root.guest)
  const sport = record(root.sport)
  if (
    root.schemaVersion !== 1 ||
    typeof root.revision !== 'string' ||
    !root.revision ||
    typeof root.accountRequired !== 'boolean' ||
    typeof root.serverGuestAccess !== 'boolean' ||
    sport.format !== 'EIGHT_A_SIDE' ||
    sport.playersPerSide !== 8
  ) {
    throw new Error('产品配置版本不兼容，请联系管理员')
  }
  const input = record(root.modules)
  const guestEnabled =
    guest.enabled === true && root.serverGuestAccess === true && root.accountRequired === false
  const modules = Object.fromEntries(
    moduleIds.map((id) => {
      const availability = record(input[id])
      const enabled = availability.enabled === true
      return [id, { enabled, reason: enabled ? null : safeReason(availability.reason) }]
    }),
  ) as Record<ProductModuleId, FeatureAvailability>
  return {
    schemaVersion: 1,
    revision: root.revision,
    accountRequired: root.accountRequired,
    serverGuestAccess: root.serverGuestAccess,
    guest: {
      visible: guest.visible !== false,
      enabled: guestEnabled,
      reason: guestEnabled ? null : safeReason(guest.reason),
    },
    sport: { format: 'EIGHT_A_SIDE', playersPerSide: 8 },
    modules,
  }
}

export async function runFeatureAction(
  availability: FeatureAvailability | undefined,
  action: () => void | Promise<void>,
  notify: (message: string) => void | Promise<unknown>,
): Promise<boolean> {
  if (availability?.enabled !== true) {
    await notify(safeReason(availability?.reason))
    return false
  }
  await action()
  return true
}

/** Entry visibility only. The API still rechecks role, object, state and version on every write. */
export function capabilityAllows(
  capability: ScopedCapability | undefined,
  scope: CapabilityScope,
): boolean {
  return (
    capability?.enabled === true &&
    Array.isArray(capability.scopes) &&
    capability.scopes.some(
      (grant) =>
        grant !== null &&
        typeof grant === 'object' &&
        grant.type === scope.type &&
        grant.id === scope.id,
    )
  )
}

function record(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function safeReason(value: unknown): string {
  return typeof value === 'string' && value.trim()
    ? value.slice(0, 160)
    : UNAVAILABLE_FEATURE_MESSAGE
}
