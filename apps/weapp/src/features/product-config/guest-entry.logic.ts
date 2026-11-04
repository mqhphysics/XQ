import type { GuestEntryPolicy } from '../../../../../packages/contracts/src/product-config'
import { runFeatureAction } from './product-config.logic.ts'

export const GUEST_ENTRY_ROUTE = '/pages/index/index'

/** Route dispatch only; no guest storage/session is created and no API permission is granted. */
export function dispatchGuestEntry(
  policy: GuestEntryPolicy,
  reLaunch: (options: { url: string }) => Promise<unknown>,
  notify: (message: string) => void | Promise<unknown>,
): Promise<boolean> {
  return runFeatureAction(
    policy,
    async () => {
      await reLaunch({ url: GUEST_ENTRY_ROUTE })
    },
    notify,
  )
}
