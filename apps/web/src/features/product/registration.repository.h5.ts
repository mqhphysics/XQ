import { request } from './product.repository'
import { saveSession } from './session.h5'
import type { AuthSession } from './product.types'

export interface StudentRegistrationInput {
  realName: string
  studentId: string
  email?: string
  emailCode?: string
  password: string
}
export interface RegistrationCheck {
  eligible: boolean
  reason: string
  message: string
}
export const studentRegistration = {
  check: (realName: string, studentId: string) =>
    request<RegistrationCheck>('/auth/registration-check', {
      method: 'POST',
      authenticated: false,
      data: { realName, studentId },
    }),
  register: async (input: StudentRegistrationInput) => {
    const session = await request<AuthSession>('/auth/register', {
      method: 'POST',
      authenticated: false,
      data: input,
    })
    saveSession(session)
    return session
  },
  feedback: (input: {
    clientRequestId: string
    realName?: string
    studentNumber?: string
    contactEmail?: string
    details: string
  }) =>
    request<{ accepted: boolean; id: string; message: string }>('/auth/registration-feedback', {
      method: 'POST',
      authenticated: false,
      data: input,
    }),
}
