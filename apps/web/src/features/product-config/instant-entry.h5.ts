import type {
  AccountCapabilities,
  ProductConfiguration,
} from '../../../../../packages/contracts/src/product-config'
import { readSession } from '../product/session.h5'
import { configurationCache, getConfiguration } from './policy-state.h5'
import { productConfigRepository } from './product-config.repository'

/**
 * Instant tab entry. A tab click used to wait for /product/config (after its 30 s TTL) and
 * /me/capabilities on every click — one or two tunnel round trips before the route even
 * changed. The last known answers decide immediately; both refresh in the background, and
 * the server still enforces every permission on the data requests themselves.
 */
const CAPABILITY_FRESH_MS = 30_000
const CAPABILITY_USABLE_MS = 30 * 60_000
let capabilities: { token: string; value: AccountCapabilities; at: number } | null = null
let pending: { token: string; promise: Promise<AccountCapabilities> } | null = null

function fetchCapabilities(token: string): Promise<AccountCapabilities> {
  if (pending?.token === token) return pending.promise
  const promise = productConfigRepository
    .getCapabilities()
    .then((value) => {
      if (readSession()?.accessToken === token) capabilities = { token, value, at: Date.now() }
      return value
    })
    .finally(() => {
      if (pending?.promise === promise) pending = null
    })
  pending = { token, promise }
  return promise
}

export function instantCapabilities(): Promise<AccountCapabilities> {
  const token = readSession()?.accessToken
  if (!token) return productConfigRepository.getCapabilities()
  const hit = capabilities?.token === token ? capabilities : null
  const age = hit ? Date.now() - hit.at : Number.POSITIVE_INFINITY
  if (hit && age <= CAPABILITY_USABLE_MS) {
    if (age > CAPABILITY_FRESH_MS) void fetchCapabilities(token).catch(() => undefined)
    return Promise.resolve(hit.value)
  }
  return fetchCapabilities(token)
}

export function instantConfiguration(): Promise<ProductConfiguration> {
  const known = configurationCache.lastKnown()
  if (!known) return getConfiguration()
  if (configurationCache.age() >= configurationCache.lifetime)
    void configurationCache.revalidate().catch(() => undefined)
  return Promise.resolve(known)
}

/** Warm both answers (after login / on app open) so the first tab click is instant too. */
export function warmEntryAnswers(): void {
  void instantConfiguration().catch(() => undefined)
  const token = readSession()?.accessToken
  if (token) void fetchCapabilities(token).catch(() => undefined)
}
