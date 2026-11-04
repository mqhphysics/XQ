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
  focusId,
}: NativeDialogProps) {
  const requestClose = async () => {
    const allowed = await confirmNativeDiscard(unsavedChanges, busy)
    if (allowed) onClose()
    return allowed
  }
  useNativeLeaveProtection(unsavedChanges, busy, onClose)
  useNativeBackLayer(async () => {
    await requestClose()
    return true
  })
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
  /* scroll-into-view cannot reach ids inside nested custom components (the RootPortal and Taro's
     comp boundary), so the focused block is measured and scrolled to with scrollTop instead. */
  const [focusTop, setFocusTop] = useState<number | null>(null)
  useEffect(() => {
    if (!focusId) {
      setFocusTop(null)
      return
    }
    let active = true
    const timer = setTimeout(() => {
      const query = Taro.createSelectorQuery()
      query.selectAll('.native-dialog__scroll').boundingClientRect()
      query.selectAll('.native-dialog__scroll').scrollOffset()
      query.selectAll(`#${focusId}`).boundingClientRect()
      query.selectAll(`.native-dialog >>> #${focusId}`).boundingClientRect()
      query.exec((result: unknown[]) => {
        type Box = { top?: number; scrollTop?: number }
        const list = (index: number) =>
          Array.isArray(result?.[index]) ? (result[index] as Box[]) : []
        const scroll = list(0).at(-1),
          offset = list(1).at(-1),
          target = [...list(2), ...list(3)].find((item) => typeof item?.top === 'number')
        if (!active || typeof scroll?.top !== 'number' || typeof target?.top !== 'number') return
        setFocusTop(
          Math.max(0, Math.round((offset?.scrollTop ?? 0) + target.top - scroll.top - 12)),
        )
      })
    }, 120)
    return () => {
      active = false
      clearTimeout(timer)
    }
  }, [focusId])
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
            {...(focusTop !== null ? { scrollTop: focusTop } : {})}
            scrollWithAnimation
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
