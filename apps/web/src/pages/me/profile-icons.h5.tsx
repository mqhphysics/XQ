import pencil from '../../assets/profile-icons/pencil.svg'
import bell from '../../assets/profile-icons/bell.svg'
import star from '../../assets/profile-icons/star.svg'
import users from '../../assets/profile-icons/users.svg'
import exchange from '../../assets/profile-icons/arrows-exchange.svg'
import pin from '../../assets/profile-icons/map-pin.svg'
import calendar from '../../assets/profile-icons/calendar.svg'
import shield from '../../assets/profile-icons/shield-check.svg'
import logout from '../../assets/profile-icons/logout.svg'
import arrow from '../../assets/profile-icons/arrow-right.svg'
import check from '../../assets/profile-icons/check.svg'
import user from '../../assets/profile-icons/user-circle.svg'
import trophy from '../../assets/profile-icons/trophy.svg'
import bookmark from '../../assets/profile-icons/bookmark.svg'
import comment from '../../assets/post-icons/message-circle.svg'
import close from '../../assets/post-icons/x.svg'
import reset from '../../assets/post-icons/refresh.svg'
import heart from '../../assets/post-icons/heart.svg'
import more from '../../assets/post-icons/dots.svg'
import send from '../../assets/post-icons/send.svg'
import plus from '../../assets/post-icons/plus.svg'
import right from '../../assets/post-icons/chevron-right.svg'

const icons = {
  pencil,
  bell,
  star,
  users,
  exchange,
  pin,
  calendar,
  shield,
  logout,
  arrow,
  check,
  user,
  trophy,
  bookmark,
  comment,
  close,
  reset,
  heart,
  more,
  send,
  plus,
  right,
}
export type ProfileIconName = keyof typeof icons | 'settings'
export function ProfileIcon({ name }: { name: ProfileIconName }) {
  if (name === 'settings')
    return (
      <svg
        className="profile-icon"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path
          strokeLinejoin="round"
          d="M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915"
        />
        <circle cx="12" cy="12" r="3" />
      </svg>
    )
  return <img className="profile-icon" src={icons[name]} alt="" aria-hidden="true" />
}
