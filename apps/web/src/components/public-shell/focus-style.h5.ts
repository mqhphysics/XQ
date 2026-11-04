/**
 * Site-wide soft focus for native form controls, replacing the browser's dark default focus
 * rectangle. Injected as raw CSS because Taro's stylesheet transform rewrites bare
 * `input`/`textarea` selectors. Buttons keep their own :focus-visible rings for keyboard users.
 *
 * - Text fields / textareas / selects: no outline, light green border (all widths, as before).
 * - Desktop (≥721px) checkboxes, radios, colour pickers and sliders: a soft green ring on
 *   keyboard focus only. A control that was last pressed with the pointer carries
 *   `data-xq-pointer` until the next key press or blur, so dragging a slider or clicking a
 *   checkbox never shows a ring even where the browser still matches :focus-visible.
 */
const FIELDS =
  'input:not([type="checkbox"]):not([type="radio"]):not([type="range"]):not([type="file"]):not([type="color"]), textarea, select'
const CHOICES =
  'input:is([type="checkbox"], [type="radio"], [type="range"], [type="color"], [type="file"])'

function isChoice(target: EventTarget | null): target is HTMLInputElement {
  return target instanceof HTMLInputElement && target.matches(CHOICES)
}

export function mountSoftFocus(): () => void {
  const style = document.createElement('style')
  style.dataset.xqSoftFocus = ''
  style.textContent = `
    html :is(${FIELDS}):focus, html :is(${FIELDS}):focus-visible {
      outline: none !important;
    }
    html :is(${FIELDS}):focus:not([data-xq-bare]) {
      border-color: #9cc4a6 !important;
    }
    html :is(${FIELDS}) { transition: border-color 160ms ease, box-shadow 160ms ease; }
    @media (min-width: 721px) {
      html :is(${CHOICES}):focus, html :is(${CHOICES}):focus-visible {
        outline: none !important;
      }
      html :is(${CHOICES}):not([type="range"]):focus-visible:not([data-xq-pointer]) {
        outline: 3px solid rgba(76, 138, 95, 0.3) !important;
        outline-offset: 1px !important;
      }
      html input[type="color"]:focus-visible:not([data-xq-pointer]) {
        border-color: #9cc4a6 !important;
      }
    }
  `
  document.head.append(style)
  const onPointerDown = (event: PointerEvent) => {
    const target = event.target instanceof Element ? event.target : null
    // Clicking a <label> focuses its control without the pointer ever touching it.
    const control = isChoice(target)
      ? target
      : (target?.closest('label')?.querySelector<HTMLInputElement>(CHOICES) ?? null)
    if (control) control.dataset.xqPointer = ''
  }
  const onKeyDown = (event: KeyboardEvent) => {
    if (isChoice(event.target)) delete event.target.dataset.xqPointer
  }
  const onFocusOut = (event: FocusEvent) => {
    if (isChoice(event.target)) delete event.target.dataset.xqPointer
  }
  document.addEventListener('pointerdown', onPointerDown, true)
  document.addEventListener('keydown', onKeyDown, true)
  document.addEventListener('focusout', onFocusOut, true)
  return () => {
    style.remove()
    document.removeEventListener('pointerdown', onPointerDown, true)
    document.removeEventListener('keydown', onKeyDown, true)
    document.removeEventListener('focusout', onFocusOut, true)
  }
}
