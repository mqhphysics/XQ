import { request } from './product.repository'
import { readSession, saveSession } from './session'
import type { AuthSession, AuthUser } from './product.types'

export type EmailPurpose = 'REGISTER' | 'RESET_PASSWORD' | 'LOGIN' | 'VERIFY_EMAIL'
export const emailAuth = {
  requestCode: (email: string, purpose: EmailPurpose) =>
    request<{ message: string; retryAfterSeconds: number }>('/auth/email/code', {
      method: 'POST',
      authenticated: purpose === 'VERIFY_EMAIL',
      data: { email: email.trim(), purpose },
    }),
  login: async (email: string, emailCode: string) => {
    const session = await request<AuthSession>('/auth/email/login', {
      method: 'POST',
      authenticated: false,
      data: { email: email.trim(), emailCode },
    })
    saveSession(session)
    return session
  },
  resetPassword: (email: string, emailCode: string, newPassword: string) =>
    request<void>('/auth/password/reset-by-email', {
      method: 'POST',
      authenticated: false,
      data: { email: email.trim(), emailCode, newPassword },
    }),
  verify: async (email: string, emailCode: string) => {
    const user = await request<AuthUser>('/auth/email/verify', {
      method: 'POST',
      data: { email: email.trim(), emailCode },
    })
    const session = readSession()
    if (session && session.user.id === user.id) saveSession({ ...session, user })
    return user
  },
}
