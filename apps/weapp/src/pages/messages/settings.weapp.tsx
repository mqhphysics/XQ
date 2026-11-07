import { Button, Picker, ScrollView, Switch, Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useContext, useEffect, useRef, useState } from 'react'
import { NativeSocialPage } from '../../components/native-social/page-frame.weapp'
import { UserAvatar } from '../../components/product-ui'
import { NativeDetailActiveContext } from '../../features/native-navigation/detail-context.weapp'
import { openNativeDetail } from '../../features/native-navigation/index.weapp'
import { useNativeLeaveProtection } from '../../features/native-navigation/leave-guard.weapp'
import { messageRepository } from '../../features/messages/repository.weapp'
import { refreshInbox } from '../../features/messages/inbox.weapp'
import { MessageIcon } from '../../features/messages/icons.weapp'
import type {
  BlockedUserList,
  MessagePreferences,
  ReminderAudience,
} from '../../features/messages/types'
import { readSession } from '../../features/product/session'
import './index.weapp.scss'

const audiences: ReminderAudience[] = ['ALL', 'FOLLOWING', 'NONE']
const audienceLabels = ['所有人', '关注的人', '不接受提醒']
const signature = (value: MessagePreferences | null) =>
  value
    ? [value.likes, value.replies, value.directMessages, value.systemMessages, value.badges].join(
        '|',
      )
    : ''
