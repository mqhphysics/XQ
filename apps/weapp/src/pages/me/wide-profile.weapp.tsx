import { Button, Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useCallback, useEffect, useRef, useState } from 'react'
import { PostCard } from '../../components/product-ui'
import { DataState } from '../../components/public-ui'
import { NativeMatchRow } from '../../components/native-match-row/index.weapp'
import { productRepository, productRequest } from '../../features/product/product.repository'
import { openPost } from '../../features/product/post-navigation'
import { switchNativeSection } from '../../features/native-navigation/index.weapp'
import type {
  AuthUser,
  HomeResponse,
  MatchSummary,
  PostSummary,
  TeamPreferencesResponse,
} from '../../features/product/product.types'
import { isPendingMatch } from './profile.logic'
import { nativeWriteEnabled } from '../../features/native-social/config.weapp'

/*
 * Wide windows only: the website's lower profile row (desktop-profile.h5.tsx) — the 我的贡献 / 我的录入
 * card under 我的功能 and the 我的动态 · 关注的比赛 · 收藏 stream on the right. Phones never mount this.
 */
type Tab = 'posts' | 'matches' | 'bookmarks'
type Filter = 'all' | 'pending' | 'finished'
interface WideData {
  posts: PostSummary[] | null
  schedule: MatchSummary[] | null
  favorites: PostSummary[] | null
}
const message = (issue: unknown, fallback: string) =>
  issue instanceof Error ? issue.message : fallback

export function useWideProfileData(
  wide: boolean,
  user: AuthUser,
  home: HomeResponse,
  preferences: TeamPreferencesResponse | null | undefined,
) {
  const [data, setData] = useState<WideData>({ posts: null, schedule: null, favorites: null })
  const [errors, setErrors] = useState<Partial<Record<keyof WideData, string>>>({})
  const [loading, setLoading] = useState(true)
  const [favoriteCursor, setFavoriteCursor] = useState<string | null>(null)
  const [favoriteCount, setFavoriteCount] = useState<number | null>(null)
  const [loadingMore, setLoadingMore] = useState(false),
    [moreError, setMoreError] = useState('')
  const moreLock = useRef(false)
  const epoch = useRef(0)
  const load = useCallback(async () => {
    if (!wide) return
    const ticket = ++epoch.current
    setLoading(true)
    const [person, competition, favorites] = await Promise.allSettled([
      productRepository.getPerson(user.id, home.tournament.id),
      productRepository.getCompetitionData(home.tournament.id),
      productRequest<{ items: PostSummary[]; nextCursor: string | null; totalCount: number }>(
        '/me/favorite-posts?limit=30',
      ),
    ])
    if (ticket !== epoch.current) return
    const issues: Partial<Record<keyof WideData, string>> = {}
    if (person.status === 'rejected') issues.posts = message(person.reason, '动态读取失败')
    if (competition.status === 'rejected')
      issues.schedule = message(competition.reason, '赛程读取失败')
    if (favorites.status === 'rejected')
      issues.favorites = message(favorites.reason, '收藏读取失败')
    setData({
      posts: person.status === 'fulfilled' ? person.value.posts : null,
      schedule: competition.status === 'fulfilled' ? competition.value.schedule : null,
      favorites: favorites.status === 'fulfilled' ? favorites.value.items : null,
    })
    setErrors(issues)
    setFavoriteCursor(favorites.status === 'fulfilled' ? favorites.value.nextCursor : null)
    setFavoriteCount(favorites.status === 'fulfilled' ? favorites.value.totalCount : null)
    setMoreError('')
    setLoading(false)
  }, [wide, user.id, home.tournament.id])
  const loadMoreFavorites = async () => {
    if (!favoriteCursor || loading || moreLock.current) return
    const ticket = epoch.current
    moreLock.current = true
    setLoadingMore(true)
    setMoreError('')
    try {
      const page = await productRequest<{
        items: PostSummary[]
        nextCursor: string | null
        totalCount: number
      }>(`/me/favorite-posts?limit=30&before=${encodeURIComponent(favoriteCursor)}`)
      if (ticket !== epoch.current) return
      setData((current) => ({
        ...current,
        favorites: [
          ...(current.favorites || []),
          ...page.items.filter((post) => !current.favorites?.some((item) => item.id === post.id)),
        ],
      }))
      setFavoriteCursor(page.nextCursor)
      setFavoriteCount(page.totalCount)
    } catch (issue) {
      if (ticket === epoch.current) setMoreError(message(issue, '更多收藏读取失败'))
    } finally {
      moreLock.current = false
      setLoadingMore(false)
    }
  }
  useEffect(() => {
    void load()
    const changed = () => void load()
    Taro.eventCenter.on('xiaoqiu:native-favorites-changed', changed)
    return () => {
      epoch.current += 1
      Taro.eventCenter.off('xiaoqiu:native-favorites-changed', changed)
    }
  }, [load])
  const watched = new Set(
    [
      preferences?.primaryTeam?.id,
      ...(preferences?.followedTeams.map((team) => team.id) ?? []),
    ].filter(Boolean),
  )
  const followedMatches = (data.schedule ?? []).filter(
    (match) =>
      (match.homeTeam && watched.has(match.homeTeam.id)) ||
      (match.awayTeam && watched.has(match.awayTeam.id)),
  )
  return {
    data,
    errors,
    loading,
    load,
    followedMatches,
    favoriteCursor,
    favoriteCount,
    loadingMore,
    moreError,
    loadMoreFavorites,
  }
}
export type WideProfileData = ReturnType<typeof useWideProfileData>

