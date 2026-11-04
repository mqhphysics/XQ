export const reviewPurposes = [
  'POST',
  'COMMENT',
  'USER_AVATAR',
  'PLAYER_AVATAR',
  'USER_BACKGROUND',
  'PLAYER_BACKGROUND',
  'PLAYER_PORTRAIT',
  'TEAM_CREST',
  'TEAM_BACKGROUND',
  'GOAL_GIF',
  'EVENT_CLIP',
] as const
export type ReviewPurpose = (typeof reviewPurposes)[number]
export type ReviewPolicy = {
  enabled: boolean
  human: 'ALL' | 'FLAGGED' | 'SAMPLE'
  sampleRate: number
  publication: 'AI_FIRST' | 'PUBLIC_FIRST'
}
export function policies(value: unknown): Record<ReviewPurpose, ReviewPolicy> {
  const source =
    value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {}
  return Object.fromEntries(
    reviewPurposes.map((purpose) => {
      const item = source[purpose] as Partial<ReviewPolicy> | undefined
      return [
        purpose,
        {
          enabled: item?.enabled !== false,
          publication:
            item?.publication === 'AI_FIRST' || item?.publication === 'PUBLIC_FIRST'
              ? item.publication
              : purpose === 'POST' || purpose === 'COMMENT'
                ? 'AI_FIRST'
                : 'PUBLIC_FIRST',
          human: ['ALL', 'FLAGGED', 'SAMPLE'].includes(String(item?.human)) ? item!.human : 'ALL',
          sampleRate: Number.isFinite(item?.sampleRate)
            ? Math.max(0, Math.min(100, Number(item!.sampleRate)))
            : 10,
        },
      ]
    }),
  ) as Record<ReviewPurpose, ReviewPolicy>
}
export function humanReviewRequired(policy: ReviewPolicy, decision: string, random: number) {
  return (
    decision !== 'ALLOW' ||
    policy.human === 'ALL' ||
    (policy.human === 'SAMPLE' && random * 100 < policy.sampleRate)
  )
}
export function endpoint(value: string) {
  const url = new URL(value)
  if (
    !['https:', 'http:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    throw Error('请填写不带密钥、查询参数的HTTP或HTTPS服务地址')
  return url.toString().replace(/\/$/, '')
}

// Structured, synchronous Qwen calls must disable thinking for affected models.
// https://help.aliyun.com/zh/model-studio/error-code
export function chatCompatibility(baseUrl:string):{enable_thinking?:false} {
  const host=new URL(baseUrl).hostname
  return /^(?:dashscope(?:-intl|-us)?|cn-hongkong\.dashscope)\.aliyuncs\.com$/.test(host)||host.endsWith('.maas.aliyuncs.com') ? {enable_thinking:false} : {}
}
