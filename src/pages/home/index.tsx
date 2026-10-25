import { Image, Input, Swiper, SwiperItem, Text, View } from '@tarojs/components'
import Taro, { useDidHide, useDidShow } from '@tarojs/taro'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import fallbackActionPhoto from '../../assets/home-visual/home-campus-action.webp'
import fallbackCelebrationPhoto from '../../assets/home-visual/home-team-celebration.webp'
import fallbackHuddlePhoto from '../../assets/home-visual/home-team-huddle.webp'
import photoIcon from '../../assets/post-icons/photo.svg'
import { AppShell } from '../../components/app-shell'
import { FocusMatchCard, MatchRowCard } from '../../components/match-card'
import { CampusWelcomeCard, ModalSheet } from '../../components/modal-sheet'
import { PostCard } from '../../components/post-card'
import { DataState, TeamCrest, UserAvatar } from '../../components/team-crest'
import {
  invalidateProductReads,
  peekProduct,
  productRepository,
  resolveMediaUrl,
} from '../../services/api'
import { formatDateTime, formatShortDate } from '../../services/format'
import { readSession, subscribeToSessionWrites } from '../../store/session'
import { knownTournamentId, rememberTournamentId } from '../../store/tournament'
import type {
  AuthSession,
  HomeResponse,
  PostSummary,
  SearchCategory,
  SearchResponse,
} from '../../types'
import {
  balancedMasonryColumns,
  isPostRelatedToTeam,
  mergeAnnouncements,
  rankRecommendedPosts,
  recordPostInteraction,
  selectFocusMatches,
  selectHeroSlides,
} from './home-helpers'
import './index.scss'

interface HeroSlide {
  src: string
  alt: string
  title?: string
  post?: PostSummary
}

const FALLBACK_SLIDES: HeroSlide[] = [
  { src: fallbackActionPhoto, alt: '校园足球比赛瞬间' },
  { src: fallbackHuddlePhoto, alt: '队员赛前集结加油' },
  { src: fallbackCelebrationPhoto, alt: '进球庆祝时刻' },
]

const SEARCH_CATEGORIES: Array<{ key: SearchCategory; label: string }> = [
  { key: 'ALL', label: '全部' },
  { key: 'PLAYER', label: '球员' },
  { key: 'TEAM', label: '球队' },
  { key: 'MATCH', label: '比赛' },
  { key: 'POST', label: '动态' },
]

const FEED_PAGE_SIZE = 8

