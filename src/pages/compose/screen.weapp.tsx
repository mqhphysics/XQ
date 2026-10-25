import { Button, Image, ScrollView, Text, Textarea, View } from '@tarojs/components'
import Taro, { getCurrentInstance } from '@tarojs/taro'
import { useEffect, useRef, useState } from 'react'
import {
  NativeSocialPage,
  reportNativeKeyboardHeight,
} from '../../components/native-social/page-frame.weapp'
import { NativeEmojiPanel } from '../../components/native-social/emoji.weapp'
import { NativeTagPicker } from '../../components/native-social/tags.weapp'
import { UserAvatar } from '../../components/product-ui'
import { useNativeLeaveProtection } from '../../features/native-navigation/leave-guard.weapp'
import { createClientActionId, productRepository } from '../../features/product/product.repository'
import { useNativeCurrentUser } from '../../features/product/current-user.weapp'
import type { PostDetail, PostTag } from '../../features/product/product.types'
import { readSession } from '../../features/product/session'
import {
  readNativeDraft,
  saveNativeDraft,
  clearNativeDraft,
  nativeSocialApi,
} from '../../features/native-social/runtime.weapp'
import { nativeWriteEnabled } from '../../features/native-social/config.weapp'
import { appendEmoji } from '../../features/native-social/interaction.logic.weapp'
import { finishNativeSocialPage } from '../../features/native-social/routing.weapp'
import {
  chooseNativePostImages,
  copyNativeDraftImage,
  nativeImageData,
  releaseNativePostImages,
  type NativeDraftImage,
} from '../../features/native-social/images.weapp'
import photoIcon from '../../assets/post-icons/photo.svg'
import smileIcon from '../../assets/post-icons/mood-smile.svg'
import { NativeKeyboardTools } from '../../components/native-social/keyboard-tools.weapp'

