import Taro from '@tarojs/taro'

export async function openSearchPage(query: string, category = 'ALL'): Promise<void> {
  await Taro.navigateTo({
    url: `/pages/index/index?search=1&query=${encodeURIComponent(query)}&category=${category}`,
  })
  if (typeof window !== 'undefined') {
    window.history.replaceState({ ...window.history.state, xiaoqiuSearchEntry: true }, '')
  }
}

interface SearchOrigin {
  bar: DOMRect
  button: DOMRect
  input: DOMRect
  capturedAt: number
}

// This transient geometry stays inside the H5 app; no query or user data is stored.
let searchOrigin: SearchOrigin | null = null

export function captureSearchOrigin(element: HTMLElement): void {
  const button = element.querySelector<HTMLElement>('.persistent-header-search__submit')
  const input = element.querySelector<HTMLElement>('.persistent-header-search__input')
  if (!button || !input) return
  searchOrigin = {
    bar: element.getBoundingClientRect(),
    button: button.getBoundingClientRect(),
    input: input.getBoundingClientRect(),
    capturedAt: Date.now(),
  }
}

export function animateSearchEntrance(element: HTMLElement): () => void {
  const origin = searchOrigin
  searchOrigin = null
  if (
    !origin ||
    Date.now() - origin.capturedAt > 2000 ||
    window.matchMedia('(prefers-reduced-motion: reduce)').matches ||
    !window.matchMedia('(min-width: 721px)').matches
  ) {
    return () => {}
  }

  const target = element.getBoundingClientRect()
  if (!origin.bar.width || !target.width) return () => {}
  const options: KeyframeAnimationOptions = {
    duration: 360,
    easing: 'cubic-bezier(0.22, 0.8, 0.25, 1)',
  }
  const animations: Animation[] = []
  const previousLayer = element.style.zIndex
  // While crossing the top bar, keep the moving contents above its sticky background.
  element.style.zIndex = '40'
  const frame = element.querySelector<HTMLElement>('.persistent-header-search__frame')
  if (frame) {
    animations.push(
      frame.animate(
        [
          {
            transform: `translate(${origin.bar.left - target.left}px, ${origin.bar.top - target.top}px) scale(${origin.bar.width / target.width}, ${origin.bar.height / target.height})`,
          },
          { transform: 'none' },
        ],
        options,
      ),
    )
  }

  // Animate the contents independently so the widening frame never stretches text/icons.
  for (const [selector, source] of [
    ['.persistent-header-search__submit', origin.button],
    ['.persistent-header-search__input', origin.input],
  ] as const) {
    const child = element.querySelector<HTMLElement>(selector)
    if (!child) continue
    const destination = child.getBoundingClientRect()
    const deltaX = source.left - destination.left
    const deltaY = source.top + source.height / 2 - destination.top - destination.height / 2
    animations.push(
      child.animate(
        [{ transform: `translate(${deltaX}px, ${deltaY}px)` }, { transform: 'none' }],
        options,
      ),
    )
  }
  void Promise.all(animations.map((animation) => animation.finished))
    .catch(() => {})
    .then(() => {
      element.style.zIndex = previousLayer
    })
  return () => {
    animations.forEach((animation) => animation.cancel())
    element.style.zIndex = previousLayer
  }
}
