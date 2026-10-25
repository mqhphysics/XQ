import Taro from '@tarojs/taro'
import type { AuthUser, HomeResponse, MatchSummary, PostSummary } from '../../types'

export interface AnnouncementSlideSource {
  id: string
  title: string | null
  body: string
  imageUrl: string | null
}

/** 顶部轮播优先挑选带配图的赛事公告，最多展示 3 张 */
export function selectHeroSlides<T extends AnnouncementSlideSource>(
  announcements: readonly T[],
): T[] {
  const imaged = announcements.filter((item) => Boolean(item.imageUrl))
  return (imaged.length > 0 ? imaged : [...announcements]).slice(0, 3)
}

/** 合并赛事公告与平台公告，按发布时间倒序去重 */
export function mergeAnnouncements(home: HomeResponse): PostSummary[] {
  const map = new Map<string, PostSummary>()
  for (const post of [...home.announcements, ...(home.platformAnnouncements || [])]) {
    if (!post.deleted) {
      map.set(post.id, post)
    }
  }
  return [...map.values()].sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt))
}

/** 挑出首页 2 场焦点赛事（主队关联 > 进行中 > 最近完赛 > 即将开赛） */
export function selectFocusMatches(
  matches: readonly MatchSummary[],
  primaryTeamId?: string | null,
): MatchSummary[] {
  const parseTime = (match: MatchSummary) =>
    match.scheduledStartAt ? Date.parse(match.scheduledStartAt) : Number.MAX_SAFE_INTEGER

  const involvesPrimary = (match: MatchSummary) =>
    Boolean(
      primaryTeamId &&
        (match.homeTeam?.id === primaryTeamId || match.awayTeam?.id === primaryTeamId),
    )

  const live = matches
    .filter((match) => match.status === 'LIVE')
    .sort(
      (a, b) =>
        Number(involvesPrimary(b)) - Number(involvesPrimary(a)) || parseTime(a) - parseTime(b),
    )

  const primaryUpcomingOrRecent = primaryTeamId
    ? matches
        .filter(
          (match) =>
            involvesPrimary(match) &&
            !['LIVE', 'CANCELLED', 'ABANDONED'].includes(match.status),
        )
        .sort((a, b) => Math.abs(Date.now() - parseTime(a)) - Math.abs(Date.now() - parseTime(b)))
    : []

  const finished = matches
    .filter((match) => ['FINISHED', 'CONFIRMED'].includes(match.status))
    .sort(
      (a, b) =>
        (b.scheduledStartAt ? Date.parse(b.scheduledStartAt) : 0) -
        (a.scheduledStartAt ? Date.parse(a.scheduledStartAt) : 0),
    )

  const upcoming = matches
    .filter(
      (match) =>
        !['LIVE', 'FINISHED', 'CONFIRMED', 'CANCELLED', 'ABANDONED'].includes(match.status),
    )
    .sort((a, b) => parseTime(a) - parseTime(b))

  const merged = [
    ...live,
    ...primaryUpcomingOrRecent.slice(0, 1),
    ...finished.slice(0, 1),
    ...upcoming,
    ...finished.slice(1),
  ]

  const unique = new Map<string, MatchSummary>()
  for (const item of merged) {
    if (!unique.has(item.id)) {
      unique.set(item.id, item)
    }
    if (unique.size >= 2) break
  }

  return unique.size > 0 ? [...unique.values()] : matches.slice(0, 2)
}

const VIEW_HISTORY_KEY = 'xiaoqiu:weapp:feed-views:v1'

export interface FeedPreferenceMemory {
  viewedPostIds: string[]
  interactedTeamIds: string[]
  interactedAuthorIds: string[]
}

export function readFeedMemory(): FeedPreferenceMemory {
  try {
    const raw = Taro.getStorageSync(VIEW_HISTORY_KEY)
    if (raw && typeof raw === 'object') {
      return {
        viewedPostIds: Array.isArray(raw.viewedPostIds) ? raw.viewedPostIds.slice(0, 80) : [],
        interactedTeamIds: Array.isArray(raw.interactedTeamIds)
          ? raw.interactedTeamIds.slice(0, 20)
          : [],
        interactedAuthorIds: Array.isArray(raw.interactedAuthorIds)
          ? raw.interactedAuthorIds.slice(0, 30)
          : [],
      }
    }
  } catch {
    // ignore storage read error
  }
  return { viewedPostIds: [], interactedTeamIds: [], interactedAuthorIds: [] }
}

