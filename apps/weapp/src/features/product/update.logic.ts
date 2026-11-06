export function canPromptNativeUpdate(route: string, editing: boolean, rootIdle: boolean) {
  return route.replace(/^\/+/, '') === 'pages/index/index' && !editing && rootIdle
}
