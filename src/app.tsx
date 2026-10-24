import { useEffect, type PropsWithChildren } from 'react'
import { bindGetCachePersistence } from '@/store/cache'

import './app.scss'

export default function App({ children }: PropsWithChildren) {
  useEffect(() => {
    bindGetCachePersistence()
  }, [])

  return <>{children}</>
}
