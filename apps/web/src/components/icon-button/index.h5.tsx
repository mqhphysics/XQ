import { Button, Text } from '@tarojs/components'

import backIcon from '../../assets/ui-icons/back.svg'
import closeIcon from '../../assets/ui-icons/close.svg'
import type { IconButtonProps } from './types'

import './index.h5.scss'
import './close-control.h5.scss'

export function IconButton({ icon, children, className = '', ...props }: IconButtonProps) {
  return (
    <Button {...props} className={`ui-icon-button ${className}`}>
      <Text aria-hidden="true" className="ui-icon-button__fallback">
        {children ?? (icon === 'back' ? '←' : '×')}
      </Text>
      <img
        alt=""
        aria-hidden="true"
        className="ui-icon-button__icon"
        src={icon === 'back' ? backIcon : closeIcon}
      />
    </Button>
  )
}