export function WideProfileContribution({
  user,
  seasonName,
  state,
}: {
  user: AuthUser
  seasonName: string
  state: WideProfileData
}) {
  const { data, errors, loading, followedMatches } = state
  const reporter = user.roles.some((role) =>
    ['MATCH_REPORTER', 'TOURNAMENT_ADMIN'].includes(role.role),
  )
  const posts = data.posts ?? []
  const count = (value: number, failed?: string) => (loading || failed ? '—' : String(value))
  const schedule = data.schedule ?? []
  const cells: Array<[string, string]> = reporter
    ? [
        [
          '已完赛',
          count(schedule.filter((match) => match.homeScore !== null).length, errors.schedule),
        ],
        [
          '待进行',
          count(schedule.filter((match) => match.homeScore === null).length, errors.schedule),
        ],
        ['我的动态', count(posts.length, errors.posts)],
        ['关注比赛', count(followedMatches.length, errors.schedule)],
      ]
    : [
        ['关注比赛', count(followedMatches.length, errors.schedule)],
        ['我的动态', count(posts.length, errors.posts)],
        [
          '获赞',
          count(
            posts.reduce((sum, post) => sum + (post.likeCount ?? 0), 0),
            errors.posts,
          ),
        ],
        [
          '收到评论',
          count(
            posts.reduce((sum, post) => sum + (post.commentCount ?? 0), 0),
            errors.posts,
          ),
        ],
      ]
  return (
    <View className="native-profile-season" aria-label={reporter ? '我的录入' : '我的贡献'}>
      <View className="native-profile-season__heading">
        <Text className="native-profile-season__title">{reporter ? '我的录入' : '我的贡献'}</Text>
        <Text className="native-profile-season__season">{seasonName}</Text>
      </View>
      <View className="native-profile-season__stats">
        {cells.map(([label, value]) => (
          <View className="native-profile-season__cell" key={label}>
            <Text className="native-profile-season__value">{value}</Text>
            <Text className="native-profile-season__label">{label}</Text>
          </View>
        ))}
      </View>
      <Text className="native-profile-season__note">
        {reporter
          ? '本赛季比赛进度，赛后事件在比赛详情或信息录入中补录。'
          : '记录你的社区参与；出场、进球和助攻请前往球员档案查看。'}
      </Text>
    </View>
  )
}

const tabs: Array<{ id: Tab; label: string }> = [
  { id: 'posts', label: '我的动态' },
  { id: 'matches', label: '关注的比赛' },
  { id: 'bookmarks', label: '收藏' },
]
const filters: Array<{ id: Filter; name: string }> = [
  { id: 'all', name: '全部' },
  { id: 'pending', name: '待进行' },
  { id: 'finished', name: '其他状态' },
]

