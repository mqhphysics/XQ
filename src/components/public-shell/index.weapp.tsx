import { View } from '@tarojs/components'
import { useContext } from 'react'
import {
  NativeInlineContentContext,
  NativePanelContext,
} from '../native-navigation/panel-context.weapp'
import { PublicShell as SharedShell, type PublicShellProps } from './public-shell.shared'
export { updatePrimaryTeamCache } from './public-shell.shared'
export function PublicShell(props: PublicShellProps) {
  const panel = useContext(NativePanelContext)
  const inline = useContext(NativeInlineContentContext)
  if (inline) return <>{props.children}</>
  return panel?.embedded ? (
    <View
      className={`native-main-panel-body native-main-panel-body--${props.active}${props.active === 'home' ? ' public-app--home' : ''}`}
    >
      {props.children}
    </View>
  ) : (
    <SharedShell {...props} />
  )
}
