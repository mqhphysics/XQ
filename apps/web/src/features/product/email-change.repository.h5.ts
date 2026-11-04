import { request } from './product.repository'
import { readSession, saveSession } from './session.h5'
import type { AuthUser } from './product.types'
export interface EmailChangeFlow {
  id: string
  stage: 'OLD_EMAIL' | 'NEW_EMAIL' | 'COMPLETED'
  currentEmail: string | null
  newEmail: string | null
  expiresAt: string
}
export const emailChange = {
  start: () => request<EmailChangeFlow>('/auth/email/change/start', { method: 'POST' }),
  requestCode: (changeId: string, newEmail?: string) =>
    request<{ message: string; retryAfterSeconds: number }>('/auth/email/change/code', {
      method: 'POST',
      data: { changeId, ...(newEmail ? { newEmail } : {}) },
    }),
  verifyOld: (changeId: string, emailCode: string) =>
    request<EmailChangeFlow>('/auth/email/change/verify-old', {
      method: 'POST',
      data: { changeId, emailCode },
    }),
  complete: async (changeId: string, emailCode: string) => {
    const before = readSession()
    const user = await request<AuthUser>('/auth/email/change/complete', {
      method: 'POST',
      data: { changeId, emailCode },
    })
    const current = readSession()
    if (!before || current?.accessToken !== before.accessToken || current.user.id !== user.id)
      throw new Error('账号已切换，请重新打开个人信息')
    saveSession({ ...current, user })
    return user
  },
}
export async function updatePublicProfile(patch: {
  displayName?: string
  bio?: string
  showPlayerIdentity?: boolean
}) {
  const before = readSession()
  const user = await request<AuthUser>('/auth/me', { method: 'PATCH', data: patch })
  const current = readSession()
  if (!before || current?.accessToken !== before.accessToken || current.user.id !== user.id)
    throw new Error('账号已切换，请重新打开个人信息')
  saveSession({ ...current, user })
  return user
}
