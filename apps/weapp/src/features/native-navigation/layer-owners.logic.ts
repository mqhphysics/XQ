export function createLayerOwners(changed: (open: boolean) => void) {
  const owners = new Set<symbol>()
  return () => {
    const owner = Symbol()
    const first = owners.size === 0
    owners.add(owner)
    if (first) changed(true)
    return () => {
      if (owners.delete(owner) && owners.size === 0) changed(false)
    }
  }
}
