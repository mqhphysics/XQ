import type { ImgHTMLAttributes } from 'react'
import close from '../../assets/post-icons/x.svg'
import left from '../../assets/post-icons/chevron-left.svg'
import right from '../../assets/post-icons/chevron-right.svg'
import heart from '../../assets/post-icons/heart.svg'
import comment from '../../assets/post-icons/message-circle.svg'
import photo from '../../assets/post-icons/photo.svg'
import smile from '../../assets/post-icons/mood-smile.svg'
import zoomIn from '../../assets/post-icons/zoom-in.svg'
import zoomOut from '../../assets/post-icons/zoom-out.svg'
import reset from '../../assets/post-icons/refresh.svg'
import send from '../../assets/post-icons/send.svg'
import more from '../../assets/post-icons/dots.svg'
import plus from '../../assets/post-icons/plus.svg'
import bookmark from '../../assets/post-icons/bookmark.svg'
import repost from '../../assets/post-icons/repost.svg'

const icons = {
  close,
  left,
  right,
  heart,
  comment,
  photo,
  smile,
  zoomIn,
  zoomOut,
  reset,
  send,
  more,
  plus,
  bookmark,
  repost,
}
export function PostIcon({
  name,
  ...props
}: { name: keyof typeof icons } & ImgHTMLAttributes<HTMLImageElement>) {
  return (
    <img
      {...props}
      className={'post-icon ' + (props.className ?? '')}
      src={icons[name]}
      alt=""
      aria-hidden="true"
    />
  )
}
