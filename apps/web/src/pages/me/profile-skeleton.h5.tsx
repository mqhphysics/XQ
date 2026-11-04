import './profile-skeleton.h5.scss'

/** Instant 我的 placeholder in the real layout while account data loads (desktop H5). */
export function ProfileSkeleton() {
  return (
    <div className="profile-skeleton" role="status" aria-label="正在读取账户">
      <div className="profile-skeleton__top">
        <div className="profile-skeleton__card profile-skeleton__person">
          <i className="profile-skeleton__banner" />
          <i className="profile-skeleton__avatar" />
          <i className="profile-skeleton__line profile-skeleton__line--title" />
          <i className="profile-skeleton__line" />
        </div>
        <div className="profile-skeleton__card profile-skeleton__hero" />
      </div>
      <div className="profile-skeleton__grid">
        <div className="profile-skeleton__card">
          <i className="profile-skeleton__line profile-skeleton__line--title" />
          <div className="profile-skeleton__tiles">
            {Array.from({ length: 8 }, (_, index) => (
              <i key={index} />
            ))}
          </div>
        </div>
        <div className="profile-skeleton__card">
          <i className="profile-skeleton__line profile-skeleton__line--title" />
          <i className="profile-skeleton__line" />
          <i className="profile-skeleton__line profile-skeleton__line--short" />
        </div>
      </div>
    </div>
  )
}
