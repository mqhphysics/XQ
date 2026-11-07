import { useEffect, useState } from 'react'
import { readSession, subscribeToSessionWrites } from './session'
import { studentRegistrationRepository } from './student-registration.repository.weapp'
import { studentNumberLabel } from './student-registration-display.logic'
import type { AuthUser, AuthSession } from './product.types'

const sessionKey = (session: AuthSession | null) =>
  session ? `${session.user.organizationId}:${session.user.id}:${session.accessToken}` : ''

/** Uses the repository's account-scoped GET cache and in-flight deduplication; never polls. */
export function useStudentNumberLabel(user: AuthUser | null, active = true): string {
  const [revision, setRevision] = useState(0)
  const [value, setValue] = useState({ owner: '', label: '' })
  const session = readSession()
  const matches =
    session?.user.id === user?.id && session?.user.organizationId === user?.organizationId
  const owner = matches ? sessionKey(session) : ''
  const verified = (matches ? user?.studentId || session?.user.studentId : '') || ''
  useEffect(() => subscribeToSessionWrites(() => setRevision((current) => current + 1)), [])
  useEffect(() => {
    if (!active || !owner || verified) return
    let alive = true
    void studentRegistrationRepository
      .load()
      .then((data) => {
        if (alive && owner === sessionKey(readSession()))
          setValue({ owner, label: studentNumberLabel(data.current?.studentNumber, data.items) })
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [owner, active, verified, revision])
  return verified || (value.owner === owner ? value.label : '')
}