export function recordPostInteraction(post: PostSummary): void {
  const memory = readFeedMemory()
  const tagTeamIds = (post.tags || [])
    .filter((tag) => tag.kind === 'TEAM' && Boolean(tag.targetId))
    .map((tag) => tag.targetId!)
  const teamIds = [
    ...(post.team?.id ? [post.team.id] : []),
    ...tagTeamIds,
  ]

  const next: FeedPreferenceMemory = {
    viewedPostIds: [post.id, ...memory.viewedPostIds.filter((id) => id !== post.id)].slice(0, 80),
    interactedTeamIds: [
      ...teamIds,
      ...memory.interactedTeamIds.filter((id) => !teamIds.includes(id)),
    ].slice(0, 20),
    interactedAuthorIds: [
      post.author.id,
      ...memory.interactedAuthorIds.filter((id) => id !== post.author.id),
    ].slice(0, 30),
  }

  try {
    Taro.setStorageSync(VIEW_HISTORY_KEY, next)
  } catch {
    // ignore storage write error
  }
}

export function isPostRelatedToTeam(
  post: PostSummary,
  teamId?: string | null,
  teamName?: string | null,
  teamShortName?: string | null,
): boolean {
  if (!teamId && !teamName && !teamShortName) return false
  if (teamId && post.team?.id === teamId) return true
  if (
    post.tags?.some(
      (tag) =>
        tag.kind === 'TEAM' &&
        ((teamId && tag.targetId === teamId) ||
          (teamName && tag.label === teamName) ||
          (teamShortName && tag.label === teamShortName)),
    )
  ) {
    return true
  }
  const text = `${post.title || ''} ${post.body || ''}`
  if (teamName && text.includes(teamName)) return true
  if (teamShortName && text.includes(teamShortName)) return true
  return false
}

/**
 * 确定性哈希扰动：在同一轮 refreshSeed 下保持稳定，但每次下拉刷新或点击「换一批」时
 * refreshSeed + 1，让同梯队的高分帖子重新洗牌轮换，实现「一刷新内容即更新」。
 */
function seededJitter(id: string, seed: number): number {
  let hash = (seed * 2654435761) | 0
  for (let i = 0; i < id.length; i += 1) {
    hash = Math.imul(hash ^ id.charCodeAt(i), 1597335677)
  }
  return ((hash >>> 0) % 1000) / 1000
}

export interface RecommendFeedOptions {
  posts: readonly PostSummary[]
  primaryTeamId?: string | null
  primaryTeamName?: string | null
  primaryTeamShortName?: string | null
  user?: AuthUser | null
  refreshSeed: number
}

/**
 * 绿茵动态多因子推荐排序算法：
 * 1. 主队关联度（post.team / 标签 / 正文命中用户主队或常看球队）
 * 2. 身份契合度（球员/队长/信息员优先推荐赛后快报与认证作者内容）
 * 3. 互动热度（点赞数、评论数、配图丰富度对数加权）
 * 4. 时间新鲜度（72 小时半衰期指数衰减）
 * 5. 浏览去重与刷新轮换（已读适度降权，refreshSeed > 0 时触发确定性探索洗牌）
 */
