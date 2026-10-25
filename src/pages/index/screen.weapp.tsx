import { Button, Image, Input, Text, View } from '@tarojs/components'
import Taro, { getCurrentInstance, useDidShow } from '@tarojs/taro'
import { useCallback, useEffect, useRef, useState } from 'react'
import { NativeComposeEntry } from '../../components/native-social/compose-entry.weapp'
import { useNativeRefreshTask } from '../../features/product/native-refresh.weapp'
import { PublicShell } from '../../components/public-shell'
import { DataState } from '../../components/public-ui'
import { PostCard, ProductSection, TeamCrest, UserAvatar } from '../../components/product-ui'
import { HeroCarousel, type HeroPhoto } from '../../components/hero-carousel/index.weapp'
import { NativeDialog } from '../../components/native-ui/index.weapp'
import { NativeMatchRow } from '../../components/native-match-row/index.weapp'
import { NativeCampusWelcome } from '../../components/campus-context/welcome.weapp'
import {
  productRepository,
  resolveMediaUrl,
  peekNativeProduct,
} from '../../features/product/product.repository'
import { readSession } from '../../features/product/session'
import { openPost } from '../../features/product/post-navigation'
import { openTeam } from '../../features/product/team-navigation'
import { openPlayer } from '../../features/product/player-navigation'
import { openMatch } from '../../features/product/match-navigation'
import { formatDate } from '../../features/product/product.format'
import type {
  HomeResponse,
  MatchSummary,
  PostSummary,
  SearchCategory,
  SearchResponse,
} from '../../features/product/product.types'
import { tournamentHeroSlides } from './home-announcements'
import { alternatingColumns } from './home-feed-layout'
import {
  nativeAnnouncements,
  nativeFocusLabel,
  nativeFocusMatches,
  nativeFocusValue,
} from './home-display.logic.weapp'
import { knockoutMatchTime } from '../data-center/knockout-display.logic'
import './index.weapp.scss'
import {
  switchNativeSection,
  useNativeTournamentId,
} from '../../features/native-navigation/index.weapp'

