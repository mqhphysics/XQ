import { Button, RootPortal, ScrollView, Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useEffect, useId, useRef, useState } from 'react'
import type { NativeDialogProps } from './index'
import { holdNativeOverlay } from '../../features/native-navigation/overlay.weapp'
import { registerDialogScroll } from '../../features/native-navigation/dialog-scroll.weapp'
import { useDialogViewport } from './dialog-viewport.weapp'
import { dialogBodyHeight } from './dialog-size.logic'
import {
  confirmNativeDiscard,
  useNativeBackLayer,
  useNativeLeaveProtection,
} from '../../features/native-navigation/leave-guard.weapp'

export function NativeDialog({
  title,
  onClose,
  onBack,
  children,
  footer,
  compact = true,
  busy = false,
  unsavedChanges = false,
  focusId,
  className = '',
  bodyHeight,
  minBodyHeight = 240,
  loading = false,
  fullScreen = false,
}: NativeDialogProps) {
  const requestClose = async () => {
    const allowed = await confirmNativeDiscard(unsavedChanges, busy)
    if (allowed) onClose()
    return allowed
  }
  const requestBack = async () => {
    if (await confirmNativeDiscard(unsavedChanges, busy)) onBack?.()
  }
  useNativeLeaveProtection(unsavedChanges, busy, onClose)
  useNativeBackLayer(async () => {
    if (onBack) await requestBack()
    else await requestClose()
    return true
  })
  const contentId = `native-dialog-content-${useId().replace(/[^a-z0-9]/gi, '')}`
  const info = Taro.getWindowInfo()
  const viewport = useDialogViewport(info)
  const [contentHeight, setContentHeight] = useState<number | null>(null)
  const height = dialogBodyHeight(viewport, {
    bodyHeight,
    compact,
    contentHeight,
    minBodyHeight,
    loading,
  })
  useEffect(() => {
    if (!compact || bodyHeight !== undefined || fullScreen) return
    let active = true
    const timer = setTimeout(
      () =>
        Taro.createSelectorQuery()
          .select(`#${contentId}`)
          .boundingClientRect()
          .select(`.native-dialog >>> #${contentId}`)
          .boundingClientRect()
          .exec((results: Array<{ height?: number } | null>) => {
            const measured = results.find((rect) => rect?.height)?.height
            if (active && measured) setContentHeight(measured)
          }),
      60,
    )
    return () => {
      active = false
      clearTimeout(timer)
    }
  }, [compact, contentId, children, bodyHeight, fullScreen])
  /* scroll-into-view cannot reach ids inside nested custom components (the RootPortal and Taro's
     comp boundary), so the focused block is measured and scrolled to with scrollTop instead. */
  const [focusTop, setFocusTop] = useState<number | null>(null)
  const scrollPosition = useRef(0),
    scrollLimit = useRef(0)
  const scrollBounds = useRef<{ top: number; bottom: number } | null>(null)
  const dragScrollingRef = useRef(false)
  const [dragScrolling, setDragScrolling] = useState(false)
  const scrollId = contentId + '-scroll'
  useEffect(
    () =>
      registerDialogScroll(contentId, {
        bounds: () => scrollBounds.current,
        active: (value) => {
          dragScrollingRef.current = value
          setDragScrolling(value)
        },
        moveBy: (delta) => {
          const next = Math.max(0, Math.min(scrollLimit.current, scrollPosition.current + delta))
          const moved = next - scrollPosition.current
          if (moved) {
            scrollPosition.current = next
            setFocusTop(next)
          }
          return moved
        },
      }),
    [contentId],
  )
  useEffect(() => {
    if (fullScreen) return
    let alive = true
    const timer = setTimeout(() => {
      const query = Taro.createSelectorQuery()
      for (const selector of [
        '#' + scrollId,
        '.native-dialog >>> #' + scrollId,
        '#' + contentId,
        '.native-dialog >>> #' + contentId,
      ])
        query.select(selector).boundingClientRect()
      query.exec((rects: Array<{ top: number; bottom: number; height: number } | null>) => {
        if (!alive) return
        const box = rects.slice(0, 2).find((r) => r?.height),
          content = rects.slice(2).find((r) => r?.height)
        if (box && content) {
          scrollBounds.current = box
          scrollLimit.current = Math.max(0, content.height - box.height)
        }
      })
    }, 40)
    return () => {
      alive = false
      clearTimeout(timer)
    }
  }, [contentId, scrollId, height, fullScreen, children])
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
  useEffect(holdNativeOverlay, [])
  return (
    <RootPortal>
      <View
        className={`native-dialog-mask${fullScreen ? ' native-dialog-mask--fullscreen' : ''}`}
        catchMove
        onClick={() => {
          if (!busy) void requestClose()
        }}
      >
        <View className="native-dialog-layout" style={fullScreen ? '' : `height:${viewport}px;`}>
          <View
            className={`native-dialog ${className}${fullScreen ? ' native-dialog--fullscreen' : ''}`}
            style={fullScreen ? `padding-top:${info.statusBarHeight || 0}px;` : ''}
            role="dialog"
            aria-label={title}
            onClick={(event) => event.stopPropagation()}
          >
            <View className="native-dialog__head">
              {onBack ? (
                <Button
                  className="native-dialog__back"
                  aria-label="返回上一级"
                  disabled={busy}
                  onClick={() => void requestBack()}
                >
                  ‹
                </Button>
              ) : (
                <View className="native-dialog__head-space" />
              )}
              <Text className="native-dialog__title">{title}</Text>
              <Button
                className="native-dialog__close"
                aria-label="关闭弹窗"
                disabled={busy}
                onClick={() => void requestClose()}
              >
                ×
              </Button>
            </View>
            {fullScreen ? (
              <View className="native-dialog__fullscreen-body">{children}</View>
            ) : (
              <ScrollView
                id={scrollId}
                className="native-dialog__body native-dialog__scroll"
                scrollY
                showScrollbar={false}
                {...(focusTop !== null ? { scrollTop: focusTop } : {})}
                scrollWithAnimation={!dragScrolling}
                onScroll={(event) => {
                  if (!dragScrollingRef.current) scrollPosition.current = event.detail.scrollTop
                }}
                style={`height:${height}px;`}
              >
                <View id={contentId} className="native-dialog__content">
                  {children}
                </View>
              </ScrollView>
            )}
            {footer && <View className="native-dialog__footer">{footer}</View>}
          </View>
        </View>
      </View>
    </RootPortal>
  )
}
