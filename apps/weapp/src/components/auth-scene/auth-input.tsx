import { Input } from '@tarojs/components'
import type { ComponentProps } from 'react'
export function AuthInput(props: ComponentProps<typeof Input>) {
  return <Input {...props} />
}
