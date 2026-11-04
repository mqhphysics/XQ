import { useEffect, useRef, useState } from 'react'
import { productRepository } from '../../features/product/product.repository'
import type { PostTag, PostTagSuggestion } from '../../features/product/product.types'
import { PostIcon } from '../post-social/icons'
import './index.h5.scss'

export function tagKey(tag: PostTag) {
  return `${tag.kind}:${tag.targetId ?? normalizeLabel(tag.label)}`
}
function normalizeLabel(label: string) {
  return label.normalize('NFKC').replace(/^#+/, '').trim().toLocaleLowerCase('zh-CN')
}
export function PostTagPicker({
  tags,
  onChange,
  disabled,
  tournamentId,
  onPendingChange,
}: {
  tags: PostTag[]
  onChange: (tags: PostTag[]) => void
  disabled: boolean
  tournamentId?: string | undefined
  onPendingChange: (value: boolean) => void
}) {
  const [query, setQuery] = useState('')
  const [options, setOptions] = useState<PostTagSuggestion[]>([])
  const [primaryTag, setPrimaryTag] = useState<PostTagSuggestion | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [resolving, setResolving] = useState(false)
  const action = useRef(false)
  const input = useRef<HTMLInputElement>(null)
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    let active = true
    setLoading(true)
    setOptions([])
    setError('')
    const timer = window.setTimeout(
      () => {
        void Promise.all([
          productRepository.getPostTagSuggestions(query, tournamentId),
          !query ? productRepository.getTeamPreferences(tournamentId) : Promise.resolve(null),
        ])
          .then(([result, preferences]) => {
            if (active) {
              setOptions(result.items)
              if (preferences)
                setPrimaryTag(
                  preferences.primaryTeam
                    ? {
                        kind: 'TEAM',
                        targetId: preferences.primaryTeam.id,
                        label: preferences.primaryTeam.name,
                        description: '我的主队',
                      }
                    : null,
                )
            }
          })
          .catch((issue) => {
            if (active) setError(issue instanceof Error ? issue.message : '标签建议暂不可用')
          })
          .finally(() => {
            if (active) setLoading(false)
          })
      },
      query ? 200 : 0,
    )
    return () => {
      active = false
      window.clearTimeout(timer)
    }
  }, [query, tournamentId, retry])
  const add = (tag: PostTag) => {
    if (disabled) return
    if (tags.some((current) => tagKey(current) === tagKey(tag))) {
      setQuery('')
      setError('这个标签已经添加')
      return
    }
    if (tags.length >= 10) {
      setError('每条动态最多添加 10 个标签')
      return
    }
    onChange([
      ...tags,
      { kind: tag.kind, label: tag.label, ...(tag.targetId ? { targetId: tag.targetId } : {}) },
    ])
    setQuery('')
    setError('')
    input.current?.focus()
  }
  const fromInput = async () => {
    if (disabled || action.current || !query.trim()) return
    const label = query.normalize('NFKC').trim().replace(/^#+/, '').trim()
    if (!label || Array.from(label).length > 30 || /[\p{Cc}\p{Cf}]/u.test(label)) {
      setError('自定义标签应为 1 至 30 个可见字符')
      return
    }
    action.current = true
    setResolving(true)
    onPendingChange(true)
    setError('')
    try {
      const current = await productRepository.getPostTagSuggestions(label, tournamentId)
      const matches = current.items.filter(
        (tag) => normalizeLabel(tag.label) === normalizeLabel(label),
      )
      const entities = matches.filter((tag) => tag.kind !== 'TOPIC')
      if (entities.length > 1) {
        setOptions(current.items)
        setError('有多个同名球队或球员，请从建议中选择')
        return
      }
      add(entities[0] ?? matches[0] ?? { kind: 'TOPIC', label })
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : '无法读取标签建议，请重试')
    } finally {
      action.current = false
      setResolving(false)
      onPendingChange(false)
      requestAnimationFrame(() => input.current?.focus())
    }
  }
  const recommended =
    !query && primaryTag
      ? [primaryTag, ...options.filter((tag) => tagKey(tag) !== tagKey(primaryTag))]
      : options
  const visible = recommended.filter(
    (tag) => !tags.some((current) => tagKey(current) === tagKey(tag)),
  )
  const suggestions = visible.slice(0, 4)
  return (
    <section className="post-tag-picker" aria-label="添加动态标签">
      <div className="post-tag-picker__input-area">
        {tags.map((tag) => (
          <span key={tagKey(tag)} className="post-tag post-tag--selected">
            #{tag.label}
            <button
              type="button"
              data-post-tag
              aria-label={`删除标签 ${tag.label}`}
              disabled={disabled || resolving}
              onClick={() => {
                onChange(tags.filter((current) => tagKey(current) !== tagKey(tag)))
                requestAnimationFrame(() => input.current?.focus())
              }}
            >
              <PostIcon name="close" />
            </button>
          </span>
        ))}
        <input
          ref={input}
          data-post-tag-input
          aria-label="输入动态标签"
          placeholder={
            tags.length >= 10
              ? '最多 10 个标签，删除后可继续添加'
              : tags.length
                ? '输入后回车继续添加'
                : '添加标签，输入后按回车'
          }
          value={query}
          maxLength={60}
          disabled={disabled || resolving || tags.length >= 10}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (
              event.key === 'Enter' &&
              !event.ctrlKey &&
              !event.metaKey &&
              !event.nativeEvent.isComposing &&
              event.nativeEvent.keyCode !== 229
            ) {
              event.preventDefault()
              event.stopPropagation()
              void fromInput()
            }
          }}
        />
      </div>
      <div className="post-tag-picker__suggestions" aria-label={query ? '标签建议' : '常用标签'}>
        {resolving ? (
          <small>正在添加标签…</small>
        ) : loading ? (
          <small>正在查找…</small>
        ) : (
          suggestions.map((tag) => (
            <button
              type="button"
              data-post-tag
              key={tagKey(tag)}
              aria-label={`添加标签 ${tag.label}${tag.description ? `，${tag.description}` : ''}`}
              title={tag.description ? `${tag.label} · ${tag.description}` : tag.label}
              disabled={disabled || resolving || tags.length >= 10}
              onClick={() => add(tag)}
            >
              #{tag.label}
            </button>
          ))
        )}
        {!loading && query && !visible.length && !error ? (
          <small>按回车创建「{query}」话题标签</small>
        ) : null}
      </div>
      {error ? (
        <div role="alert" className="post-tag-picker__error">
          {error}
          <button
            type="button"
            data-post-tag
            disabled={disabled || resolving}
            onClick={() => setRetry((value) => value + 1)}
          >
            重试
          </button>
        </div>
      ) : null}
    </section>
  )
}