const categories: Array<{ key: SearchCategory; label: string }> = [
  { key: 'ALL', label: '全部' },
  { key: 'PLAYER', label: '球员' },
  { key: 'TEAM', label: '球队' },
  { key: 'MATCH', label: '比赛' },
  { key: 'POST', label: '动态' },
]
function initialQuery() {
  const raw = getCurrentInstance().router?.params.query ?? ''
  try {
    return decodeURIComponent(raw.replace(/\+/g, ' '))
  } catch {
    return raw
  }
}
export default function NativeHomeScreen() {
  const routeTournamentId = useNativeTournamentId()
  const [home, setHome] = useState<HomeResponse | null>(
      () =>
        peekNativeProduct<HomeResponse>(
          `/public/home${routeTournamentId ? `?tournamentId=${encodeURIComponent(routeTournamentId)}` : ''}`,
        ) || null,
    ),
    [error, setError] = useState('')
  const [query, setQuery] = useState(initialQuery),
    [searchMode, setSearchMode] = useState(() => getCurrentInstance().router?.params.search === '1')
  const [category, setCategory] = useState<SearchCategory>('ALL'),
    [results, setResults] = useState<SearchResponse | null>(null)
  const [searching, setSearching] = useState(false),
    [searchError, setSearchError] = useState(''),
    [announcement, setAnnouncement] = useState<PostSummary | null>(null)
  const [noticesOpen, setNoticesOpen] = useState(false)
  const sequence = useRef(0),
    homeSequence = useRef(0),
    loaded = useRef(false),
    likes = useRef(new Set<string>())
  const load = useCallback(async () => {
    const ticket = ++homeSequence.current
    try {
      const data = await productRepository.getHome(routeTournamentId)
      if (ticket !== homeSequence.current) return
      setHome(data)
      setError('')
      loaded.current = true
    } catch (reason) {
      if (ticket === homeSequence.current)
        setError(reason instanceof Error ? reason.message : '首页读取失败')
    }
  }, [routeTournamentId])
  useNativeRefreshTask(async () => {
    await load()
    if (searchMode && query.trim()) await search(query, category)
  })
  useEffect(() => {
    const published = (post: PostSummary) =>
      setHome((current) =>
        current && (!post.tournamentId || post.tournamentId === current.tournament.id)
          ? { ...current, posts: [post, ...current.posts.filter((item) => item.id !== post.id)] }
          : current,
      )
    Taro.eventCenter.on('xiaoqiu:native-post-published', published)
    return () => {
      Taro.eventCenter.off('xiaoqiu:native-post-published', published)
    }
  }, [])
  useEffect(() => {
    void load()
    return () => {
      sequence.current++
      homeSequence.current++
    }
  }, [load])
  useDidShow(() => {
    if (loaded.current) void load()
  })
  const search = useCallback(
    async (text: string, selected: SearchCategory) => {
      if (!text.trim()) {
        void Taro.showToast({ title: '请输入搜索内容', icon: 'none' })
        return
      }
      const ticket = ++sequence.current
      setSearchMode(true)
      setSearching(true)
      setResults(null)
      setSearchError('')
      void Taro.hideKeyboard()
      try {
        const result = await productRepository.search(text.trim(), selected, home?.tournament.id)
        if (sequence.current === ticket) setResults(result)
      } catch (reason) {
        if (sequence.current === ticket)
          setSearchError(reason instanceof Error ? reason.message : '搜索失败')
      } finally {
        if (sequence.current === ticket) setSearching(false)
      }
    },
    [home?.tournament.id],
  )
  useEffect(() => {
    if (getCurrentInstance().router?.params.search === '1' && query.trim())
      void search(query, category)
  }, [])
  const closeSearch = () => {
    sequence.current++
    setSearchMode(false)
    setResults(null)
    setSearchError('')
    setSearching(false)
  }
  const like = async (post: PostSummary) => {
    if (!readSession()) {
      void Taro.showToast({ title: '登录后可以点赞', icon: 'none' })
      return
    }
    if (likes.current.has(post.id)) return
    likes.current.add(post.id)
    try {
      const result = await productRepository.setLike(post.id, !post.likedByMe)
      setHome((current) =>
        current
          ? {
              ...current,
              posts: current.posts.map((item) =>
                item.id === post.id
                  ? { ...item, likedByMe: result.liked, likeCount: result.likeCount }
                  : item,
              ),
            }
          : current,
      )
    } catch (reason) {
      void Taro.showToast({
        title: reason instanceof Error ? reason.message : '点赞失败',
        icon: 'none',
      })
    } finally {
      likes.current.delete(post.id)
    }
  }
  const photoPosts = home
    ? tournamentHeroSlides(home.announcements).filter((post) =>
        Boolean(resolveMediaUrl(post.imageUrl)),
      )
    : []
  const photos: HeroPhoto[] = photoPosts.map((post) => ({
    src: resolveMediaUrl(post.imageUrl)!,
    alt: post.title?.trim() || '赛事公告',
    title: post.title?.trim() || '赛事公告',
  }))
  const announcements = home ? nativeAnnouncements(home) : []
  return (
    <PublicShell
      active="home"
      tournamentId={home?.tournament.id}
      headerSearch={null}
      onActiveReselect={() => {
        closeSearch()
        void Taro.pageScrollTo({ scrollTop: 0, duration: 180 })
      }}
    >
      <View className="native-home-page">
        <NativeCampusWelcome />
        {!home && !error && <DataState kind="loading" title="正在进入晓球" />}
        {error && (
          <DataState
            kind="error"
            title="首页暂不可用"
            description={error}
            onRetry={() => void load()}
          />
        )}
        {!searchMode && (
          <HeroCarousel
            {...(photos.length
              ? {
                  photos,
                  onSelect: (index: number) => {
                    const post = photoPosts[index]
                    if (post) setAnnouncement(post)
                  },
                }
              : {})}
          />
        )}
        <View className="native-home-search">
          {searchMode ? (
            <Button
              className="native-home-search__back"
              aria-label="返回首页"
              onClick={closeSearch}
            >
              <View className="native-home-search__back-icon" />
            </Button>
          ) : (
            <View className="native-home-search__icon" />
          )}
          <Input
            id="native-home-search-input"
            className="native-search__input"
            confirmType="search"
            placeholder="搜索球员、球队、比赛或动态"
            value={query}
            onInput={(event) => {
              setQuery(event.detail.value)
              if (!event.detail.value.trim()) {
                sequence.current++
                setResults(null)
                setSearchError('')
                setSearching(false)
              }
            }}
            onConfirm={() => void search(query, category)}
          />
          <Button
            className="native-home-search__submit"
            onClick={() => void search(query, category)}
          >
            搜索
          </Button>
        </View>
        {searchMode ? (
          <View className="native-home-search-results">
            <View className="native-search-toolbar">
              <View className="native-search-categories">
                {categories.map((item) => (
                  <Button
                    className={category === item.key ? 'is-active' : ''}
                    key={item.key}
                    onClick={() => {
                      setCategory(item.key)
                      if (query.trim()) void search(query, item.key)
                    }}
                  >
                    {item.label}
                  </Button>
                ))}
              </View>
            </View>
            {searching && <DataState kind="loading" title="正在搜索" />}
            {searchError && (
              <DataState
                kind="error"
                title="搜索失败"
                description={searchError}
                onRetry={() => void search(query, category)}
              />
            )}
            {results && <SearchResults data={results} tournamentId={home?.tournament.id ?? ''} />}
          </View>
        ) : (
          home && (
            <>
              <View className="native-home-section">
                <ProductSection
                  kicker="MATCH CENTRE"
                  title="焦点赛事"
                  actionLabel="查看全部"
                  onAction={() => void switchNativeSection('schedule', home.tournament.id)}
                />
                <View className="native-home-focus">
                  {nativeFocusMatches(home.focusMatches).map((match) => (
                    <FocusCard key={match.id} match={match} tournamentName={home.tournament.name} />
                  ))}
                </View>
              </View>
              {announcements.length > 0 && (
                <Button className="native-home-announcement" onClick={() => setNoticesOpen(true)}>
                  <View className="native-home-announcement__icon" />
                  <Text>{announcements[0]!.title || '官方公告'}</Text>
                  <Text>›</Text>
                </Button>
              )}
              <View className="native-home-section" id="native-home-feed-start">
                <NativeComposeEntry tournamentId={home.tournament.id} />
                <ProductSection kicker="CAMPUS FEED" title="绿茵动态" />
                {home.posts.length ? (
                  <View className="native-home-feed">
                    {alternatingColumns(home.posts, 2, (post) =>
                      Boolean(post.imageUrl || post.imageUrls?.length),
                    ).map((posts, column) => (
                      <View className="native-home-feed__column" key={column}>
                        {posts.map((post) => (
                          <PostCard
                            key={post.id}
                            post={post}
                            variant="home"
                            onOpen={() => void openPost(post.id)}
                            onLike={() => void like(post)}
                          />
                        ))}
                      </View>
                    ))}
                  </View>
                ) : (
                  <Text className="native-note">暂无绿茵动态</Text>
                )}
              </View>
            </>
          )
        )}
      </View>
      {noticesOpen && (
        <NativeDialog title="官方公告" compact={false} onClose={() => setNoticesOpen(false)}>
          {announcements.map((post) => (
            <Button
              className="native-announcement-row"
              key={post.id}
              onClick={() => {
                setNoticesOpen(false)
                setAnnouncement(post)
              }}
            >
              <Text>{post.title || '官方公告'}</Text>
              <Text>{knockoutMatchTime(post.publishedAt, true)}</Text>
            </Button>
          ))}
        </NativeDialog>
      )}
      {announcement && (
        <NativeDialog
          title={announcement.title || '赛事公告'}
          onClose={() => setAnnouncement(null)}
        >
          <Text className="native-note">{formatDate(announcement.publishedAt)}</Text>
          <Text className="native-announcement-body">{announcement.body}</Text>
          {announcement.imageUrl && (
            <Image
              className="native-announcement-image"
              mode="widthFix"
              src={resolveMediaUrl(announcement.imageUrl)!}
            />
          )}
        </NativeDialog>
      )}
    </PublicShell>
  )
}
function FocusCard({ match, tournamentName }: { match: MatchSummary; tournamentName: string }) {
  const scored = match.homeScore !== null && match.awayScore !== null
  return (
    <Button
      className={`native-focus-card${scored ? ' native-focus-card--scored' : ''}`}
      onClick={() => void openMatch(match.id, match.tournamentId)}
    >
      <Text className="native-focus-card__label">{nativeFocusLabel(match, tournamentName)}</Text>
      <View className="native-focus-card__teams">
        <View>
          <TeamCrest team={match.homeTeam} interactive={false} size="small" />
          <Text>{match.homeTeam?.name ?? match.homePlaceholder ?? '主队待定'}</Text>
        </View>
        <View>
          <TeamCrest team={match.awayTeam} interactive={false} size="small" />
          <Text>{match.awayTeam?.name ?? match.awayPlaceholder ?? '客队待定'}</Text>
        </View>
        <Text
          className={`native-focus-card__value${scored ? '' : ' native-focus-card__value--time'}`}
        >
          {nativeFocusValue(match)}
        </Text>
      </View>
    </Button>
  )
}
function SearchResults({ data, tournamentId }: { data: SearchResponse; tournamentId: string }) {
  const count = data.players.length + data.teams.length + data.matches.length + data.posts.length
  return (
    <View>
      <Text className="native-note native-search-count">{count} 项结果</Text>
      {count === 0 && <DataState kind="empty" title="没有找到相关内容" />}
      {data.players.map((player) => (
        <Button
          className="native-search-result-row"
          key={player.id}
          onClick={() => void openPlayer(player.id, tournamentId)}
        >
          <UserAvatar name={player.displayName} avatarUrl={player.avatarUrl} size="small" />
          <View>
            <Text>{player.displayName}</Text>
            <Text className="native-note">{player.team?.name ?? '球员'}</Text>
          </View>
          <Text>›</Text>
        </Button>
      ))}
      {data.teams.map((team) => (
        <Button
          className="native-search-result-row"
          key={team.id}
          onClick={() => void openTeam(team.id, tournamentId)}
        >
          <TeamCrest team={team} interactive={false} size="small" />
          <Text>{team.name}</Text>
          <Text>›</Text>
        </Button>
      ))}
      {data.matches.map((match) => (
        <NativeMatchRow key={match.id} match={match} showDate />
      ))}
      {data.posts.map((post) => (
        <PostCard key={post.id} post={post} onOpen={() => void openPost(post.id)} />
      ))}
    </View>
  )
}
