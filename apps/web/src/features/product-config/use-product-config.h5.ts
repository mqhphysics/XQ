import { useEffect, useState } from 'react'
import { configurationCache, startPolicyRefresh } from './policy-state.h5'

/** Refresh on focus; failure leaves feature entry points closed without inventing online success. */
export function useProductConfiguration() {
  const [snapshot, setSnapshot] = useState(() => configurationCache.getSnapshot())
  useEffect(() => {
    const unsubscribe = configurationCache.subscribe(() =>
      setSnapshot(configurationCache.getSnapshot()),
    )
    const stop = startPolicyRefresh()
    setSnapshot(configurationCache.getSnapshot())
    return () => {
      unsubscribe()
      stop()
    }
  }, [])
  return { configuration: snapshot.configuration, error: snapshot.error, phase: snapshot.phase }
}
