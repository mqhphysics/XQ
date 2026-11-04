export function nativeFailureHint(message = '') {
  if (/登录|会话|认证.*失效|token|过期/i.test(message))
    return { kind: 'session', cause: '登录状态可能已过期，重新登录后再试。' } as const
  if (/权限|无权|冻结|范围/.test(message))
    return {
      kind: 'permission',
      cause: '当前账号可能没有查看权限，可以返回首页或联系管理员。',
    } as const
  if (/维护|未开放|未开启|尚未开放/.test(message))
    return { kind: 'service', cause: '这项功能可能正在维护或暂未开放，请稍后再试。' } as const
  return {
    kind: 'network',
    cause: '可能是网络暂时不稳，或服务正在更新，稍后重试通常即可恢复。',
  } as const
}
