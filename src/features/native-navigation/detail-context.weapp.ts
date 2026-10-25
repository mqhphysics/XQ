import { createContext } from 'react'
import type { DetailEntry } from './history.logic.weapp'
export const NativeDetailEntryContext = createContext<DetailEntry | undefined>(undefined)
export const NativeDetailActiveContext = createContext(true)
