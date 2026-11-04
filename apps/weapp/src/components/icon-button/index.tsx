import { Button } from '@tarojs/components'

import type { IconButtonProps } from './types'

// Keep existing button content and styling outside the desktop H5 implementation.
export function IconButton({ icon, children, ...props }: IconButtonProps) {
  return <Button {...props}>{children ?? (icon === 'back' ? '←' : '×')}</Button>
}
