import { createContext } from 'react'
import type { DetailEntry } from './history.logic.weapp'
export const NativeDetailEntryContext = createContext<DetailEntry | undefined>(undefined)
export const NativeDetailActiveContext = createContext(true)
/** (entryId, locked): a detail page that fits the screen turns off the layer's scrolling. */
export const nativeDetailScrollLockEvent = 'xiaoqiu:native-detail-scroll-lock'
