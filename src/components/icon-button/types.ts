import type { Button } from '@tarojs/components'
import type { ComponentProps, ReactNode } from 'react'

export interface IconButtonProps extends Omit<ComponentProps<typeof Button>, 'children'> {
  icon: 'back' | 'close'
  'aria-label': string
  children?: ReactNode
}
