/** Copy and motion math for the one-time desktop welcome card. */

export type WelcomeIcon = 'schedule' | 'team' | 'camera' | 'wechat'

/** A bullet line split into plain text and 「quoted」 section names. */
export interface WelcomeBullet {
  icon: WelcomeIcon
  text: string
}

export const WELCOME_COPY = {
  title: '欢迎来到晓球',
  subtitle: '这里记录我们学校的每一场校园足球。',
  bullets: [
    {
      icon: 'schedule',
      text: '赛程、比分和积分榜都在「赛程」「数据」里，右上角可以切换杯赛和男子组、女子组。',
    },
    { icon: 'team', text: '选一支主队，它的下一场比赛会出现在首页。' },
    { icon: 'camera', text: '在「绿茵动态」里发图、评论，留下场边的瞬间。' },
    { icon: 'wechat', text: '微信小程序正在开发中，你的信息将会在小程序中同步。' },
  ] satisfies WelcomeBullet[],
  footer: '现在是内部测试阶段，遇到问题欢迎随时反馈。',
  hint: '点击任意处继续',
} as const

/** Splits 「…」 section names out so they can be emphasised; brackets stay in the text. */
export function splitQuoted(text: string): { text: string; quoted: boolean }[] {
  return text
    .split(/(「[^」]+」)/)
    .filter(Boolean)
    .map((part) => ({ text: part, quoted: /^「[^」]+」$/.test(part) }))
}

export interface Rect {
  left: number
  top: number
  width: number
  height: number
}

export interface Flight {
  dx: number
  dy: number
  scale: number
  /** True when flying to the announcement bar, false for the generic top-centre exit. */
  toTarget: boolean
}

/** A target counts only when it is rendered and at least partly inside the viewport. */
export function isUsableTarget(target: Rect | null, viewport: { width: number; height: number }) {
  if (!target || target.width <= 0 || target.height <= 0) return false
  return (
    target.left < viewport.width &&
    target.left + target.width > 0 &&
    target.top < viewport.height &&
    target.top + target.height > 0
  )
}

/**
 * Where the card should travel when dismissed: into the announcement bar's label when
 * it is visible, otherwise up toward the top centre of the viewport.
 */
export function computeFlight(
  card: Rect,
  target: Rect | null,
  viewport: { width: number; height: number },
): Flight {
  const cx = card.left + card.width / 2
  const cy = card.top + card.height / 2
  if (isUsableTarget(target, viewport)) {
    const t = target!
    const scale = Math.max(0.04, Math.min(0.2, t.height / card.height, t.width / card.width))
    return {
      dx: Math.round(t.left + t.width / 2 - cx),
      dy: Math.round(t.top + t.height / 2 - cy),
      scale: Number(scale.toFixed(3)),
      toTarget: true,
    }
  }
  return {
    dx: Math.round(viewport.width / 2 - cx),
    dy: Math.round(Math.min(48, viewport.height * 0.06) - cy),
    scale: 0.18,
    toTarget: false,
  }
}
