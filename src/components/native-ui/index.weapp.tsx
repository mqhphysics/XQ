import { Button, RootPortal, ScrollView, Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useEffect, useId, useRef, useState } from 'react'
import type { NativeDialogProps } from './index'
import {
  confirmNativeDiscard,
  useNativeBackLayer,
  useNativeLeaveProtection,
} from '../../features/native-navigation/leave-guard.weapp'

export function NativeDialog({
  title,
  onClose,
  children,
  footer,
  compact = true,
  busy = false,
  unsavedChanges = false,
}: NativeDialogProps) {
  const requestClose = async () => {
    const allowed = await confirmNativeDiscard(unsavedChanges, busy)
    if (allowed) onClose()
    return allowed
  }
  useNativeLeaveProtection(unsavedChanges, busy, onClose)
  useNativeBackLayer(requestClose)
  const contentId = `native-dialog-content-${useId().replace(/[^a-z0-9]/gi, '')}`
  const info = Taro.getWindowInfo()
  const baseline = useRef(info.windowHeight)
  const [windowHeight, setWindowHeight] = useState(info.windowHeight)
  const [keyboard, setKeyboard] = useState(0)
  const [contentHeight, setContentHeight] = useState<number | null>(null)
  const viewport = keyboard ? Math.min(windowHeight, baseline.current - keyboard) : windowHeight
  const maximum = Math.max(100, Math.min(460, viewport - 160))
  const height = compact
    ? Math.min(contentHeight ?? 240, maximum)
    : Math.min(maximum, viewport * 0.57)
  useEffect(() => {
    const measure = () =>
      Taro.createSelectorQuery()
        .select('.mobile-tabbar')
        .boundingClientRect((rect) => {
          const bottom = (rect as { bottom?: number })?.bottom
          if (bottom && bottom > 100) {
            baseline.current = bottom
            setWindowHeight(bottom)
          }
        })
        .exec()
    const timer = setTimeout(measure, 60)
    Taro.onWindowResize(measure)
    const changed = (event: { height: number }) => setKeyboard(event.height)
    Taro.onKeyboardHeightChange(changed)
    return () => {
      clearTimeout(timer)
      Taro.offWindowResize(measure)
      Taro.offKeyboardHeightChange(changed)
      void Taro.hideKeyboard().catch(() => {})
    }
  }, [])
  useEffect(() => {
    if (!compact) return
    let active = true
    const timer = setTimeout(
      () =>
        Taro.createSelectorQuery()
          .select(`#${contentId}`)
          .boundingClientRect((rect) => {
            const measured = (rect as { height?: number })?.height
            if (active && measured) setContentHeight(measured)
          })
          .exec(),
      60,
    )
    return () => {
      active = false
      clearTimeout(timer)
    }
  }, [compact, contentId, children])
  useEffect(() => {
    Taro.eventCenter.trigger('xiaoqiu:native-overlay', true)
    return () => {
      Taro.eventCenter.trigger('xiaoqiu:native-overlay', false)
    }
  }, [])
  return (
    <RootPortal>
      <View
        className="native-dialog-mask"
        style={`height:${Math.max(1, viewport)}px;`}
        catchMove
        onClick={() => {
          if (!busy) void requestClose()
        }}
      >
        <View
          className="native-dialog"
          role="dialog"
          aria-label={title}
          onClick={(event) => event.stopPropagation()}
        >
          <View className="native-dialog__head">
            <Text>{title}</Text>
            <Button
              className="native-dialog__close"
              aria-label="关闭弹窗"
              disabled={busy}
              onClick={() => void requestClose()}
            >
              ×
            </Button>
          </View>
          <ScrollView
            className="native-dialog__body native-dialog__scroll"
            scrollY
            showScrollbar={false}
            style={`height:${height}px;`}
          >
            <View id={contentId} className="native-dialog__content">
              {children}
            </View>
          </ScrollView>
          {footer && <View className="native-dialog__footer">{footer}</View>}
        </View>
      </View>
    </RootPortal>
  )
}
