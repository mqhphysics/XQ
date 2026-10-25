/** Mini-program: native fields have no browser focus ring to soften. */
export function mountSoftFocus(): () => void {
  return () => undefined
}
