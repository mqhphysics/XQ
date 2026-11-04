import { useEffect, useRef, useState } from 'react'
import { PostIcon } from './icons'

export function PostActions({
  label,
  actions,
}: {
  label: string
  actions: Array<{ label: string; run: () => void; disabled?: boolean }>
}) {
  const [open, setOpen] = useState(false)
  const container = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (!open) return
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !container.current?.contains(event.target)) setOpen(false)
    }
    document.addEventListener('pointerdown', outside)
    return () => document.removeEventListener('pointerdown', outside)
  }, [open])
  return (
    <div
      className="post-actions"
      ref={container}
      onKeyDown={(event) => {
        if (open && event.key === 'Escape') {
          event.preventDefault()
          event.stopPropagation()
          setOpen(false)
          trigger.current?.focus()
        }
      }}
    >
      <button
        type="button"
        ref={trigger}
        className="post-actions__trigger"
        aria-label={label}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <PostIcon name="more" />
      </button>
      {open && (
        <div className="post-actions__popover" aria-label={label + '菜单'}>
          {actions.map((action) => (
            <button
              type="button"
              key={action.label}
              disabled={action.disabled}
              onClick={() => {
                setOpen(false)
                action.run()
              }}
            >
              {action.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
