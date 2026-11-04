import type { NavigationSection } from './navigation-transition.types'

// Other platforms keep their existing navigation behavior.
export function captureNavigationOrigin(_shell: HTMLElement, _target: NavigationSection): void {}

export function clearNavigationOrigin(): void {}

export function playTeamFocus(_shell: HTMLElement): void {}

export function animateNavigationEntrance(
  _shell: HTMLElement,
  _section: NavigationSection,
): () => void {
  return () => {}
}
