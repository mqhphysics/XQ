const OVERLAY_EVENTS = [
  'xiaoqiu:open-post',
  'xiaoqiu:open-team',
  'xiaoqiu:hover-team',
  'xiaoqiu:leave-team',
  'xiaoqiu:open-player',
  'xiaoqiu:hover-player',
  'xiaoqiu:leave-player',
  'xiaoqiu:open-person',
  'xiaoqiu:hover-person',
  'xiaoqiu:open-match',
  'xiaoqiu:open-captain-manage',
  'xiaoqiu:profile-panel',
]

const pending: CustomEvent[] = []
let buffering = true

function remember(event: Event): void {
  if (!buffering || !(event instanceof CustomEvent)) return
  pending.push(event)
}

if (typeof window !== 'undefined') {
  for (const name of OVERLAY_EVENTS) window.addEventListener(name, remember)
}

/** Replay opens that happened while the overlay chunk was still downloading. */
export function flushOverlayBuffer(): void {
  buffering = false
  const events = pending.splice(0)
  for (const event of events) {
    window.dispatchEvent(new CustomEvent(event.type, { detail: event.detail }))
  }
}
