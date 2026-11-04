export const purposeNames: Record<string, string> = {
  POST: '动态文字与图片',
  COMMENT: '评论',
  USER_AVATAR: '用户头像',
  PLAYER_AVATAR: '球员头像',
  USER_BACKGROUND: '个人背景',
  PLAYER_BACKGROUND: '球员背景',
  PLAYER_PORTRAIT: '球员照片',
  TEAM_CREST: '球队队徽',
  TEAM_BACKGROUND: '球队背景',
  GOAL_GIF: '进球动图封面',
  EVENT_CLIP: '比赛片段封面',
}
// Official provider documentation, verified 2026-10-24. Model IDs remain user-selected.
export const providerPresets = [
  { id: 'DEEPSEEK', name: 'DeepSeek', url: 'https://api.deepseek.com/v1' },
  { id: 'QWEN', name: '千问 Qwen', url: 'https://dashscope.aliyuncs.com/compatible-mode/v1' },
  { id: 'GLM', name: '智谱 GLM', url: 'https://open.bigmodel.cn/api/paas/v4' },
  { id: 'DOUBAO', name: '豆包 · 火山方舟', url: 'https://ark.cn-beijing.volces.com/api/v3' },
  { id: 'CUSTOM', name: '自定义', url: '' },
]
export type ReviewPolicy = {
  enabled: boolean
  human: 'ALL' | 'FLAGGED' | 'SAMPLE'
  sampleRate: number
  publication: 'AI_FIRST' | 'PUBLIC_FIRST'
}
export type AiConfig = {
  enabled: boolean
  model: string
  baseUrl: string
  activeProfileId: string | null
  version: number
  policies: Record<string, ReviewPolicy>
}
export type AiProvider = {
  id: string
  name: string
  provider: string
  model: string
  baseUrl: string
  protocol: 'CHAT_COMPLETIONS' | 'REVIEW_GATEWAY'
  version: number
  hasKey: boolean
}
