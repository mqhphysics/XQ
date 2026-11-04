import Taro from '@tarojs/taro'
import { useLayoutEffect, useRef } from 'react'

export function useDetailBack(fallbackUrl: string): void {
  const fallback = useRef(fallbackUrl)
  fallback.current = fallbackUrl
  useLayoutEffect(() => {
    if (!window.matchMedia('(min-width: 721px)').matches) return
    // A newly mounted Taro page is appended after the pages retained for Back.
    const button = [...document.querySelectorAll<HTMLElement>('.public-app--h5 .public-back')].at(
      -1,
    )
    if (!button) return
    let locked = false
    button.setAttribute('role', 'button')
    button.tabIndex = 0
    const goBack = async () => {
      if (locked) return
      locked = true
      button.setAttribute('aria-busy', 'true')
      try {
        if (Taro.getCurrentPages().length > 1) await Taro.navigateBack({ delta: 1 })
        else await Taro.redirectTo({ url: fallback.current })
      } catch {
        try {
          await Taro.redirectTo({ url: fallback.current })
        } catch {
          await Taro.showToast({ title: '返回失败，请重试', icon: 'none' })
        }
      } finally {
        locked = false
        button.removeAttribute('aria-busy')
      }
    }
    const onClick = (event: MouseEvent) => {
      event.preventDefault()
      event.stopImmediatePropagation()
      void goBack()
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        event.repeat ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        (event.key !== 'Enter' && event.key !== ' ')
      )
        return
      event.preventDefault()
      event.stopPropagation()
      void goBack()
    }
    button.addEventListener('click', onClick, true)
    button.addEventListener('keydown', onKeyDown)
    return () => {
      button.removeEventListener('click', onClick, true)
      button.removeEventListener('keydown', onKeyDown)
    }
  }, [])
}