export default function HomePage() {
  const [session, setSession] = useState<AuthSession | null>(() => readSession())
  const [activeTournamentId, setActiveTournamentId] = useState<string>(
    () => knownTournamentId() || '',
  )
  const [home, setHome] = useState<HomeResponse | null>(() => {
    const initialId = knownTournamentId()
    return (
      peekProduct<HomeResponse>(
        `/public/home${initialId ? `?tournamentId=${encodeURIComponent(initialId)}` : ''}`,
      ) ?? null
    )
  })
  const [primaryTeamId, setPrimaryTeamId] = useState<string | null>(null)
  const [loading, setLoading] = useState(!home)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')

  // 轮播控制
  const [slideIndex, setSlideIndex] = useState(0)
  const [carouselPaused, setCarouselPaused] = useState(false)
  const [pageVisible, setPageVisible] = useState(true)

  // 搜索状态
  const [query, setQuery] = useState('')
  const [searchMode, setSearchMode] = useState(false)
  const [searchCategory, setSearchCategory] = useState<SearchCategory>('ALL')
  const [searchResults, setSearchResults] = useState<SearchResponse | null>(null)
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState('')

  // 官方公告弹窗状态（标准白底带右上角 ×）
  const [noticesListOpen, setNoticesListOpen] = useState(false)
  const [activeAnnouncement, setActiveAnnouncement] = useState<PostSummary | null>(null)

  // 动态推荐与分页状态
  const [refreshSeed, setRefreshSeed] = useState(0)
  const [visiblePostCount, setVisiblePostCount] = useState(FEED_PAGE_SIZE)

  const homeSeq = useRef(0)
  const searchSeq = useRef(0)
  const likingIds = useRef(new Set<string>())

  useDidHide(() => setPageVisible(false))
  useDidShow(() => setPageVisible(true))

  useEffect(() => {
    return subscribeToSessionWrites(() => {
      setSession(readSession())
    })
  }, [])

  const loadHomeData = useCallback(
    async (targetTournamentId?: string, isManualRefresh = false) => {
      const seq = ++homeSeq.current
      if (!home && !isManualRefresh) {
        setLoading(true)
      }
      if (isManualRefresh) {
        setRefreshing(true)
        invalidateProductReads()
      }
      setError('')

      try {
        const homeData = await productRepository.getHome(
          targetTournamentId || undefined,
          isManualRefresh ? { fresh: true } : undefined,
        )
        if (seq !== homeSeq.current) return

        setHome(homeData)
        setActiveTournamentId(homeData.tournament.id)
        rememberTournamentId(homeData.tournament.id)

        if (isManualRefresh) {
          setRefreshSeed((prev) => prev + 1)
          setVisiblePostCount(FEED_PAGE_SIZE)
        }
      } catch (err) {
        if (seq === homeSeq.current) {
          setError(err instanceof Error ? err.message : '首页读取失败')
        }
      } finally {
        if (seq === homeSeq.current) {
          setLoading(false)
          setRefreshing(false)
        }
      }
    },
    [home],
  )

  useEffect(() => {
    void loadHomeData(activeTournamentId || undefined)
  }, [])

  useEffect(() => {
    if (!session?.accessToken) {
      setPrimaryTeamId(null)
      return
    }
    void productRepository
      .getTeamPreferences(activeTournamentId || undefined)
      .then((pref) => setPrimaryTeamId(pref.primaryTeam?.id ?? null))
      .catch(() => {})
  }, [activeTournamentId, session?.accessToken])

  const runSearch = useCallback(
    async (keyword: string, cat: SearchCategory) => {
      const trimmed = keyword.trim()
      if (!trimmed) {
        void Taro.showToast({ title: '请输入搜索内容', icon: 'none' })
        return
      }
      const seq = ++searchSeq.current
      setSearchMode(true)
      setSearching(true)
      setSearchError('')
      void Taro.hideKeyboard()

      try {
        const res = await productRepository.search(
          trimmed,
          cat,
          home?.tournament.id || activeTournamentId || undefined,
        )
        if (seq === searchSeq.current) {
          setSearchResults(res)
        }
      } catch (err) {
        if (seq === searchSeq.current) {
          setSearchError(err instanceof Error ? err.message : '搜索失败')
        }
      } finally {
        if (seq === searchSeq.current) {
          setSearching(false)
        }
      }
    },
    [activeTournamentId, home?.tournament.id],
  )

  const closeSearch = () => {
    searchSeq.current += 1
    setSearchMode(false)
    setSearchResults(null)
    setSearchError('')
    setSearching(false)
  }

  const handleToggleLike = async (post: PostSummary) => {
    if (!readSession()) {
      void Taro.showToast({ title: '登录后可以点赞', icon: 'none' })
      return
    }
    if (likingIds.current.has(post.id)) return
    likingIds.current.add(post.id)
    recordPostInteraction(post)

    const optimisticLiked = !post.likedByMe
    const optimisticCount = Math.max(0, post.likeCount + (optimisticLiked ? 1 : -1))

    setHome((prev) =>
      prev
        ? {
            ...prev,
            posts: prev.posts.map((item) =>
              item.id === post.id
                ? { ...item, likedByMe: optimisticLiked, likeCount: optimisticCount }
                : item,
            ),
          }
        : prev,
    )

    try {
      const res = await productRepository.setLike(post.id, optimisticLiked)
      setHome((prev) =>
        prev
          ? {
              ...prev,
              posts: prev.posts.map((item) =>
                item.id === post.id
                  ? { ...item, likedByMe: res.liked, likeCount: res.likeCount }
                  : item,
              ),
            }
          : prev,
      )
    } catch (err) {
      setHome((prev) =>
        prev
          ? {
              ...prev,
              posts: prev.posts.map((item) =>
                item.id === post.id
                  ? { ...item, likedByMe: post.likedByMe, likeCount: post.likeCount }
                  : item,
              ),
            }
          : prev,
      )
      void Taro.showToast({
        title: err instanceof Error ? err.message : '点赞失败',
        icon: 'none',
      })
    } finally {
      likingIds.current.delete(post.id)
    }
  }

  const primaryTeam = useMemo(() => {
    if (!primaryTeamId || !home) return null
    return home.teams.find((t) => t.id === primaryTeamId) ?? null
  }, [home, primaryTeamId])

  const heroSlides: HeroSlide[] = useMemo(() => {
    if (!home) return FALLBACK_SLIDES
    const candidates = selectHeroSlides(home.announcements)
      .map((post) => {
        const src = resolveMediaUrl(post.imageUrl)
        if (!src) return null
        return {
          src,
          alt: post.title?.trim() || '赛事公告',
          title: post.title?.trim() || '赛事公告',
          post,
        } satisfies HeroSlide
      })
      .filter((item): item is NonNullable<typeof item> => Boolean(item))

    return candidates.length > 0 ? candidates : FALLBACK_SLIDES
  }, [home])

  const allAnnouncements = useMemo(() => (home ? mergeAnnouncements(home) : []), [home])

  const focusMatches = useMemo(
    () => (home ? selectFocusMatches(home.focusMatches, primaryTeamId) : []),
    [home, primaryTeamId],
  )

  const rankedPosts = useMemo(() => {
    if (!home) return []
    return rankRecommendedPosts({
      posts: home.posts,
      primaryTeamId: primaryTeam?.id,
      primaryTeamName: primaryTeam?.name,
      primaryTeamShortName: primaryTeam?.shortName,
      user: session?.user ?? null,
      refreshSeed,
    })
  }, [home, primaryTeam, refreshSeed, session?.user])

  const visiblePosts = useMemo(
    () => rankedPosts.slice(0, visiblePostCount),
    [rankedPosts, visiblePostCount],
  )

  const masonryColumns = useMemo(
    () => balancedMasonryColumns(visiblePosts, 2),
    [visiblePosts],
  )

  const hasMorePosts = visiblePostCount < rankedPosts.length

  const handleShuffleFeed = () => {
    setRefreshSeed((prev) => prev + 1)
    setVisiblePostCount(FEED_PAGE_SIZE)
    void Taro.showToast({ title: '已为你更新推荐动态', icon: 'none', duration: 1200 })
  }

  const handleLoadMorePosts = useCallback(() => {
    if (searchMode || !hasMorePosts) return
    setVisiblePostCount((prev) => Math.min(rankedPosts.length, prev + FEED_PAGE_SIZE))
  }, [hasMorePosts, rankedPosts.length, searchMode])

  const handleOpenPost = (post: PostSummary) => {
    recordPostInteraction(post)
    void Taro.navigateTo({
      url: `/pages/post-detail/index?postId=${encodeURIComponent(post.id)}`,
    }).catch(() => {
      void Taro.showToast({
        title: '帖子详情页将在后续阶段接入',
        icon: 'none',
      })
    })
  }

  return (
    <AppShell
      active="home"
      tournamentId={home?.tournament.id || activeTournamentId || undefined}
      refreshing={refreshing}
      onRefresh={() => {
        void loadHomeData(activeTournamentId || undefined, true)
        if (searchMode && query.trim()) {
          void runSearch(query, searchCategory)
        }
      }}
      onScrollToLower={handleLoadMorePosts}
      onBrandClick={() => {
        closeSearch()
      }}
    >
      <CampusWelcomeCard />

      <View className="home-page">
        {!home && loading && !error ? (
          <DataState kind="loading" title="正在进入晓球" />
        ) : null}

        {error && !home ? (
          <DataState
            kind="error"
            title="首页暂不可用"
            description={error}
            actionLabel="重新加载"
            onRetry={() => void loadHomeData(activeTournamentId || undefined, true)}
          />
        ) : null}

        {/* 1. 顶部赛季标语、右上角当前赛事胶囊与公告轮播 */}
        {!searchMode && home ? (
          <View className="home-hero">
            <View className="home-hero__copy">
              <View className="home-hero__eyebrow-row">
                <Text className="home-hero__eyebrow">2026 校园足球赛季</Text>
                {home.tournament.name ? (
                  <Text className="home-hero__current-tour">{home.tournament.name}</Text>
                ) : null}
              </View>
              <View className="home-hero__headline">
                <Text className="home-hero__title">绿茵正燃</Text>
                <Text className="home-hero__title home-hero__title--warm">青春正好</Text>
              </View>
            </View>

            <View className="home-hero__carousel">
              <Swiper
                className="home-hero__swiper"
                autoplay={pageVisible && !carouselPaused && heroSlides.length > 1}
                interval={5000}
                duration={380}
                circular={heroSlides.length > 1}
                onChange={(e) => setSlideIndex(e.detail.current)}
              >
                {heroSlides.map((slide, idx) => (
                  <SwiperItem key={`${slide.src}:${idx}`}>
                    <View
                      className="home-hero__slide"
                      onClick={() => {
                        if (slide.post) {
                          setActiveAnnouncement(slide.post)
                        }
                      }}
                    >
                      <Image
                        className="home-hero__photo"
                        src={slide.src}
                        mode="aspectFill"
                      />
                      {slide.title ? (
                        <View
                          className={`home-hero__caption ${heroSlides.length > 1 ? 'home-hero__caption--with-controls' : ''}`}
                        >
                          <Text className="home-hero__caption-badge">赛事公告</Text>
                          <Text className="home-hero__caption-title">{slide.title}</Text>
                        </View>
                      ) : null}
                    </View>
                  </SwiperItem>
                ))}
              </Swiper>

              {heroSlides.length > 1 ? (
                <View className="home-hero__controls">
                  <View className="home-hero__dots">
                    {heroSlides.map((slide, idx) => (
                      <View
                        key={`${slide.src}:${idx}`}
                        className={`home-hero__dot ${slideIndex === idx ? 'home-hero__dot--active' : ''}`}
                      />
                    ))}
                  </View>
                  <View
                    className="home-hero__pause"
                    onClick={() => setCarouselPaused((prev) => !prev)}
                  >
                    <Text>{carouselPaused ? '播放' : '暂停'}</Text>
                  </View>
                </View>
              ) : null}
            </View>
          </View>
        ) : null}

        {/* 2. 全站搜索框 */}
        <View className="home-search">
          {searchMode ? (
            <View className="home-search__back" onClick={closeSearch}>
              <View className="home-search__back-icon" />
            </View>
          ) : (
            <View className="home-search__icon" />
          )}
          <Input
            className="home-search__input"
            confirmType="search"
            placeholder="搜索球员、球队、比赛或动态"
            value={query}
            onInput={(e) => {
              const val = e.detail.value
              setQuery(val)
              if (!val.trim()) {
                searchSeq.current += 1
                setSearchResults(null)
                setSearchError('')
                setSearching(false)
              }
            }}
            onConfirm={() => void runSearch(query, searchCategory)}
          />
          <View
            className="home-search__submit"
            onClick={() => void runSearch(query, searchCategory)}
          >
            <Text>搜索</Text>
          </View>
        </View>

        {/* 3. 搜索结果视图 vs 正常首页视图 */}
        {searchMode ? (
          <View className="home-search-panel">
            <View className="home-search-cats">
              {SEARCH_CATEGORIES.map((item) => (
                <View
                  key={item.key}
                  className={`home-search-cats__item ${searchCategory === item.key ? 'home-search-cats__item--active' : ''}`}
                  onClick={() => {
                    setSearchCategory(item.key)
                    if (query.trim()) {
                      void runSearch(query, item.key)
                    }
                  }}
                >
                  <Text>{item.label}</Text>
                </View>
              ))}
            </View>

            {searching ? <DataState kind="loading" title="正在搜索" /> : null}
            {searchError ? (
              <DataState
                kind="error"
                title="搜索失败"
                description={searchError}
                actionLabel="重试"
                onRetry={() => void runSearch(query, searchCategory)}
              />
            ) : null}

            {searchResults && !searching ? (
              <SearchResultsView
                data={searchResults}
                onOpenPost={handleOpenPost}
                onLikePost={(post) => void handleToggleLike(post)}
              />
            ) : null}
          </View>
        ) : home ? (
          <>
            {/* 4. 焦点赛事区 */}
            <View className="home-section">
              <View className="home-section__head">
                <View>
                  <Text className="home-section__kicker">MATCH CENTRE</Text>
                  <Text className="home-section__title">焦点赛事</Text>
                </View>
                <View
                  className="home-section__action"
                  onClick={() =>
                    void Taro.showToast({
                      title: '赛程页将在下一步接入',
                      icon: 'none',
                    })
                  }
                >
                  <Text>查看全部 ›</Text>
                </View>
              </View>

              {focusMatches.length > 0 ? (
                <View className="home-focus-grid">
                  {focusMatches.map((match) => (
                    <FocusMatchCard
                      key={match.id}
                      match={match}
                      tournamentName={home.tournament.name}
                      isPrimaryTeamMatch={Boolean(
                        primaryTeamId &&
                          (match.homeTeam?.id === primaryTeamId ||
                            match.awayTeam?.id === primaryTeamId),
                      )}
                      onClick={() =>
                        void Taro.showToast({
                          title: '比赛详情页将在后续阶段接入',
                          icon: 'none',
                        })
                      }
                    />
                  ))}
                </View>
              ) : (
                <DataState kind="empty" title="当前赛事暂无近期焦点赛程" />
              )}
            </View>

            {/* 5. 官方公告条（位于焦点赛事与绿茵动态之间，对齐原版布局） */}
            {allAnnouncements.length > 0 ? (
              <View
                className="home-notice-bar"
                onClick={() => setNoticesListOpen(true)}
              >
                <View className="home-notice-bar__badge">
                  <Text>公告</Text>
                </View>
                <Text className="home-notice-bar__title">
                  {allAnnouncements[0]!.title || '官方公告'}
                </Text>
                <Text className="home-notice-bar__more">›</Text>
              </View>
            ) : null}

            {/* 6. 绿茵动态区（含发帖入口、换一批推荐按钮、高度平衡双列瀑布流与触底自动加载） */}
            <View className="home-section" id="native-home-feed-start">
              <View
                className="home-compose-entry"
                onClick={() =>
                  void Taro.showToast({
                    title: '发帖编辑器将在社区互动阶段接入',
                    icon: 'none',
                  })
                }
              >
                <UserAvatar
                  name={session?.user.displayName || '访客'}
                  avatarUrl={session?.user.avatarUrl}
                  size="small"
                />
                <View className="home-compose-entry__copy">
                  <Text className="home-compose-entry__title">分享你的绿茵时刻</Text>
                  <Text className="home-compose-entry__sub">写动态、发球场照片、关联球队与比赛标签</Text>
                </View>
                <Image className="home-compose-entry__icon" src={photoIcon} mode="aspectFit" />
              </View>

              <View className="home-section__head">
                <View>
                  <Text className="home-section__kicker">CAMPUS FEED</Text>
                  <Text className="home-section__title">绿茵动态</Text>
                </View>
                <View className="home-section__action" onClick={handleShuffleFeed}>
                  <Text>换一批 ↻</Text>
                </View>
              </View>

              {visiblePosts.length > 0 ? (
                <View className="home-feed-masonry">
                  {masonryColumns.map((columnPosts, colIdx) => (
                    <View key={colIdx} className="home-feed-masonry__col">
                      {columnPosts.map((post) => (
                        <PostCard
                          key={post.id}
                          post={post}
                          variant="home"
                          isRecommendedForTeam={isPostRelatedToTeam(
                            post,
                            primaryTeam?.id,
                            primaryTeam?.name,
                            primaryTeam?.shortName,
                          )}
                          onOpen={handleOpenPost}
                          onLike={(clicked) => void handleToggleLike(clicked)}
                        />
                      ))}
                    </View>
                  ))}
                </View>
              ) : (
                <Text className="home-empty-note">暂无绿茵动态</Text>
              )}
            </View>
          </>
        ) : null}
      </View>

      {/* 7. 官方公告列表弹窗（标准白底弹窗，带右上角关闭按钮） */}
      {noticesListOpen ? (
        <ModalSheet
          title="官方公告"
          onClose={() => setNoticesListOpen(false)}
        >
          <View className="home-notice-list">
            {allAnnouncements.map((item) => (
              <View
                key={item.id}
                className="home-notice-list__row"
                onClick={() => {
                  setNoticesListOpen(false)
                  setActiveAnnouncement(item)
                }}
              >
                <Text className="home-notice-list__title">
                  {item.title || '官方公告'}
                </Text>
                <Text className="home-notice-list__date">
                  {formatShortDate(item.publishedAt)}
                </Text>
              </View>
            ))}
          </View>
        </ModalSheet>
      ) : null}

      {/* 8. 赛事公告全文详情弹窗（标准白底弹窗，带右上角关闭按钮） */}
      {activeAnnouncement ? (
        <ModalSheet
          title={activeAnnouncement.title || '赛事公告'}
          onClose={() => setActiveAnnouncement(null)}
        >
          <View className="home-notice-detail">
            <Text className="home-notice-detail__meta">
              {formatDateTime(activeAnnouncement.publishedAt)}
            </Text>
            <Text className="home-notice-detail__body">{activeAnnouncement.body}</Text>
            {activeAnnouncement.imageUrl && resolveMediaUrl(activeAnnouncement.imageUrl) ? (
              <Image
                className="home-notice-detail__image"
                src={resolveMediaUrl(activeAnnouncement.imageUrl)!}
                mode="widthFix"
              />
            ) : null}
          </View>
        </ModalSheet>
      ) : null}
    </AppShell>
  )
}

