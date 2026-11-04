import { request } from './product.repository'
import { saveSession } from './session'
import type { AuthSession } from './product.types'

export interface RegistrationCheck {
  eligible: boolean
  reason: string
  message: string
}
export const nativeRegistration = {
  check: (realName: string, studentId: string) =>
    request<RegistrationCheck>('/auth/registration-check', {
      method: 'POST',
      authenticated: false,
      data: { realName, studentId },
    }),
  register: async (input: {
    realName: string
    studentId: string
    password: string
    email?: string
    emailCode?: string
  }) => {
    const session = await request<AuthSession>('/auth/register', {
      method: 'POST',
      authenticated: false,
      data: input,
    })
    saveSession(session)
  },
  feedback: (input: {
    clientRequestId: string
    realName?: string
    studentNumber?: string
    contactEmail?: string
    details: string
  }) =>
    request<{ message: string }>('/auth/registration-feedback', {
      method: 'POST',
      authenticated: false,
      data: input,
    }),
}
