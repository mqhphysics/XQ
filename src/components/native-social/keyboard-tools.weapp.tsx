import { CoverImage, CoverView, KeyboardAccessory } from '@tarojs/components'
import photo from '../../assets/post-icons/photo.weapp.png'
import smile from '../../assets/post-icons/mood-smile.weapp.png'

export function NativeKeyboardTools({
  onPhotos,
  onEmoji,
  disabled = false,
  photosDisabled = false,
  onSend,
  sendDisabled = false,
  repost,
  onRepostChange,
}: {
  onPhotos: () => void
  onEmoji: () => void
  disabled?: boolean
  photosDisabled?: boolean
  onSend?: (() => void) | undefined
  sendDisabled?: boolean
  repost?: boolean
  onRepostChange?: ((next: boolean) => void) | undefined
}) {
  return (
    <KeyboardAccessory className="native-keyboard-tools">
      <CoverView className="native-keyboard-tools__row">
        {onRepostChange && (
          <CoverView
            className="native-keyboard-tools__repost"
            onClick={() => {
              if (!disabled) onRepostChange(!repost)
            }}
          >
            <CoverView className={`native-keyboard-tools__circle${repost ? ' is-selected' : ''}`}>
              {repost ? '✓' : ''}
            </CoverView>
            <CoverView>转到动态</CoverView>
          </CoverView>
        )}
        <CoverView
          className={`native-keyboard-tools__tool${disabled ? ' is-disabled' : ''}`}
          onClick={() => {
            if (!disabled) onEmoji()
          }}
        >
          <CoverImage src={smile} />
          <CoverView>{onSend ? '' : '表情'}</CoverView>
        </CoverView>
        <CoverView
          className={`native-keyboard-tools__tool${disabled || photosDisabled ? ' is-disabled' : ''}`}
          onClick={() => {
            if (!disabled && !photosDisabled) onPhotos()
          }}
        >
          <CoverImage src={photo} />
          <CoverView>{onSend ? '' : '图片'}</CoverView>
        </CoverView>
        {onSend && (
          <CoverView
            className={`native-keyboard-tools__publish${disabled || sendDisabled ? ' is-disabled' : ''}`}
            onClick={() => {
              if (!disabled && !sendDisabled) onSend()
            }}
          >
            发布
          </CoverView>
        )}
      </CoverView>
    </KeyboardAccessory>
  )
}
