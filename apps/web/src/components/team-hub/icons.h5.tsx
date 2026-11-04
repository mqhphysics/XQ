export function TeamIcon({
  name,
}: {
  name:
    | 'switch'
    | 'feed'
    | 'people'
    | 'file'
    | 'search'
    | 'close'
    | 'plus'
    | 'arrow'
    | 'back'
    | 'menu'
    | 'grip'
    | 'pin'
    | 'heart'
    | 'like'
    | 'comment'
    | 'cup'
    | 'reorder'
}) {
  const paths = {
    switch: (
      <>
        <path d="M4 7h15l-4-4M20 17H5l4 4" />
        <path d="M19 7l-4 4M5 17l4-4" />
      </>
    ),
    feed: (
      <>
        <rect x="8" y="3" width="12" height="14" rx="1" />
        <path d="M5 7H3v14h12v-2M11 7h6M11 11h6" />
      </>
    ),
    people: (
      <>
        <circle cx="12" cy="7" r="4" />
        <path d="M4 21v-2a8 8 0 0116 0v2z" />
      </>
    ),
    file: (
      <>
        <path d="M6 2h8l4 4v16H6zM14 2v5h4M9 11h6M9 15h6M9 18h4" />
      </>
    ),
    search: (
      <>
        <circle cx="10.5" cy="10.5" r="6.5" />
        <path d="M16 16l5 5" />
      </>
    ),
    close: <path d="M6 6l12 12M6 18L18 6" />,
    plus: <path d="M12 5v14M5 12h14" />,
    arrow: <path d="M4 12h16M15 7l5 5-5 5" />,
    back: <path d="M19 12H5M10 7l-5 5 5 5" />,
    menu: (
      <>
        <path d="M4 7h16M4 12h16M4 17h16" />
      </>
    ),
    grip: (
      <>
        <circle cx="9" cy="7" r="1.2" fill="currentColor" stroke="none" />
        <circle cx="15" cy="7" r="1.2" fill="currentColor" stroke="none" />
        <circle cx="9" cy="12" r="1.2" fill="currentColor" stroke="none" />
        <circle cx="15" cy="12" r="1.2" fill="currentColor" stroke="none" />
        <circle cx="9" cy="17" r="1.2" fill="currentColor" stroke="none" />
        <circle cx="15" cy="17" r="1.2" fill="currentColor" stroke="none" />
      </>
    ),
    pin: (
      <>
        <path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1114 0z" />
        <circle cx="12" cy="10" r="2" />
      </>
    ),
    heart: <path d="M12 21l-8-8C-3 5 6-1 12 6c6-7 15-1 8 7z" />,
    like: <path d="M8 10l4-7c3 0 1 7 1 7h6c3 0 0 11-1 11H8zM3 10h5v11H3z" />,
    comment: <path d="M3 4h18v13H10l-5 4v-4H3zM7 8h10M7 12h7" />,
    cup: (
      <>
        <path d="M7 3h10v5a5 5 0 01-10 0zM7 5H3v3a4 4 0 004 4M17 5h4v3a4 4 0 01-4 4M12 13v6M7 21h10M9 19h6" />
      </>
    ),
    reorder: (
      <>
        <path d="M5 7h14M5 12h14M5 17h14" />
      </>
    ),
  }
  return (
    <svg
      className="th-icon"
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  )
}
