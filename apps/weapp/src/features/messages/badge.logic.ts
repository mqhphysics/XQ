export function messageBadge(count: number, dot: boolean) {
  const value = Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0
  return value > 0
    ? { kind: 'count' as const, label: value > 99 ? '99+' : String(value) }
    : dot
      ? { kind: 'dot' as const, label: '' }
      : null
}

export function messageActorLabel(actors: Array<{ displayName: string }>, count: number) {
  const names = actors
    .slice(0, 2)
    .map((actor) => actor.displayName)
    .join('、')
  return count > actors.slice(0, 2).length ? `${names || '用户'}等${count}人` : names || '用户'
}
