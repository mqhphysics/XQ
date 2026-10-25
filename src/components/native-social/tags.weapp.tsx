import { Button, Input, Text, View } from '@tarojs/components'
import { useEffect, useRef, useState } from 'react'
import { productRepository } from '../../features/product/product.repository'
import type { PostTag, PostTagSuggestion } from '../../features/product/product.types'
import { reportNativeKeyboardHeight } from './page-frame.weapp'

export function NativeTagPicker({
  tags,
  onChange,
  tournamentId,
  disabled = false,
}: {
  tags: PostTag[]
  onChange: (tags: PostTag[]) => void
  tournamentId?: string | undefined
  disabled?: boolean
}) {
  const [query, setQuery] = useState(''),
    [results, setResults] = useState<PostTagSuggestion[]>([]),
    [error, setError] = useState(''),
    [loading, setLoading] = useState(false)
  const sequence = useRef(0)
  useEffect(() => {
    const ticket = ++sequence.current
    const timer = setTimeout(() => {
      setLoading(true)
      void productRepository
        .getPostTagSuggestions(query, tournamentId)
        .then((data) => {
          if (ticket === sequence.current) {
            setResults(data.items)
            setError('')
          }
        })
        .catch((issue) => {
          if (ticket === sequence.current)
            setError(issue instanceof Error ? issue.message : '标签读取失败')
        })
        .finally(() => {
          if (ticket === sequence.current) setLoading(false)
        })
    }, 300)
    return () => {
      clearTimeout(timer)
      sequence.current++
    }
  }, [query, tournamentId])
  const add = (tag: PostTag) => {
    if (disabled) return
    if (tags.length >= 10) {
      setError('每条动态最多10个标签')
      return
    }
    if (
      tags.some(
        (item) =>
          item.kind === tag.kind && (item.targetId || item.label) === (tag.targetId || tag.label),
      )
    )
      return
    onChange([
      ...tags,
      { kind: tag.kind, label: tag.label, ...(tag.targetId ? { targetId: tag.targetId } : {}) },
    ])
    setError('')
    setQuery('')
  }
  return (
    <View className="native-tag-picker">
      <Text className="native-social-label">标签</Text>
      <View className="native-social-tags">
        {tags.map((tag, index) => (
          <Button
            key={`${tag.kind}:${tag.targetId || tag.label}`}
            disabled={disabled}
            onClick={() => onChange(tags.filter((_, i) => i !== index))}
          >
            #{tag.label} ×
          </Button>
        ))}
      </View>
      <Input
        className="native-field"
        value={query}
        disabled={disabled}
        maxlength={60}
        placeholder="搜索球队、球员或添加话题"
        adjustPosition={false}
        onKeyboardHeightChange={(event) => reportNativeKeyboardHeight(event.detail.height)}
        onInput={(event) => setQuery(event.detail.value.replace(/^#/, ''))}
      />
      {loading && <Text className="native-note">正在查找标签…</Text>}
      {error && <Text className="native-error">{error}</Text>}
      <View className="native-tag-suggestions">
        {results.slice(0, query ? 12 : 6).map((tag) => (
          <Button
            key={`${tag.kind}:${tag.targetId || tag.label}`}
            disabled={disabled}
            onClick={() => add(tag)}
          >
            <Text>#{tag.label}</Text>
            <Text>{tag.kind === 'TEAM' ? '球队' : tag.kind === 'PLAYER' ? '球员' : '话题'}</Text>
          </Button>
        ))}
      </View>
      {query.trim() && (
        <Button
          className="native-button native-button--quiet"
          disabled={disabled}
          onClick={() => add({ kind: 'TOPIC', label: query.trim() })}
        >
          添加话题 #{query.trim()}
        </Button>
      )}
    </View>
  )
}
