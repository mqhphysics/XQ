import type { NativeSection } from '../native-navigation/history.logic.weapp'

export type GuideAudience = 'student' | 'player' | 'captain'
export type GuideAction = 'next' | 'player' | 'edit' | 'manage' | 'back' | 'finish'
export type GuideStep = {
  id: string
  /** Main tab that must be showing before this step is measured. */
  section: NativeSection
  /** Short page label shown on the card. */
  page: string
  /** Comma-separated selectors; the first match that is on screen is highlighted. */
  selector: string
  /** More selectors framed in their own boxes at the same time, when they are on screen. */
  also?: readonly string[]
  /** Element id the home feed scrolls to before the step is measured. */
  scroll?: string
  /** Element id the open player-profile editor scrolls to before the step is measured. */
  focus?: string
  title: string
  body: string
  action: GuideAction
  button: string
}
type Draft = Omit<GuideStep, 'button' | 'page'> & { button?: string; page?: string }

/**
 * Tab order the guide walks through; a page's steps all finish before the next page opens.
 * 数据 is skipped on purpose and 主队 comes last, so the tour ends next to 添加关注.
 */
export const guideSectionOrder: readonly NativeSection[] = ['home', 'schedule', 'me', 'team']
export const guidePageLabels: Record<NativeSection, string> = {
  home: '首页',
  schedule: '赛程',
  team: '主队',
  data: '数据',
  me: '我的',
}

/**
 * Guide -> own player page: 'edit' opens the self-profile editor, 'focus' scrolls it to an
 * element id, 'close' shuts it before the guide goes back.
 */
export const guidePlayerEvent = 'xiaoqiu:guide-player'
export type GuidePlayerCommand = 'edit' | 'focus' | 'close'

export type GuideRect = { left: number; top: number; width: number; height: number }

/**
 * Where the account avatar sits when the page cannot report it. Phones keep it at the left of the
 * custom header (84rpx at 28rpx from the edge); wide windows put a 32px avatar 12px left of the
 * WeChat capsule, vertically centred in the bar.
 */
export function guideAccountRect(header: {
  top: number
  rowHeight: number
  wide: boolean
  capsule: { left: number }
  windowWidth: number
}): GuideRect {
  if (header.wide) {
    const size = 32
    return {
      left: Math.round(header.capsule.left - 12 - size),
      top: Math.round(header.top + (header.rowHeight - size) / 2),
      width: size,
      height: size,
    }
  }
  const unit = Math.min(header.windowWidth, 520) / 750,
    size = Math.round(84 * unit)
  return {
    left: Math.round(28 * unit),
    top: Math.round(header.top + (header.rowHeight - size) / 2),
    width: size,
    height: size,
  }
}

export function guideAudience(
  user: { linkedPlayer?: { id: string } | null },
  captainTeams: readonly unknown[],
): GuideAudience {
  return captainTeams.length ? 'captain' : user.linkedPlayer ? 'player' : 'student'
}

