import { Image } from '@tarojs/components'
import { resolveMediaUrl } from '../../features/product/product.repository'

export const TBD_LABEL = '待定'

export function TbdCrest({
  size = 'medium',
  className = '',
}: {
  size?: 'small' | 'medium' | 'large' | number
  hint?: string | null | undefined
  className?: string
}) {
  return (
    <Image
      aria-label="待定球队队徽"
      mode="aspectFit"
      className={`team-crest team-crest--${typeof size === 'number' ? 'medium' : size} ${className}`}
      src={resolveMediaUrl('/api/media/defaults/team-crest-v1.webp') ?? ''}
    />
  )
}

export const tbdName = (name: string | null | undefined) => name || TBD_LABEL