export function WideProfileStream({
  seasonName,
  state,
  onCompose,
}: {
  seasonName: string
  state: WideProfileData
  onCompose: () => void
}) {
  const [tab, setTab] = useState<Tab>('posts')
  const [filter, setFilter] = useState<Filter>('all')
  const { data, errors, loading, load, followedMatches } = state
  const error =
    tab === 'posts' ? errors.posts : tab === 'matches' ? errors.schedule : errors.favorites
  const matches = followedMatches
    .filter(
      (match) =>
        filter === 'all' || (filter === 'pending' ? isPendingMatch(match) : !isPendingMatch(match)),
    )
    .sort((a, b) => (b.scheduledStartAt ?? '').localeCompare(a.scheduledStartAt ?? ''))
  const posts = (tab === 'posts' ? data.posts : data.favorites) ?? []
  const canPublish = nativeWriteEnabled('publishPosts')
  return (
    <View className="native-profile-stream">
      <View className="native-profile-tabs" role="tablist" aria-label="个人内容">
        {tabs.map((item) => (
          <Button
            key={item.id}
            aria-selected={tab === item.id}
            className={`native-profile-tabs__tab${tab === item.id ? ' is-active' : ''}`}
            onClick={() => setTab(item.id)}
          >
            {item.label}
          </Button>
        ))}
        {(tab !== 'posts' || canPublish) && (
          <Button
            className="native-profile-tabs__add"
            aria-label={
              tab === 'posts' ? '发布动态' : tab === 'matches' ? '关注更多比赛' : '添加收藏'
            }
            onClick={() =>
              tab === 'posts'
                ? onCompose()
                : void switchNativeSection(tab === 'matches' ? 'schedule' : 'home')
            }
          >
            +
          </Button>
        )}
      </View>
      <View className="native-profile-stream__panel" role="tabpanel">
        {loading ? (
          <DataState kind="loading" title="正在读取个人内容" />
        ) : error ? (
          <DataState
            kind="error"
            title="内容读取失败"
            description={error}
            onRetry={() => void load()}
          />
        ) : tab === 'matches' ? (
          <>
            <View className="native-profile-filters">
              {filters.map((item) => (
                <Button
                  key={item.id}
                  className={`native-profile-filters__item${filter === item.id ? ' is-active' : ''}`}
                  onClick={() => setFilter(item.id)}
                >
                  {item.name}
                </Button>
              ))}
            </View>
            <Text className="native-profile-stream__note">来自主队与关注球队的赛程。</Text>
            {matches.map((match) => (
              <NativeMatchRow key={match.id} match={match} showDate />
            ))}
            {!matches.length && (
              <Empty
                title="暂时没有这类关注比赛"
                note="选择主队或关注球队，在这里查看它们的赛程。"
                action="去看赛程"
                onAction={() => void switchNativeSection('schedule')}
              />
            )}
          </>
        ) : (
          <>
            <View className="native-profile-stream__heading">
              <Text>{tab === 'posts' ? seasonName : '我的收藏'}</Text>
              <Text className="native-profile-stream__sub">
                {tab === 'posts' ? '记录每一个值得记住的瞬间' : '当前账号收藏的动态'}
              </Text>
            </View>
            {posts.map((post) => (
              <PostCard key={post.id} post={post} onOpen={() => void openPost(post.id)} />
            ))}
            {tab === 'bookmarks' && state.moreError && (
              <Text className="native-error">{state.moreError}</Text>
            )}
            {tab === 'bookmarks' && state.favoriteCursor && (
              <Button
                className="native-button"
                disabled={state.loadingMore}
                loading={state.loadingMore}
                onClick={() => void state.loadMoreFavorites()}
              >
                {state.moreError ? '重试加载' : '加载更多收藏'}
              </Button>
            )}
            {!posts.length &&
              (tab === 'posts' ? (
                <Empty
                  title={canPublish ? '你的球场故事，从这里开始' : '还没有本赛季的公开动态'}
                  note={
                    canPublish ? '分享一张照片或一段观赛感受吧。' : '可到首页查看官方公告与战报。'
                  }
                  action={canPublish ? '发布第一条动态' : '去首页看看'}
                  onAction={canPublish ? onCompose : () => void switchNativeSection('home')}
                />
              ) : (
                <Empty
                  title="把喜欢的足球故事留下来"
                  note="打开动态后点击收藏图标，下次在这里继续看。"
                  action="去首页看看"
                  onAction={() => void switchNativeSection('home')}
                />
              ))}
          </>
        )}
      </View>
    </View>
  )
}

function Empty({
  title,
  note,
  action,
  onAction,
}: {
  title: string
  note: string
  action: string
  onAction: () => void
}) {
  return (
    <View className="native-profile-empty">
      <Text className="native-profile-empty__title">{title}</Text>
      <Text className="native-profile-empty__note">{note}</Text>
      <Button className="native-profile-empty__action" onClick={onAction}>
        {action}
      </Button>
    </View>
  )
}
