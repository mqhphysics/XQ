import { request } from './product.repository'

export interface StudentRegistrationItem {
  id: string
  version: number
  status: 'PENDING' | 'APPROVED' | 'RETURNED' | 'REJECTED'
  realName: string
  studentNumber: string
  reason: string
  decisionNote: string | null
}
export interface StudentRegistrationState {
  items: StudentRegistrationItem[]
  current?: { realName: string; studentNumber: string }
}
export const studentRegistrationRepository = {
  load: (refresh = false) =>
    request<StudentRegistrationState>('/me/campus/registration', { refresh }),
  submit: (
    data: { expectedVersion: number; realName: string; studentNumber: string; reason?: string },
    key: string,
  ) =>
    request<{ saved: boolean }>('/me/campus/registration', {
      method: 'POST',
      data,
      headers: { 'Idempotency-Key': key },
    }),
}