/** Captains linked to a player record are players too and also get the player-profile steps. */
export function guideSteps(
  audience: GuideAudience,
  linkedPlayer = audience === 'player',
): GuideStep[] {
  const drafts: Draft[] = [
    {
      id: 'home-account',
      section: 'home',
      selector: '#native-guide-account, .public-account',
      title: '左上角是你的账户',
      body: '点头像打开账户菜单：查看消息、管理资料或提交反馈。',
      action: 'next',
    },
    {
      id: 'home-hero',
      section: 'home',
      selector: '#native-guide-home-hero',
      also: ['#native-guide-home-notice'],
      scroll: 'native-guide-home-hero',
      title: '赛事公告和平台公告',
      body: '顶部轮播是赛事公告和精选照片，中间这一条是小程序的平台公告，点开都能查看详情。',
      action: 'next',
    },
    {
      id: 'home-tabbar',
      section: 'home',
      selector: '#native-guide-tabbar, #native-guide-wide-nav',
      title: '五个页面，随时切换',
      body: '首页、赛程、主队、数据、我的。点导航或左右滑动都能切换。',
      action: 'next',
    },
    {
      id: 'schedule-controls',
      section: 'schedule',
      selector: '#native-guide-schedule-controls',
      title: '切换赛事',
      body: '右上角可以切换杯赛和男子组、女子组，也可以筛选要看的比赛。',
      action: 'next',
    },
    {
      id: 'schedule-list',
      section: 'schedule',
      selector: '#native-guide-schedule-list',
      title: '比赛列表',
      body: '点开任意一场比赛，可以看比分、阵容和比赛事件。',
      action: 'next',
    },
    {
      id: 'me-functions',
      section: 'me',
      selector: '#native-guide-me-functions',
      title: '「我的」常用入口',
      body: '个人信息、身份、消息、收藏和设置都在这里；设置里还能再看一遍引导。',
      action: 'next',
    },
  ]
  if (linkedPlayer)
    drafts.push(
      {
        id: 'identity',
        section: 'me',
        selector: '#native-guide-identity',
        title: '这是你的球员身份',
        body: '从「我的身份」进入球员主页，可以管理自己的球员资料。点进去看看。',
        action: 'player',
        button: '打开球员主页',
      },
      {
        id: 'player-edit',
        section: 'me',
        page: '球员主页',
        selector: '#native-guide-player-edit',
        title: '球员资料，自己来完善',
        body: '点「编辑球员资料」，头像、背景和自我评价都在里面。',
        action: 'edit',
        button: '打开编辑',
      },
      {
        id: 'player-avatar',
        section: 'me',
        page: '编辑球员资料',
        selector: '#native-guide-player-avatar',
        title: '球员头像',
        body: '点「更换头像」上传照片，阵容和名单里都会显示它。',
        action: 'next',
      },
      {
        id: 'player-cover',
        section: 'me',
        page: '编辑球员资料',
        selector: '#native-guide-player-cover',
        title: '球员背景',
        body: '点「更换背景」选一张横图，它会铺在你球员主页的顶部。',
        action: 'next',
      },
      {
        id: 'player-rating',
        section: 'me',
        page: '编辑球员资料',
        selector: '#native-guide-player-ratings',
        focus: 'native-guide-player-ratings',
        title: '自我评价',
        body: '给射门、速度、盘带、传球、防守打个分（0–100），改完点「保存球员资料」。',
        action: 'back',
        button: '继续',
      },
    )
  if (audience === 'captain')
    drafts.push(
      {
        id: 'captain',
        section: 'me',
        selector: '#native-guide-manage',
        title: '你的队长入口已准备好',
        body: '球队、阵容和大名单从这里管理。点进去看看。',
        action: 'manage',
        button: '打开球队管理',
      },
      {
        id: 'team-manage',
        section: 'me',
        page: '球队管理',
        selector: '#native-guide-team-tabs',
        title: '队长的球队工作台',
        body: '在这里切换球队资料、阵容和大名单。先记住这个位置。',
        action: 'back',
        button: '继续',
      },
    )
  drafts.push(
    {
      id: 'team-follow',
      section: 'team',
      selector: '#native-guide-team-follow',
      title: '主队和关注',
      body: '你的主队和关注的球队、球员都排在这一栏，点一下就能看他们的资料和比赛。',
      action: 'next',
    },
    {
      id: 'finish',
      section: 'team',
      selector: '#native-guide-team-menu',
      title: '点这里添加关注，也可以先随便逛逛',
      body: '关注之后，相关的比赛和动态会更贴近你。',
      action: 'finish',
      button: '结束引导',
    },
  )
  return drafts.map((step, index) => {
    const next = drafts[index + 1]
    const leaving = step.action === 'next' && next && next.section !== step.section
    return {
      ...step,
      page: step.page ?? guidePageLabels[step.section],
      button:
        step.button ?? (leaving && next ? `下一页：${guidePageLabels[next.section]}` : '下一步'),
    }
  })
}
