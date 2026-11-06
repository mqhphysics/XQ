import { Button, Image, ScrollView, Text, View } from '@tarojs/components'
import { useState } from 'react'
import Taro from '@tarojs/taro'
import { emojiGroups } from '../post-social/emoji'
import smileIcon from '../../assets/post-icons/mood-smile.svg'
import {
  addSavedNativeEmoji,
  readSavedNativeEmoji,
  removeSavedNativeEmoji,
} from '../../features/native-social/saved-emoji.weapp'
import type { NativeDraftImage } from '../../features/native-social/images.weapp'

export function NativeEmojiPanel({
  onSelect,
  onImageSelect,
  disabled = false,
}: {
  onSelect: (emoji: string) => void
  onImageSelect?: ((image: NativeDraftImage) => void | Promise<void>) | undefined
  disabled?: boolean
}) {
  const [group, setGroup] = useState(0),
    [saved, setSaved] = useState(readSavedNativeEmoji),
    [busy, setBusy] = useState(false)
  const issue = (reason: unknown) => {
    const message =
      reason instanceof Error
        ? reason.message
        : (reason as { errMsg?: string })?.errMsg || '表情操作失败'
    if (!/cancel/i.test(message)) void Taro.showToast({ title: message, icon: 'none' })
  }
  return (
    <View
      className="native-emoji-content"
      onTouchStart={(event) => event.stopPropagation()}
      onTouchMove={(event) => event.stopPropagation()}
      onTouchEnd={(event) => event.stopPropagation()}
    >
      <View className="native-emoji-panel__tabs">
        {emojiGroups.map((item, index) => (
          <Button
            key={item.id}
            className={index === group ? 'is-active' : ''}
            onClick={() => setGroup(index)}
          >
            {item.label}
          </Button>
        ))}
        {onImageSelect && (
          <Button
            className={group === emojiGroups.length ? 'is-active' : ''}
            onClick={() => setGroup(emojiGroups.length)}
          >
            收藏
          </Button>
        )}
      </View>
      <ScrollView scrollY showScrollbar={false} className="native-emoji-panel__list">
        {group < emojiGroups.length ? (
          <View className="native-emoji-grid">
            {emojiGroups[group]!.items.map((emoji) => (
              <Button
                key={emoji.value}
                disabled={disabled}
                aria-label={emoji.name}
                onClick={() => onSelect(emoji.value)}
              >
                {emoji.value}
              </Button>
            ))}
          </View>
        ) : (
          <>
            <View className="native-saved-emoji-grid">
              <Button
                className="native-saved-emoji-add"
                disabled={disabled || busy}
                loading={busy}
                aria-label="从相册添加收藏表情"
                onClick={async () => {
                  setBusy(true)
                  try {
                    setSaved(await addSavedNativeEmoji())
                  } catch (reason) {
                    issue(reason)
                  } finally {
                    setBusy(false)
                  }
                }}
              >
                ＋
              </Button>
              {saved.map((image, index) => (
                <Button
                  key={image.id}
                  disabled={disabled || busy}
                  aria-label={`发送收藏表情${index + 1}`}
                  onClick={async () => {
                    setBusy(true)
                    try {
                      await onImageSelect?.(image)
                    } catch (reason) {
                      issue(reason)
                    } finally {
                      setBusy(false)
                    }
                  }}
                  onLongPress={async () => {
                    try {
                      const action = await Taro.showActionSheet({ itemList: ['移除收藏的表情'] })
                      if (action.tapIndex === 0) setSaved(await removeSavedNativeEmoji(image.id))
                    } catch (reason) {
                      issue(reason)
                    }
                  }}
                >
                  <Image src={image.path} mode="aspectFit" lazyLoad />
                  {image.mime === 'image/gif' && (
                    <Text className="native-saved-emoji-gif">GIF</Text>
                  )}
                </Button>
              ))}
            </View>
            <Text className="native-saved-emoji-note">从相册添加图片或GIF，长按可移除</Text>
          </>
        )}
      </ScrollView>
    </View>
  )
}

export function NativeEmojiPicker({
  onSelect,
  disabled = false,
}: {
  onSelect: (emoji: string) => void
  disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  return (
    <View className="native-emoji-picker">
      <Button
        className="native-social-tool"
        aria-label="选择表情"
        disabled={disabled}
        onClick={() => setOpen(!open)}
      >
        <Image src={smileIcon} />
        <Text>表情</Text>
      </Button>
      {open && (
        <View
          className="native-emoji-panel"
          onTouchStart={(event) => event.stopPropagation()}
          onTouchMove={(event) => event.stopPropagation()}
          onTouchEnd={(event) => event.stopPropagation()}
        >
          <NativeEmojiPanel disabled={disabled} onSelect={onSelect} />
        </View>
      )}
    </View>
  )
}