interface Draft {
  body: string
  tags: PostTag[]
  images: NativeDraftImage[]
  signature: string
  id: string
}
const blank = (): Draft => ({ body: '', tags: [], images: [], signature: '', id: '' })
export default function NativeComposeScreen(
  supplied: {
    tournamentId?: string | undefined
    teamId?: string | undefined
    quotePostId?: string | undefined
  } = {},
) {
  const params = { ...getCurrentInstance().router?.params, ...supplied }
  const tournamentId = params.tournamentId || '',
    teamId = params.teamId || '',
    quoteId = params.quotePostId || ''
  const scope = `post:${tournamentId}:${teamId}:${quoteId}`
  const [draft, setDraft] = useState(() => readNativeDraft(scope, blank())),
    current = useRef(draft)
  current.current = draft
  const [quote, setQuote] = useState<PostDetail | null>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [processing, setProcessing] = useState(false)
  const [emojiOpen, setEmojiOpen] = useState(false),
    [cursor, setCursor] = useState(-1)
  const cursorAt = useRef(draft.body.length),
    lock = useRef(false),
    processingLock = useRef(false)
  const user = useNativeCurrentUser()
  const update = (patch: Partial<Draft>) => {
    const next = { ...current.current, ...patch }
    current.current = next
    setDraft(next)
    saveNativeDraft(scope, next)
  }
  const discard = () => {
    void releaseNativePostImages(current.current.images)
    clearNativeDraft(scope)
    const next = blank()
    current.current = next
    setDraft(next)
  }
  useNativeLeaveProtection(
    Boolean(draft.body.trim() || draft.images.length || draft.tags.length),
    busy || processing,
    discard,
    true,
  )
  useEffect(() => {
    if (!quoteId) return
    let active = true
    void productRepository
      .getPost(quoteId)
      .then((post) => {
        if (active) setQuote(post)
      })
      .catch((issue) => {
        if (active) setError(issue.message)
      })
    return () => {
      active = false
    }
  }, [quoteId])
  const photos = async () => {
    if (processingLock.current || draft.images.length >= 9 || busy) return
    processingLock.current = true
    setProcessing(true)
    setError('')
    try {
      const images = await chooseNativePostImages(9 - current.current.images.length)
      update({ images: [...current.current.images, ...images] })
    } catch (issue) {
      const message =
        issue instanceof Error
          ? issue.message
          : String((issue as { errMsg?: string })?.errMsg || '图片处理失败')
      if (!/cancel/i.test(message)) setError(message)
    } finally {
      processingLock.current = false
      setProcessing(false)
    }
  }
  const savedImage = async (image: NativeDraftImage) => {
    if (processingLock.current || lock.current) return
    if (current.current.images.length >= 9) throw new Error('每条动态最多9张图片')
    processingLock.current = true
    setProcessing(true)
    try {
      const copied = await copyNativeDraftImage(image)
      update({ images: [...current.current.images, copied] })
    } finally {
      processingLock.current = false
      setProcessing(false)
    }
  }
  const publish = async () => {
    if (lock.current || processing || !nativeWriteEnabled('publishPosts')) return
    const data = current.current
    const token = readSession()?.accessToken
    if (!data.body.trim() && !data.images.length && !quoteId) return
    lock.current = true
    setBusy(true)
    setError('')
    try {
      const images = await Promise.all(data.images.map(nativeImageData))
      if (token !== readSession()?.accessToken) throw new Error('账号已切换，请重新打开页面')
      if (images.reduce((sum, image) => sum + image.length, 0) > 24_000_000)
        throw new Error('图片合计过大，请减少图片后再发布')
      const signature = JSON.stringify([
        data.body.trim(),
        data.tags,
        data.images.map((image) => image.path),
        quoteId,
        tournamentId,
        teamId,
      ])
      const id =
        data.signature === signature && data.id ? data.id : createClientActionId('native-post')
      update({ signature, id })
      const post = await nativeSocialApi.createPost(
        data.body.trim(),
        id,
        undefined,
        teamId || undefined,
        undefined,
        images,
        data.tags,
        tournamentId || undefined,
        quoteId || undefined,
      )
      Taro.eventCenter.trigger('xiaoqiu:native-post-published', post)
      discard()
      lock.current = false
      setBusy(false)
      await new Promise<void>((resolve) => Taro.nextTick(resolve))
      await finishNativeSocialPage()
      await Taro.showToast({ title: '发布成功', icon: 'success' })
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : '发布失败，草稿已保留，请重试')
    } finally {
      lock.current = false
      setBusy(false)
    }
  }
  const allowed = nativeWriteEnabled('publishPosts') && Boolean(user)
  return (
    <NativeSocialPage
      title={quoteId ? '转发到动态' : '发布动态'}
      action={
        <>
          <Text className="native-note">{draft.body.length}/500</Text>
          <Button
            className="native-button native-button--primary"
            disabled={
              !allowed ||
              busy ||
              processing ||
              (!draft.body.trim() && !draft.images.length && !quoteId)
            }
            loading={busy}
            onClick={() => void publish()}
          >
            发布
          </Button>
        </>
      }
      footer={
        allowed ? (
          <View>
            <View className="native-compose-tools">
              <Button
                className="native-social-tool"
                disabled={busy || processing || draft.images.length >= 9}
                loading={processing}
                onClick={() => void photos()}
              >
                <Image src={photoIcon} />
                <Text>图片 {draft.images.length}/9</Text>
              </Button>
              <Button
                className="native-social-tool"
                disabled={busy}
                onClick={() => {
                  setEmojiOpen(!emojiOpen)
                  void Taro.hideKeyboard().catch(() => {})
                }}
              >
                <Image src={smileIcon} />
                <Text>表情</Text>
              </Button>
            </View>
            {emojiOpen && (
              <NativeEmojiPanel
                disabled={busy || processing}
                onImageSelect={savedImage}
                onSelect={(emoji) => {
                  const next = appendEmoji(draft.body, emoji, cursorAt.current, 500)
                  update({ body: next.body })
                  cursorAt.current = next.cursor
                  setCursor(next.cursor)
                }}
              />
            )}
          </View>
        ) : undefined
      }
    >
      <ScrollView className="native-social-scroll" scrollY showScrollbar={false} enhanced>
        <View className="native-compose-body">
          {!allowed && (
            <Text className="native-social-error">
              {user ? '发布功能暂未开放' : '请先登录账号后发布动态'}
            </Text>
          )}
          <View className="native-compose-identity">
            <UserAvatar name={user?.displayName || '我'} avatarUrl={user?.avatarUrl || null} />
            <View>
              <Text>{user?.displayName || '我'}</Text>
              <Text>分享你的绿茵时刻</Text>
            </View>
          </View>
          <Textarea
            className="native-compose-text"
            placeholder={quoteId ? '说说你的想法（选填）…' : '今天的球场，有什么想分享的？'}
            value={draft.body}
            cursor={cursor}
            maxlength={500}
            adjustPosition={false}
            showConfirmBar={false}
            holdKeyboard
            disabled={busy || !allowed}
            onInput={(event) => {
              cursorAt.current = event.detail.cursor
              setCursor(-1)
              update({ body: event.detail.value })
            }}
            onBlur={(event) => {
              cursorAt.current = event.detail.cursor ?? draft.body.length
            }}
            onFocus={() => setEmojiOpen(false)}
            onKeyboardHeightChange={(event) => reportNativeKeyboardHeight(event.detail.height)}
          >
            <NativeKeyboardTools
              onPhotos={() => void photos()}
              onEmoji={() => {
                setEmojiOpen(true)
                void Taro.hideKeyboard().catch(() => {})
              }}
              disabled={busy || processing}
              photosDisabled={draft.images.length >= 9}
            />
          </Textarea>
          {quote && (
            <View className="native-compose-quote">
              <Text>转发 @{quote.author.displayName}</Text>
              <Text>{quote.title || quote.body || '原动态'}</Text>
            </View>
          )}
          {draft.images.length > 0 && (
            <View className="native-compose-images">
              {draft.images.map((image, index) => (
                <View key={image.path}>
                  <Image
                    src={image.path}
                    mode="aspectFill"
                    onClick={() =>
                      void Taro.previewImage({
                        current: image.path,
                        urls: draft.images.map((item) => item.path),
                      })
                    }
                  />
                  <Button
                    disabled={busy}
                    aria-label={`移除第${index + 1}张图片`}
                    onClick={() => {
                      update({ images: draft.images.filter((_, i) => i !== index) })
                      void releaseNativePostImages([image])
                    }}
                  >
                    ×
                  </Button>
                  {image.mime === 'image/gif' && <Text>GIF</Text>}
                </View>
              ))}
            </View>
          )}
          <NativeTagPicker
            tags={draft.tags}
            tournamentId={tournamentId || undefined}
            disabled={busy}
            onChange={(tags) => update({ tags })}
          />
          {error && <Text className="native-social-error">{error}</Text>}
        </View>
      </ScrollView>
    </NativeSocialPage>
  )
}
