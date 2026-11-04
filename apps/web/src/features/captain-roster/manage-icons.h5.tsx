// Small stroke icons for the captain manage modal (24px grid, currentColor).
type IconName =
  | 'close'
  | 'edit'
  | 'plus'
  | 'minus'
  | 'trash'
  | 'undo'
  | 'redo'
  | 'more'
  | 'search'
  | 'check'
  | 'x'
  | 'chevron'
  | 'eraser'
  | 'save'

const paths: Record<IconName, string> = {
  close: 'M6 6l12 12M18 6L6 18',
  edit: 'M4 20h4L19 9l-4-4L4 16v4zM14 6l4 4',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  trash: 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3',
  undo: 'M9 14L4 9l5-5M4 9h10a6 6 0 010 12h-3',
  redo: 'M15 14l5-5-5-5M20 9H10a6 6 0 000 12h3',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  search: 'M11 18a7 7 0 100-14 7 7 0 000 14zM20 20l-4-4',
  check: 'M5 12l5 5 9-10',
  x: 'M7 7l10 10M17 7L7 17',
  chevron: 'M6 9l6 6 6-6',
  eraser: 'M8 20h12M5 15l9-9 5 5-9 9H8l-3-3z',
  save: 'M5 4h11l3 3v13H5zM8 4v5h7V4M8 20v-6h8v6',
}

export function Icon({ name, size = 16 }: { name: IconName; size?: number }) {
  return (
    <svg
      className="cmx-icon"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={name === 'more' ? 3.2 : 2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[name]} />
    </svg>
  )
}
