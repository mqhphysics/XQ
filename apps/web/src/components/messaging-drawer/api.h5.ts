import type { MessageCategory } from './message-categories.h5'
import type { MessageUser } from '../../features/product/product.types'

export type OpenMessagingRequest =
  | MessageUser
  | { conversationId: string }
  | { chooseRecipient: true }
  | { category: MessageCategory }
  | undefined

const listeners = new Set<(request: OpenMessagingRequest) => void>()

export function openMessaging(request?: Exclude<OpenMessagingRequest, undefined>): void {
  for (const listener of listeners) listener(request)
}

export function subscribeMessaging(listener: (request: OpenMessagingRequest) => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
