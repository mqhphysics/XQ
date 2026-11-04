export function actionReason(path: string, method: string, body: Record<string, unknown>) {
  const action = String(body.action ?? body.decision ?? '')
  if (['APPROVE', 'ALLOW'].includes(action)) return { required: false, text: '审核通过' }
  if (method === 'POST' && /^\/admin\/center\/(posts|teams|players)$/.test(path))
    return {
      required: false,
      text:
        '新增' +
        ({ posts: '公告或动态', teams: '球队档案', players: '球员档案' }[path.split('/').at(-1)!] ??
          '资料'),
    }
  if (method === 'POST' && (path === '/admin/campus/students' || /\/create-player$/.test(path)))
    return { required: false, text: '新增学生或球员档案' }
  if (path === '/admin/center/system-notifications')
    return { required: false, text: '发送系统通知' }
  return { required: true, text: '' }
}
