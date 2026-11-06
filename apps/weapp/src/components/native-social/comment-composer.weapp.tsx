import { Button, Image, RootPortal, Text, Textarea, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useEffect, useRef, useState } from 'react'
import { useNativeBackLayer } from '../../features/native-navigation/leave-guard.weapp'
import { appendEmoji } from '../../features/native-social/interaction.logic.weapp'
import type { NativeDraftImage } from '../../features/native-social/images.weapp'
import { NativeEmojiPanel } from './emoji.weapp'
import { reportNativeKeyboardHeight, useNativeKeyboardViewport } from './page-frame.weapp'
import smileIcon from '../../assets/post-icons/mood-smile.svg'
import photoIcon from '../../assets/post-icons/photo.svg'
import './social.weapp.scss'
import { NativeKeyboardTools } from './keyboard-tools.weapp'

interface CommentComposerProps {
  value: string
  images: NativeDraftImage[]
  onChange: (body: string) => void
  onSend: () => void
  onPhotos: () => void
  onSavedImage: (image: NativeDraftImage) => Promise<void>
  onRemoveImage: (index: number) => void
  open: boolean
  onOpenChange: (open: boolean) => void
  repost: boolean
  onRepostChange: (value: boolean) => void
  canRepost: boolean
  busy: boolean
  processing: boolean
  placeholder: string
  error?: string
}
export function NativeCommentComposer(props: CommentComposerProps) {
  return (
    <>
      <View className="native-comment-entry" onTouchStart={(event) => event.stopPropagation()}>
        <Button
          className={`native-comment-entry__field${props.value ? ' has-value' : ''}`}
          onClick={() => props.onOpenChange(true)}
        >
          <Text>
            {props.value ||
              (props.images.length ? `已添加${props.images.length}张图片` : props.placeholder)}
          </Text>
        </Button>
        <Button
          className="native-comment-publish"
          disabled={props.busy || props.processing || (!props.value.trim() && !props.images.length)}
          loading={props.busy}
          onClick={props.onSend}
        >
          发布
        </Button>
      </View>
      {props.open && <NativeCommentSheet {...props} />}
    </>
  )
}
function NativeCommentSheet(props: CommentComposerProps) {
  const { height, keyboard } = useNativeKeyboardViewport()
  const [emojiOpen, setEmojiOpen] = useState(false),
    [focus, setFocus] = useState(false),
    [cursor, setCursor] = useState(-1)
  const at = useRef(props.value.length)
  const close = () => {
    props.onOpenChange(false)
    void Taro.hideKeyboard().catch(() => {})
  }
  useNativeBackLayer(async () => {
    close()
    return true
  }, true)
  useEffect(() => {
    Taro.eventCenter.trigger('xiaoqiu:native-overlay', true)
    Taro.nextTick(() => setFocus(true))
    return () => {
      Taro.eventCenter.trigger('xiaoqiu:native-overlay', false)
    }
  }, [])
  return (
    <RootPortal>
      <View
        className={`native-comment-overlay${keyboard ? ' is-keyboard' : ''}`}
        style={`height:${height}px;`}
        onClick={close}
        catchMove
      >
        <View
          className="native-comment-sheet"
          onClick={(event) => event.stopPropagation()}
          onTouchStart={(event) => event.stopPropagation()}
          onTouchMove={(event) => event.stopPropagation()}
          onTouchEnd={(event) => event.stopPropagation()}
        >
          <View className="native-comment-sheet__head">
            <Text>
              {props.placeholder.startsWith('回复')
                ? props.placeholder.replace(/…$/, '')
                : '发表评论'}
            </Text>
            <Button aria-label="收起评论输入框" onClick={close}>
              ×
            </Button>
          </View>
          <Textarea
            className="native-comment-sheet__text"
            value={props.value}
            cursor={cursor}
            focus={focus && !emojiOpen}
            fixed
            holdKeyboard
            maxlength={300}
            placeholder={props.placeholder}
            showConfirmBar={false}
            adjustPosition={false}
            disabled={props.busy}
            onInput={(event) => {
              at.current = event.detail.cursor
              setCursor(-1)
              props.onChange(event.detail.value)
            }}
            onFocus={() => {
              setEmojiOpen(false)
              setFocus(true)
            }}
            onBlur={(event) => {
              at.current = event.detail.cursor ?? props.value.length
              setFocus(false)
            }}
            onKeyboardHeightChange={(event) => reportNativeKeyboardHeight(event.detail.height)}
          >
            <NativeKeyboardTools
              onPhotos={props.onPhotos}
              onEmoji={() => {
                setEmojiOpen(true)
                setFocus(false)
                void Taro.hideKeyboard().catch(() => {})
              }}
              disabled={props.busy || props.processing}
              photosDisabled={props.images.length >= 3}
              onSend={props.onSend}
              sendDisabled={!props.value.trim() && !props.images.length}
              repost={props.repost}
              onRepostChange={props.canRepost ? props.onRepostChange : undefined}
            />
          </Textarea>
          {props.images.length > 0 && (
            <View className="native-comment-draft-images">
              {props.images.map((image, index) => (
                <View key={image.path}>
                  <Image
                    src={image.path}
                    mode="aspectFit"
                    onClick={() =>
                      void Taro.previewImage({
                        current: image.path,
                        urls: props.images.map((item) => item.path),
                      })
                    }
                  />
                  <Button
                    aria-label={`移除第${index + 1}张图片`}
                    disabled={props.busy}
                    onClick={() => props.onRemoveImage(index)}
                  >
                    ×
                  </Button>
                  {image.mime === 'image/gif' && <Text>GIF</Text>}
                </View>
              ))}
            </View>
          )}
          {props.error && <Text className="native-comment-sheet__error">{props.error}</Text>}
          <View className="native-comment-sheet__toolbar">
            {props.canRepost && (
              <Button
                className={`native-comment-repost-toggle${props.repost ? ' is-selected' : ''}`}
                aria-label="同时转发到动态"
                aria-pressed={props.repost}
                disabled={props.busy}
                onClick={() => props.onRepostChange(!props.repost)}
              >
                <View>{props.repost ? '✓' : ''}</View>
                <Text>转到动态</Text>
              </Button>
            )}
            <Button
              className="native-comment-tool"
              aria-label="选择表情"
              disabled={props.busy}
              onClick={() => {
                setEmojiOpen(!emojiOpen)
                setFocus(false)
                void Taro.hideKeyboard().catch(() => {})
              }}
            >
              <Image src={smileIcon} />
            </Button>
            <Button
              className="native-comment-tool"
              aria-label="添加评论图片"
              disabled={props.busy || props.processing || props.images.length >= 3}
              loading={props.processing}
              onClick={props.onPhotos}
            >
              <Image src={photoIcon} />
            </Button>
            <Button
              className="native-comment-publish"
              disabled={
                props.busy || props.processing || (!props.value.trim() && !props.images.length)
              }
              loading={props.busy}
              onClick={props.onSend}
            >
              发布
            </Button>
          </View>
          {emojiOpen && (
            <NativeEmojiPanel
              disabled={props.busy || props.processing}
              onSelect={(emoji) => {
                const next = appendEmoji(props.value, emoji, at.current, 300)
                at.current = next.cursor
                setCursor(next.cursor)
                props.onChange(next.body)
              }}
              onImageSelect={props.onSavedImage}
            />
          )}
        </View>
      </View>
    </RootPortal>
  )
}
