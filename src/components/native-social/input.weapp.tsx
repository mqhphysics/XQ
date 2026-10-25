import { Button, Textarea, View } from '@tarojs/components'
import { useRef, useState } from 'react'
import { appendEmoji } from '../../features/native-social/interaction.logic.weapp'
import { NativeEmojiPicker } from './emoji.weapp'
import './social.weapp.scss'
import { reportNativeKeyboardHeight } from './page-frame.weapp'

export function NativeSocialInput({
  value,
  onChange,
  onSend,
  placeholder,
  maximum = 300,
  busy = false,
  label = '发送',
  adjustPosition = true,
}: {
  value: string
  onChange: (value: string) => void
  onSend: () => void
  placeholder: string
  maximum?: number
  busy?: boolean
  label?: string
  adjustPosition?: boolean
}) {
  const at = useRef(value.length),
    [cursor, setCursor] = useState(-1)
  const [active, setActive] = useState(false)
  return (
    <View className="native-social-input" onTouchStart={(event) => event.stopPropagation()}>
      <View className="native-social-input__row">
        <Textarea
          className="native-social-input__text"
          value={value}
          cursor={cursor}
          maxlength={maximum}
          placeholder={placeholder}
          adjustPosition={adjustPosition}
          cursorSpacing={16}
          showConfirmBar={false}
          disabled={busy}
          holdKeyboard
          onFocus={() => setActive(true)}
          onKeyboardHeightChange={(event) => reportNativeKeyboardHeight(event.detail.height)}
          onInput={(event) => {
            at.current = event.detail.cursor
            onChange(event.detail.value)
            setCursor(-1)
          }}
          onBlur={(event) => {
            at.current = event.detail.cursor ?? value.length
          }}
        />
        <Button
          className="native-button native-button--primary"
          disabled={busy || !value.trim()}
          loading={busy}
          onClick={onSend}
        >
          {label}
        </Button>
      </View>
      {active && (
        <View className="native-social-input__tools">
          <NativeEmojiPicker
            disabled={busy}
            onSelect={(emoji) => {
              const next = appendEmoji(value, emoji, at.current, maximum)
              at.current = next.cursor
              setCursor(next.cursor)
              onChange(next.body)
            }}
          />
        </View>
      )}
    </View>
  )
}
