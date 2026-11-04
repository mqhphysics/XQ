import { useRef, useState } from 'react'
import { UserAvatar } from '../../components/product-ui'
import { AvatarCropper } from '../../components/avatar-cropper'
import {
  MediaAccountEntry,
  MediaUploadButton,
  usePersonalBackground,
} from '../../features/managed-media/index.h5'
import { ReportModal } from '../../components/report-modal'
import { productRepository } from '../../features/product/product.repository'
import { updatePublicProfile } from '../../features/product/email-change.repository.h5'
import type { DesktopProfileProps } from './desktop-profile'
import { ProfileDialog } from './profile-dialog.h5'
import { EmailChangeDialog } from './email-change-dialog.h5'
import { personalBackgroundUrl } from '../../features/managed-media/backgrounds.h5'
import './personal-information.h5.scss'
import { PlayerIdentityPreference } from '../../features/campus/player-identity-preference.h5'
import { StudentNumberField } from './student-registration.h5'

export function ProfileInformation({
  user,
  onUserChange,
  onClose,
  onAvatar,
}: Pick<DesktopProfileProps, 'user' | 'onUserChange'> & {
  onClose: () => void
  onAvatar?: () => void
}) {
  const [editing, setEditing] = useState<'name' | 'bio' | null>(null)
  const [correction, setCorrection] = useState(false),
    [avatar, setAvatar] = useState(false),
    [email, setEmail] = useState(false)
  const background = usePersonalBackground(user.id)
  return (
    <ProfileDialog
      title="个人信息"
      note="公开资料与仅本人可见的账户信息。"
      className="profile-info-dialog"
      onClose={onClose}
    >
      <div className="profile-info-list">
        <div className="profile-info-row">
          <span>头像</span>
          <UserAvatar name={user.displayName} avatarUrl={user.avatarUrl} size="small" />
          <button data-profile-button onClick={onAvatar ?? (() => setAvatar(true))}>
            更换
          </button>
        </div>
        {editing === 'name' ? (
          <InlineProfileField
            key="name"
            user={user}
            field="name"
            onUserChange={onUserChange}
            onClose={() => setEditing(null)}
          />
        ) : (
          <div className="profile-info-row">
            <span>昵称</span>
            <strong>{user.displayName}</strong>
            <button data-profile-button onClick={() => setEditing('name')}>
              更改
            </button>
          </div>
        )}
        <div className="profile-info-row">
          <span>个人背景</span>
          <span className="profile-info-background-cell">
            <img
              className="profile-info-background"
              src={personalBackgroundUrl(background ?? user.coverUrl)}
              alt="个人背景"
            />
          </span>
          <MediaUploadButton purpose="USER_BACKGROUND" targetId={user.id} label="更换" />
        </div>
        {editing === 'bio' ? (
          <InlineProfileField
            key="bio"
            user={user}
            field="bio"
            onUserChange={onUserChange}
            onClose={() => setEditing(null)}
          />
        ) : (
          <div className="profile-info-row">
            <span>个人简介</span>
            <span>{user.bio || '还没有填写简介'}</span>
            <button data-profile-button onClick={() => setEditing('bio')}>
              更改
            </button>
          </div>
        )}
        <p className="profile-info-private">以下信息仅本人可见</p>
        <div className="profile-info-row">
          <span>姓名</span>
          <strong>{user.realName || '未登记'}</strong>
          <button data-profile-button onClick={() => setCorrection(true)}>
            申请更正
          </button>
        </div>
        <StudentNumberField studentId={user.studentId} onCorrection={() => setCorrection(true)} />
        <div className="profile-info-row">
          <span>绑定邮箱</span>
          <span>{user.email || '未绑定'}</span>
          <button data-profile-button onClick={() => setEmail(true)}>
            {user.email ? '换绑' : '绑定'}
          </button>
        </div>
      </div>
      <div className="profile-info-media">
        <PlayerIdentityPreference onChanged={onUserChange} />
        <MediaAccountEntry includeBackground={false} />
      </div>
      {email && (
        <EmailChangeDialog user={user} onChanged={onUserChange} onClose={() => setEmail(false)} />
      )}
      {correction && (
        <ReportModal
          targetType="FEEDBACK"
          title="实名资料更正申请"
          onClose={() => setCorrection(false)}
        />
      )}
      {avatar && (
        <AvatarCropper
          onCancel={() => setAvatar(false)}
          onConfirm={async (dataUrl) => {
            const result = await productRepository.uploadAvatar(dataUrl)
            onUserChange(result.user)
            setAvatar(false)
          }}
        />
      )}
    </ProfileDialog>
  )
}

function InlineProfileField({
  user,
  onUserChange,
  onClose,
  field,
}: Pick<DesktopProfileProps, 'user' | 'onUserChange'> & {
  onClose: () => void
  field: 'name' | 'bio'
}) {
  const [value, setValue] = useState(field === 'name' ? user.displayName : (user.bio ?? ''))
  const [error, setError] = useState(''),
    [saving, setSaving] = useState(false)
  const lock = useRef(false)
  const save = async (event: React.FormEvent) => {
    event.preventDefault()
    if (lock.current) return
    if (field === 'name' && value.trim().length < 2) {
      setError('昵称至少需要2个字')
      return
    }
    lock.current = true
    setSaving(true)
    setError('')
    try {
      onUserChange(
        await updatePublicProfile(
          field === 'name' ? { displayName: value.trim() } : { bio: value.trim() },
        ),
      )
      onClose()
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : '保存未完成，请重试')
    } finally {
      lock.current = false
      setSaving(false)
    }
  }
  return (
    <form
      className={`profile-info-row profile-info-row--editing profile-info-row--${field}`}
      aria-label={field === 'name' ? '编辑昵称' : '编辑个人简介'}
      onSubmit={(event) => void save(event)}
    >
      <span>{field === 'name' ? '昵称' : '个人简介'}</span>
      <div
        className={`profile-info-edit-area ${field === 'bio' ? 'profile-info-edit-area--bio' : ''}`}
      >
        {field === 'name' ? (
          <input
            className="profile-info-inline-input"
            aria-label="昵称"
            autoComplete="nickname"
            autoFocus
            value={value}
            maxLength={120}
            style={{
              width: `${Math.min(
                220,
                Math.max(
                  88,
                  Array.from(value).reduce(
                    (width, char) => width + (char.charCodeAt(0) > 255 ? 13 : 7),
                    16,
                  ),
                ),
              )}px`,
            }}
            required
            onChange={(event) => setValue(event.target.value)}
          />
        ) : (
          <textarea
            className="profile-info-inline-bio"
            aria-label="个人简介"
            autoFocus
            value={value}
            rows={3}
            maxLength={280}
            onChange={(event) => setValue(event.target.value)}
          />
        )}
        <div className="profile-info-inline-actions">
          <button data-profile-button disabled={saving}>
            {saving ? '保存中…' : '保存'}
          </button>
          <button data-profile-button type="button" disabled={saving} onClick={onClose}>
            取消
          </button>
        </div>
      </div>
      {error && (
        <p className="profile-info-inline-error" role="alert">
          {error}
        </p>
      )}
    </form>
  )
}
