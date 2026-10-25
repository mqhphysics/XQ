import { readSession } from './session'
import type { AuthUser } from './product.types'

/** Current account user. Mini-program pages re-read the session on show. */
export function useSessionUser(): AuthUser | null {
  return readSession()?.user ?? null
}
