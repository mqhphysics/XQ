import { Button, Input, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useLayoutEffect, useRef, useState } from 'react'

import { animateSearchEntrance, captureSearchOrigin, openSearchPage } from './search-transition'

import './persistent-header-search.scss'

interface SearchProps {
  expanded?: boolean
  query?: string
  searching?: boolean
  onQueryChange?: (value: string) => void
  onSearch?: (value: string) => void
}

export function PersistentHeaderSearch({
  expanded = false,
  query,
  searching = false,
  onQueryChange,
  onSearch,
}: SearchProps) {
  const [draft, setDraft] = useState('')
  const elementRef = useRef<HTMLElement | null>(null)
  const value = query ?? draft

  useLayoutEffect(() => {
    if (!expanded || typeof window === 'undefined' || !elementRef.current) return
    let cancelAnimation = () => {}
    const frame = window.requestAnimationFrame(() => {
      if (!elementRef.current) return
      cancelAnimation = animateSearchEntrance(elementRef.current)
      if (window.matchMedia('(min-width: 721px)').matches) {
        elementRef.current.querySelector('input')?.focus({ preventScroll: true })
      }
    })
    return () => {
      window.cancelAnimationFrame(frame)
      cancelAnimation()
    }
  }, [expanded])

  const submit = async (text: string) => {
    const term = text.trim()
    if (!term && !expanded) return
    if (!expanded && typeof window !== 'undefined' && elementRef.current) {
      captureSearchOrigin(elementRef.current)
    }
    if (onSearch) {
      onSearch(term)
      return
    }
    try {
      await openSearchPage(term)
    } catch {
      await Taro.showToast({ title: '搜索未能打开，请重试', icon: 'none' })
    }
  }

  return (
    <View
      className={`persistent-header-search ${expanded ? 'persistent-header-search--expanded' : ''}`}
      ref={elementRef}
    >
      <View aria-hidden="true" className="persistent-header-search__frame" />
      <Input
        aria-label="搜索球员、球队、比赛或动态"
        className="persistent-header-search__input"
        confirmType="search"
        placeholder="搜索球员、球队、比赛或动态"
        value={value}
        onConfirm={(event) => void submit(event.detail.value)}
        onInput={(event) => {
          if (onQueryChange) onQueryChange(event.detail.value)
          else setDraft(event.detail.value)
        }}
      />
      <Button
        aria-label="搜索"
        className="persistent-header-search__submit"
        onClick={() => void submit(value)}
      >
        <View
          aria-hidden="true"
          className={`persistent-header-search__icon ${searching ? 'persistent-header-search__icon--loading' : ''}`}
        />
      </Button>
    </View>
  )
}