export function MessageSettings({ blocked = false }: { blocked?: boolean }) {
  return blocked ? <BlockedUsers /> : <Preferences />
}
function Preferences() {
  const active = useContext(NativeDetailActiveContext)
  const [value, setValue] = useState<MessagePreferences | null>(null),
    [saved, setSaved] = useState('')
  const [error, setError] = useState(''),
    [busy, setBusy] = useState(false)
  const lock = useRef(false),
    sequence = useRef(0)
  const dirty = Boolean(value && signature(value) !== saved)
  useNativeLeaveProtection(dirty, busy, () => setSaved(signature(value)), true)
  const load = async () => {
    const token = readSession()?.accessToken,
      ticket = ++sequence.current
    try {
      const result = await messageRepository.preferences()
      if (ticket !== sequence.current || token !== readSession()?.accessToken) return
      setValue(result)
      setSaved(signature(result))
      setError('')
    } catch (reason) {
      if (ticket === sequence.current)
        setError(reason instanceof Error ? reason.message : '消息设置读取失败')
    }
  }
  useEffect(() => {
    if (active && !value) void load()
    return () => {
      sequence.current++
    }
  }, [active])
  const update = (patch: Partial<MessagePreferences>) =>
    setValue((previous) => (previous ? { ...previous, ...patch } : previous))
  const save = async () => {
    if (!value || lock.current) return
    lock.current = true
    setBusy(true)
    const token = readSession()?.accessToken
    try {
      const result = await messageRepository.savePreferences(value)
      if (token !== readSession()?.accessToken) return
      setValue(result)
      setSaved(signature(result))
      setError('')
      await refreshInbox(true)
      void Taro.showToast({ title: '消息设置已保存', icon: 'none' })
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '设置保存失败，请重试')
    } finally {
      lock.current = false
      setBusy(false)
    }
  }
  return (
    <NativeSocialPage
      title="消息设置"
      centerTitle
      footer={
        <Button
          className="native-button native-button--primary native-message-save"
          disabled={!value || !dirty || busy}
          loading={busy}
          onClick={() => void save()}
        >
          保存设置
        </Button>
      }
    >
      <ScrollView className="native-social-scroll" scrollY showScrollbar={false}>
        <View className="native-message-settings">
          {error && (
            <View className="native-mail-error">
              <Text className="native-error">{error}</Text>
              <Button className="native-button" disabled={busy} onClick={() => void load()}>
                重新读取
              </Button>
            </View>
          )}
          {!value && !error && <Text className="native-note">正在读取消息设置…</Text>}
          {value && (
            <>
              <Text className="native-message-settings__heading">互动提醒</Text>
              {(['likes', 'replies'] as const).map((key) => (
                <Picker
                  key={key}
                  mode="selector"
                  range={audienceLabels}
                  value={audiences.indexOf(value[key])}
                  disabled={busy}
                  onChange={(event) =>
                    update({ [key]: audiences[Number(event.detail.value)] || 'ALL' })
                  }
                >
                  <View className="native-message-setting-row">
                    <View>
                      <Text>{key === 'likes' ? '收到点赞' : '收到回复与@'}</Text>
                    </View>
                    <Text className="native-message-setting-row__value">
                      {audienceLabels[audiences.indexOf(value[key])]} ›
                    </Text>
                  </View>
                </Picker>
              ))}
              <Text className="native-message-settings__note">
                “关注的人”指你已关注的球员所关联的账号。不接受提醒仍可在对应分类中查看消息。
              </Text>
              <Text className="native-message-settings__heading">消息提示</Text>
              <View className="native-message-setting-row">
                <View>
                  <Text>私信提醒</Text>
                  <Text>在消息入口显示未读私信数量</Text>
                </View>
                <Switch
                  color="#356447"
                  checked={value.directMessages}
                  disabled={busy}
                  onChange={(event) => update({ directMessages: event.detail.value })}
                />
              </View>
              <View className="native-message-setting-row">
                <View>
                  <Text>系统消息提醒</Text>
                  <Text>有新通知时显示红点</Text>
                </View>
                <Switch
                  color="#356447"
                  checked={value.systemMessages}
                  disabled={busy}
                  onChange={(event) => update({ systemMessages: event.detail.value })}
                />
              </View>
              <View className="native-message-setting-row">
                <View>
                  <Text>显示未读标记</Text>
                  <Text>控制入口图标与消息头像上的角标</Text>
                </View>
                <Switch
                  color="#356447"
                  checked={value.badges}
                  disabled={busy}
                  onChange={(event) => update({ badges: event.detail.value })}
                />
              </View>
              <Text className="native-message-settings__note">
                这里控制小程序内的未读提醒，不会替你开启微信订阅通知。
              </Text>
            </>
          )}
          <Button
            className="native-message-setting-link"
            onClick={() => void openNativeDetail('/pages/messages/index?category=blocked')}
          >
            <MessageIcon name="block" />
            <Text>黑名单</Text>
            <Text>›</Text>
          </Button>
        </View>
      </ScrollView>
    </NativeSocialPage>
  )
}
function BlockedUsers() {
  const active = useContext(NativeDetailActiveContext)
  const [items, setItems] = useState<BlockedUserList['items']>([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(''),
    [busy, setBusy] = useState('')
  const sequence = useRef(0),
    lock = useRef(false)
  const load = async () => {
    const token = readSession()?.accessToken,
      ticket = ++sequence.current
    try {
      const result = await messageRepository.blockedUsers()
      if (ticket === sequence.current && token === readSession()?.accessToken) {
        setItems(result.items)
        setError('')
      }
    } catch (reason) {
      if (ticket === sequence.current)
        setError(reason instanceof Error ? reason.message : '黑名单读取失败')
    } finally {
      if (ticket === sequence.current) setLoading(false)
    }
  }
  useEffect(() => {
    if (active) void load()
    return () => {
      sequence.current++
    }
  }, [active])
  const unblock = async (userId: string) => {
    if (lock.current) return
    lock.current = true
    setBusy(userId)
    const session = readSession()
    try {
      const result = await messageRepository.unblock(userId)
      if (!session || session.accessToken !== readSession()?.accessToken) return
      if (!result.blocked) {
        setItems((previous) => previous.filter((item) => item.id !== userId))
        Taro.eventCenter.trigger('xiaoqiu:native-blocks-changed', {
          owner: session.user.id,
          userId,
          blocked: false,
        })
        void refreshInbox(true)
        void Taro.showToast({ title: '已解除拉黑', icon: 'none' })
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '解除失败，请重试')
    } finally {
      lock.current = false
      setBusy('')
    }
  }
  return (
    <NativeSocialPage title="黑名单" centerTitle>
      <ScrollView className="native-social-scroll" scrollY>
        <View className="native-message-settings">
          <Text className="native-message-settings__note">
            拉黑后，对方不能向你发私信或评论你的内容；你也不会看到对方的动态与评论。
          </Text>
          {error && (
            <View className="native-mail-error">
              <Text className="native-error">{error}</Text>
              <Button className="native-button" onClick={() => void load()}>
                重试
              </Button>
            </View>
          )}
          {items.map((item) => (
            <View className="native-message-blocked-row" key={item.id}>
              <UserAvatar name={item.displayName} avatarUrl={item.avatarUrl} />
              <Text>{item.displayName}</Text>
              <Button
                disabled={Boolean(busy)}
                loading={busy === item.id}
                onClick={() => void unblock(item.id)}
              >
                解除
              </Button>
            </View>
          ))}
          {!items.length && (
            <Text className="native-mail-empty">
              {loading ? '正在读取黑名单…' : '暂无拉黑的用户'}
            </Text>
          )}
        </View>
      </ScrollView>
    </NativeSocialPage>
  )
}
