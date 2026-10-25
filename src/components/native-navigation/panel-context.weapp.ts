import { createContext, useContext } from 'react'
export const NativePanelContext = createContext<{ embedded: boolean; active: boolean } | null>(null)
export const NativeInlineContentContext = createContext(false)
export function useNativePanelVisible() {
  return useContext(NativePanelContext)?.active ?? true
}
