import { Text } from '@tarojs/components'

export const TBD_LABEL = '待定'

/** Mini-program keeps its compact grey 待定 square. */
export function TbdCrest({
  size = 'medium',
  className = '',
}: {
  size?: 'small' | 'medium' | 'large' | number
  hint?: string | null | undefined
  className?: string
}) {
  const named = typeof size === 'number' ? 'medium' : size
  return (
    <Text
      aria-label="球队待定"
      className={`team-crest team-crest--${named} team-crest--fallback ${className}`}
      style={{ backgroundColor: '#8a948c' }}
    >
      待定
    </Text>
  )
}

export function tbdName(name: string | null | undefined): string {
  return name || TBD_LABEL
}