function SearchResultsView({
  data,
  onOpenPost,
  onLikePost,
}: {
  data: SearchResponse
  onOpenPost: (post: PostSummary) => void
  onLikePost: (post: PostSummary) => void
}) {
  const totalCount =
    data.players.length + data.teams.length + data.matches.length + data.posts.length

  if (totalCount === 0) {
    return <DataState kind="empty" title="没有找到相关内容" />
  }

  return (
    <View className="home-search-results">
      <Text className="home-search-results__count">{totalCount} 项结果</Text>

      {data.players.map((player) => (
        <View key={player.id} className="home-search-row">
          <UserAvatar
            name={player.displayName}
            avatarUrl={player.avatarUrl}
            size="small"
          />
          <View className="home-search-row__info">
            <Text className="home-search-row__title">{player.displayName}</Text>
            <Text className="home-search-row__sub">{player.team?.name || '球员'}</Text>
          </View>
          <Text className="home-search-row__arrow">›</Text>
        </View>
      ))}

      {data.teams.map((team) => (
        <View key={team.id} className="home-search-row">
          <TeamCrest
            teamCode={team.teamCode}
            name={team.shortName}
            color={team.primaryColor || undefined}
            crestUrl={team.crestUrl}
            size="small"
          />
          <View className="home-search-row__info">
            <Text className="home-search-row__title">{team.name}</Text>
          </View>
          <Text className="home-search-row__arrow">›</Text>
        </View>
      ))}

      {data.matches.map((match) => (
        <MatchRowCard key={match.id} match={match} showDate />
      ))}

      {data.posts.map((post) => (
        <PostCard
          key={post.id}
          post={post}
          variant="feed"
          onOpen={onOpenPost}
          onLike={() => onLikePost(post)}
        />
      ))}
    </View>
  )
}