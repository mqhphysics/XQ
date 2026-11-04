import { Input } from '@tarojs/components'
import { useContext, useId, type ComponentProps } from 'react'
import { NativeAuthKeyboardContext } from './auth-keyboard.weapp'
export function AuthInput(props: ComponentProps<typeof Input>) {
  const keyboard = useContext(NativeAuthKeyboardContext),
    generated = useId(),
    id = props.id || 'native-auth-field-' + generated.replace(/[^a-zA-Z0-9]/g, '')
  return (
    <Input
      {...props}
      id={id}
      adjustPosition={keyboard ? false : (props.adjustPosition ?? true)}
      onFocus={(event) => {
        keyboard?.focus(id)
        props.onFocus?.(event)
      }}
      onBlur={(event) => {
        keyboard?.blur(id)
        props.onBlur?.(event)
      }}
    />
  )
}
