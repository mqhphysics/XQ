import { nativeWideWindow } from '../../features/native-navigation/viewport.logic.weapp'
import { PageMeta, ScrollView, View } from '@tarojs/components'
import Taro, { getCurrentInstance } from '@tarojs/taro'
import { useState } from 'react'
import {
  NativeAuthKeyboardContext,
  useAuthKeyboard,
} from '../../components/auth-scene/auth-keyboard.weapp'
import { NativeAuthScene } from '../../components/auth-scene/index.weapp'
import { loginViewportHeight } from '../../components/auth-scene/touch-field.logic'
import { NativePasswordRecovery } from './password-recovery.weapp'
import { NativeRegistrationForm, RegistrationHelp } from './registration.weapp'
import ExistingLoginPage from './login.shared'
import './index.weapp.scss'
import { NativeEmailLogin } from './email-login.weapp'
import { useNativeViewport } from '../../features/native-navigation/viewport.weapp'

export default function NativeLoginPage() {
  const [screen, setScreen] = useState<'login' | 'register'>('login')
  const [recovery, setRecovery] = useState(false)
  const [recoveryHelp, setRecoveryHelp] = useState<string | null>(null)
  const keyboard = useAuthKeyboard(),
    keyboardHeight = keyboard.effectiveHeight
  const windowInfo = useNativeViewport()
  const height = loginViewportHeight(
    windowInfo.windowHeight,
    windowInfo.screenHeight,
    keyboardHeight,
  )
  const preview = getCurrentInstance().router?.params.preview === '1'
  const safeBottom = keyboardHeight
    ? 8
    : Math.max(
        10,
        windowInfo.screenHeight - (windowInfo.safeArea?.bottom ?? windowInfo.screenHeight) + 8,
      )
  const safeTop = (windowInfo.statusBarHeight ?? 0) + 8
  const closeRecovery = () => {
    setRecovery(false)
    void Taro.hideKeyboard()
  }
  return (
    <NativeAuthKeyboardContext.Provider value={keyboard}>
      <PageMeta pageStyle="height:100%;overflow:hidden;" />
      <View
        className={`native-login native-login--${screen}${keyboard.compact ? ' native-login--keyboard' : ''}${nativeWideWindow(windowInfo) ? ' native-login--wide' : ''}`}
        style={`height:${height}px;padding-top:${safeTop}px;padding-bottom:${safeBottom}px;--native-login-content-height:${Math.max(1, height - safeTop - safeBottom)}px;`}
      >
        <ScrollView
          className="native-login__scroll"
          scrollY
          scrollIntoView={keyboard.target}
          showScrollbar={false}
          enhanced
        >
          <ExistingLoginPage
            visual={
              <NativeAuthScene
                key={`${screen}:${recovery ? 'recovery' : 'page'}`}
                layoutKey={`${screen}:${height}`}
                active={!recovery && !keyboard.compact}
                interactive={screen === 'login' && !recovery}
              />
            }
            onScreenChange={setScreen}
            onRequestRecovery={() => {
              void Taro.hideKeyboard()
              setRecovery(true)
            }}
            redirectAuthenticated={!preview}
            registrationForm={<NativeRegistrationForm />}
            emailLoginForm={<NativeEmailLogin />}
          />
        </ScrollView>
        {recovery && (
          <NativePasswordRecovery
            onClose={closeRecovery}
            onHelp={(email) => {
              closeRecovery()
              setRecoveryHelp(email)
            }}
          />
        )}
        {recoveryHelp !== null && (
          <RegistrationHelp
            title="账号找回申请"
            value={{
              realName: '',
              studentId: '',
              email: recoveryHelp,
              password: '',
              confirmPassword: '',
            }}
            onClose={() => setRecoveryHelp(null)}
          />
        )}
      </View>
    </NativeAuthKeyboardContext.Provider>
  )
}
