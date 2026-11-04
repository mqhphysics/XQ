import { Fragment, useEffect, useRef, useState } from 'react'
import { emojiByValue, emojiGroups, emojiPattern } from './emoji'
import { PostIcon } from './icons'

export function EmojiText({ children }: { children: string }) {
  const pieces = []
  let offset = 0
  for (const match of children.matchAll(emojiPattern)) {
    const index = match.index!
    if (index > offset) pieces.push(children.slice(offset, index))
    const emoji = emojiByValue.get(match[0])
    pieces.push(
      <img
        className="post-inline-emoji"
        key={index}
        src={emoji!.source}
        alt={match[0]}
        title={emoji!.name}
      />,
    )
    offset = index + match[0].length
  }
  if (offset < children.length) pieces.push(children.slice(offset))
  return (
    <>
      {pieces.map((piece, index) => (
        <Fragment key={index}>{piece}</Fragment>
      ))}
    </>
  )
}

export function EmojiPicker({
  onSelect,
  disabled = false,
}: {
  onSelect: (value: string) => void
  disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [group, setGroup] = useState<'football' | 'faces'>('football')
  const container = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (!open) return
    const onOutside = (event: PointerEvent) => {
      if (!container.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', onOutside)
    return () => document.removeEventListener('pointerdown', onOutside)
  }, [open])
  return (
    <div
      ref={container}
      className="post-emoji-picker"
      onKeyDown={(event) => {
        if (open && event.key === 'Escape') {
          event.stopPropagation()
          setOpen(false)
          trigger.current?.focus()
        }
      }}
    >
      <button
        ref={trigger}
        type="button"
        className="post-tool"
        aria-label="选择表情"
        aria-expanded={open}
        disabled={disabled}
        title="表情"
        onClick={() => setOpen(!open)}
      >
        <PostIcon name="smile" />
      </button>
      {open && (
        <div className="post-emoji-picker__popover" role="region" aria-label="表情选择">
          <div className="post-emoji-picker__tabs" role="tablist" aria-label="表情分类">
            {emojiGroups.map((item) => (
              <button
                type="button"
                role="tab"
                aria-selected={group === item.id}
                key={item.id}
                onClick={() => setGroup(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>
          <div className="post-emoji-picker__grid">
            {emojiGroups
              .find((item) => item.id === group)!
              .items.map((item) => (
                <button
                  type="button"
                  key={item.value}
                  title={item.name}
                  aria-label={item.name}
                  onClick={() => {
                    onSelect(item.value)
                    setOpen(false)
                  }}
                >
                  <img src={item.source} alt={item.value} />
                </button>
              ))}
          </div>
        </div>
      )}
    </div>
  )
}

export function insertAtCursor(
  input: HTMLTextAreaElement | null,
  value: string,
  emoji: string,
  maxLength: number,
  onChange: (value: string) => void,
) {
  const start = input?.selectionStart ?? value.length
  const end = input?.selectionEnd ?? start
  const next = value.slice(0, start) + emoji + value.slice(end)
  if (next.length > maxLength) return
  onChange(next)
  requestAnimationFrame(() => {
    input?.focus()
    input?.setSelectionRange(start + emoji.length, start + emoji.length)
  })
}
