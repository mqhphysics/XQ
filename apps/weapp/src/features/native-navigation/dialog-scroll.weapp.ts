export interface DialogScrollHandle {
  bounds: () => { top: number; bottom: number } | null
  moveBy: (delta: number) => number
  active: (value: boolean) => void
}
const dialogs = new Map<string, DialogScrollHandle>()
export function registerDialogScroll(id: string, handle: DialogScrollHandle) {
  dialogs.set(id, handle)
  return () => {
    dialogs.delete(id)
  }
}
export const currentDialogScroll = () => [...dialogs.values()].at(-1) ?? null
