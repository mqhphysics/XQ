import { useEffect, useState } from 'react'
import { productRepository } from '../../features/product/product.repository'
import type { AuthUser } from '../../features/product/product.types'
import { ProfileInformation } from '../../pages/me/personal-information.h5'
import { ProfileDialog } from '../../pages/me/profile-dialog.h5'
export function SelfPersonEditor({
  onClose,
  onChanged,
}: {
  onClose: () => void
  onChanged: () => void
}) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    let active = true
    void productRepository
      .getMe()
      .then((result) => {
        if (active) setUser(result)
      })
      .catch((issue) => {
        if (active) setError(issue.message)
      })
    return () => {
      active = false
    }
  }, [])
  return user ? (
    <ProfileInformation
      user={user}
      onClose={onClose}
      onUserChange={(updated) => {
        setUser(updated)
        onChanged()
      }}
    />
  ) : (
    <ProfileDialog title="个人信息" onClose={onClose}>
      <p role={error ? 'alert' : 'status'}>{error || '正在读取本人资料…'}</p>
    </ProfileDialog>
  )
}
