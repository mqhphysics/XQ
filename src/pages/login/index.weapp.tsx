import { Button, Input, PageMeta, ScrollView, Text, View } from '@tarojs/components'
import Taro, { getCurrentInstance } from '@tarojs/taro'
import { useEffect, useState } from 'react'
import { NativeAuthScene } from '../../components/auth-scene/index.weapp'
import { loginViewportHeight } from '../../components/auth-scene/touch-field.logic'
import { productRepository } from '../../features/product/product.repository'
import { NativeRegistrationForm } from './registration.weapp'
import ExistingLoginPage from './login.shared'
import './index.weapp.scss'
import { NativeEmailLogin } from './email-login.weapp'

export default function NativeLoginPage() {
  const [screen, setScreen] = useState<'login' | 'register'>('login')
  const [recovery, setRecovery] = useState(false)
  const [keyboardHeight, setKeyboardHeight] = useState(0)
  const windowInfo = Taro.getWindowInfo()
  const height = loginViewportHeight(
    windowInfo.windowHeight,
    windowInfo.screenHeight,
    keyboardHeight,
  )
  const preview = getCurrentInstance().router?.params.preview === '1'
  useEffect(() => {
    const keyboardChanged = (event: { height: number }) => setKeyboardHeight(event.height)
    Taro.onKeyboardHeightChange(keyboardChanged)
    return () => Taro.offKeyboardHeightChange(keyboardChanged)
  }, [])
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
    <>
      <PageMeta pageStyle="height:100%;overflow:hidden;" />
      <View
        className={`native-login native-login--${screen}${keyboardHeight ? ' native-login--keyboard' : ''}`}
        style={`height:${height}px;padding-top:${safeTop}px;padding-bottom:${safeBottom}px;--native-login-content-height:${Math.max(1, height - safeTop - safeBottom)}px;`}
      >
        <ScrollView
          className="native-login__scroll"
          scrollY={screen === 'register'}
          {...(screen === 'login' ? { scrollTop: 0 } : {})}
          showScrollbar={false}
          enhanced
        >
          <ExistingLoginPage
            visual={
              <NativeAuthScene
                key={`${screen}:${recovery ? 'recovery' : 'page'}`}
                layoutKey={`${screen}:${height}`}
                active={!recovery && keyboardHeight === 0}
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
        {recovery && <RecoveryDialog onClose={closeRecovery} />}
      </View>
    </>
  )
}

function RecoveryDialog({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState('')
  const [studentId, setStudentId] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const reset = async () => {
    if (!name.trim() || !studentId.trim() || Array.from(password).length < 6 || submitting) return
    setSubmitting(true)
    setError('')
    try {
      await productRepository.resetPasswordByIdentity(name, studentId, password)
      onClose()
      await Taro.showToast({ title: '密码已重置，请登录', icon: 'success' })
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '重置失败，请重试。')
    } finally {
      setSubmitting(false)
    }
  }
  return (
    <View
      className="native-recovery"
      catchMove
      onClick={() => {
        if (!submitting) onClose()
      }}
    >
      <View
        className="native-recovery__dialog recovery-box"
        role="dialog"
        aria-label="找回密码"
        onClick={(event) => event.stopPropagation()}
      >
        <View className="recovery-box__head">
          <Text>找回密码</Text>
          <Button
            className="native-recovery__close"
            aria-label="关闭找回密码"
            disabled={submitting}
            onClick={onClose}
          >
            ×
          </Button>
        </View>
        <ScrollView className="native-recovery__body" scrollY>
          <Text className="auth-label">真实姓名</Text>
          <Input
            className="auth-input"
            value={name}
            placeholder="真实姓名"
            onInput={(event) => setName(event.detail.value)}
          />
          <Text className="auth-label">学号</Text>
          <Input
            className="auth-input"
            value={studentId}
            placeholder="学号"
            onInput={(event) => setStudentId(event.detail.value)}
          />
          <Text className="auth-label">新密码</Text>
          <Input
            className="auth-input"
            password
            value={password}
            placeholder="至少 6 位密码"
            onInput={(event) => setPassword(event.detail.value)}
          />
          {error && <Text className="native-recovery__error">{error}</Text>}
          <Button
            className="auth-secondary"
            loading={submitting}
            disabled={
              !name.trim() || !studentId.trim() || Array.from(password).length < 6 || submitting
            }
            onClick={() => void reset()}
          >
            重置密码
          </Button>
        </ScrollView>
      </View>
    </View>
  )
}