export function rankRecommendedPosts({
  posts,
  primaryTeamId,
  primaryTeamName,
  primaryTeamShortName,
  user,
  refreshSeed,
}: RecommendFeedOptions): PostSummary[] {
  const memory = readFeedMemory()
  const viewedSet = new Set(memory.viewedPostIds)
  const preferredTeams = new Set(memory.interactedTeamIds)
  const preferredAuthors = new Set(memory.interactedAuthorIds)
  const now = Date.now()

  const isPlayerOrCaptain = Boolean(
    user?.linkedPlayer ||
      user?.verificationLevel === 'PLAYER_CONFIRMED' ||
      user?.roles?.some((item) => {
        const roleName = (typeof item === 'string' ? item : item.role).toUpperCase()
        return ['TEAM_CAPTAIN', 'TEAM_COACH', 'MATCH_REPORTER', 'PLAYER'].includes(roleName)
      }),
  )

  const scored = posts
    .filter((post) => !post.deleted)
    .map((post) => {
      let score = 0

      // 1. 主队强关联加分
      if (isPostRelatedToTeam(post, primaryTeamId, primaryTeamName, primaryTeamShortName)) {
        score += 36
      }

      // 2. 历史常看球队与常看作者偏好加分
      if (
        (post.team?.id && preferredTeams.has(post.team.id)) ||
        post.tags?.some((tag) => tag.kind === 'TEAM' && tag.targetId && preferredTeams.has(tag.targetId))
      ) {
        score += 18
      }
      if (preferredAuthors.has(post.author.id)) {
        score += 10
      }

      // 3. 身份角色契合度（快报、官方帖、认证作者加权）
      const isReport =
        Boolean(post.title && (post.title.includes('快报') || post.title.includes('战报'))) ||
        post.type === 'OFFICIAL'
      if (isReport) {
        score += isPlayerOrCaptain ? 22 : 14
      }
      if (post.author.official || post.author.verificationLevel !== 'NONE') {
        score += 8
      }

      // 4. 帖子互动热度与多图质量分
      const engagement = post.likeCount * 3 + post.commentCount * 5
      score += Math.min(32, Math.log2(1 + engagement) * 7.5)
      if (post.imageUrl || (post.imageUrls && post.imageUrls.length > 0)) {
        score += 9
      }

      // 5. 时间新鲜度（72 小时半衰期）
      const ageHours = Math.max(0, (now - Date.parse(post.publishedAt)) / 3_600_000)
      const freshness = 28 * Math.exp(-ageHours / 72)
      score += freshness

      // 6. 已浏览过的动态在刷新后适度降权，让未看过的动态浮上来
      if (refreshSeed > 0 && viewedSet.has(post.id)) {
        score -= 16
      }

      // 7. 刷新洗牌因子：首次进入按纯推荐分排，每次刷新附加确定性扰动实现「换一批」
      const jitterAmplitude = refreshSeed === 0 ? 4 : 26
      const jitter = (seededJitter(post.id, refreshSeed + 1) - 0.5) * jitterAmplitude

      return {
        post,
        totalScore: score + jitter,
      }
    })

  scored.sort((a, b) => b.totalScore - a.totalScore)
  return scored.map((item) => item.post)
}

/**
 * 估算单张 PostCard 在双列瀑布流中的渲染高度（单位：rpx），
 * 用于「最短列优先（Shortest-Column-First）」贪心分配，彻底解决左右两列底部一长一短的问题。
 */
export function estimatePostCardHeight(post: PostSummary): number {
  let height = 148 // 作者头部 + 底部点赞操作栏 + 上下内边距基准高度

  const hasImage = Boolean(
    (post.imageUrls && post.imageUrls.some((url) => !url.includes('/demo/album:'))) ||
      (post.imageUrl && !post.imageUrl.includes('/demo/album:')),
  )
  if (hasImage) {
    height += 238 // 224rpx 配图 + 14rpx 间距
  }

  if (post.title) {
    const titleLines = Math.min(2, Math.max(1, Math.ceil(post.title.length / 11)))
    height += titleLines * 38 + 8
  }

  const bodyLen = (post.body || '').trim().length
  const bodyLines = Math.min(4, Math.max(1, Math.ceil(bodyLen / 12)))
  height += bodyLines * 40

  if (post.tags && post.tags.length > 0) {
    height += 48
  }

  if (post.quotedPost && !post.quotedPost.deleted) {
    height += 96
  }

  return height
}

/**
 * 最短列优先（Shortest-Column-First）双列瀑布流布局算法：
 * 每次将下一条动态放入当前累计视觉高度更小的一列（高度差距极小时左列优先），
 * 保证滑到底部时左右两列高度始终均衡对齐。
 */
export function balancedMasonryColumns(
  posts: readonly PostSummary[],
  columnCount = 2,
): PostSummary[][] {
  const count = Math.max(1, columnCount)
  const columns: PostSummary[][] = Array.from({ length: count }, () => [])
  const heights: number[] = Array.from({ length: count }, () => 0)
  const cardGap = 18

  for (const post of posts) {
    let targetCol = 0
    for (let col = 1; col < count; col += 1) {
      if (heights[col]! + 12 < heights[targetCol]!) {
        targetCol = col
      }
    }
    columns[targetCol]!.push(post)
    heights[targetCol]! += estimatePostCardHeight(post) + cardGap
  }

  return columns
}