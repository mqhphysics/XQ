import { Image, Input, Swiper, SwiperItem, Text, View } from '@tarojs/components'
import Taro, { useDidHide, useDidShow, usePullDownRefresh } from '@tarojs/taro'
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
  PublishedTournamentItem,
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
  const [tournaments, setTournaments] = useState<PublishedTournamentItem[]>(
    () => peekProduct<{ items: PublishedTournamentItem[] }>('/public/tournaments')?.items ?? [],
  )
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

  // 公告弹窗状态（暖橙色边缘渐变，点击任意位置关闭）
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
        const [tourRes, homeData] = await Promise.all([
          productRepository
            .getPublishedTournaments(isManualRefresh ? { fresh: true } : undefined)
            .catch(() => ({ items: [] as PublishedTournamentItem[] })),
          productRepository.getHome(
            targetTournamentId || undefined,
            isManualRefresh ? { fresh: true } : undefined,
          ),
        ])
        if (seq !== homeSeq.current) return

        if (tourRes.items.length > 0) {
          setTournaments(tourRes.items)
        }
        setHome(homeData)
        setActiveTournamentId(homeData.tournament.id)
        rememberTournamentId(homeData.tournament.id)

        if (isManualRefresh) {
          setRefreshSeed((prev) => prev + 1)
          setVisiblePostCount(FEED_PAGE_SIZE)
        }
      } catch (err) {
        if (seq === homeSeq.current) {
          setError(err instanceof Error ? err.message : '加载首页数据失败')
        }
      } finally {
        if (seq === homeSeq.current) {
          setLoading(false)
          setRefreshing(false)
          Taro.stopPullDownRefresh()
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

  usePullDownRefresh(() => {
    void loadHomeData(activeTournamentId || undefined, true)
  })

  const handleSelectTournament = (id: string) => {
    if (id === activeTournamentId) return
    setActiveTournamentId(id)
    setSlideIndex(0)
    setVisiblePostCount(FEED_PAGE_SIZE)
    void loadHomeData(id, false)
  }

  const runSearch = useCallback(
    async (keyword: string, cat: SearchCategory) => {
      const trimmed = keyword.trim()
      if (!trimmed) {
        void Taro.showToast({ title: '请输入搜索关键词', icon: 'none' })
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
          setSearchError(err instanceof Error ? err.message : '搜索失败，请稍后重试')
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
      void Taro.showToast({ title: '登录后可以点赞动态', icon: 'none' })
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

  return (
    <AppShell
      active="home"
      tournamentId={home?.tournament.id || activeTournamentId || undefined}
      onBrandClick={() => {
        closeSearch()
        void Taro.pageScrollTo({ scrollTop: 0, duration: 200 })
      }}
    >
      <CampusWelcomeCard />

      {/* 居中下拉刷新状态指示条 */}
      {refreshing ? (
        <View className="home-refresh-banner">
          <View className="home-refresh-banner__spinner" />
          <Text className="home-refresh-banner__text">正在同步最新赛况与推荐动态…</Text>
        </View>
      ) : null}

      <View className="home-page">
        {!home && loading && !error ? (
          <DataState
            kind="loading"
            title="正在进入晓球"
            description="正在从云托管获取实时赛程、公告与校园动态…"
          />
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

        {/* 1. 顶部赛季标语、赛事切换与公告轮播 */}
        {!searchMode && home ? (
          <View className="home-hero">
            <View className="home-hero__copy">
              <View className="home-hero__eyebrow-row">
                <Text className="home-hero__eyebrow">
                  {home.tournament.seasonName || '2026 校园足球赛季'}
                </Text>
                <Text className="home-hero__current-tour">{home.tournament.name}</Text>
              </View>
              <View className="home-hero__headline">
                <Text className="home-hero__title">绿茵正燃</Text>
                <Text className="home-hero__title home-hero__title--warm">青春正好</Text>
              </View>
            </View>

            {tournaments.length > 1 ? (
              <View className="home-tour-switcher">
                {tournaments.map((tour) => {
                  const isSelected = tour.id === home.tournament.id
                  return (
                    <View
                      key={tour.id}
                      className={`home-tour-switcher__pill ${isSelected ? 'home-tour-switcher__pill--active' : ''}`}
                      onClick={() => handleSelectTournament(tour.id)}
                    >
                      <Text>{tour.name || tour.seasonName || '校园赛事'}</Text>
                    </View>
                  )
                })}
              </View>
            ) : null}

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
                        } else if (allAnnouncements[0]) {
                          setActiveAnnouncement(allAnnouncements[0])
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

            {searching ? <DataState kind="loading" title="正在搜索…" /> : null}
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
                onLikePost={(post) => void handleToggleLike(post)}
              />
            ) : null}
          </View>
        ) : home ? (
          <>
            {/* 4. 官方公告暖橙渐变提示条 */}
            {allAnnouncements.length > 0 ? (
              <View
                className="home-notice-bar"
                onClick={() => setNoticesListOpen(true)}
              >
                <View className="home-notice-bar__badge">
                  <Text>公告</Text>
                </View>
                <Text className="home-notice-bar__title">
                  {allAnnouncements[0]!.title || allAnnouncements[0]!.body}
                </Text>
                <Text className="home-notice-bar__more">查看 ›</Text>
              </View>
            ) : null}

            {/* 5. 焦点赛事区 */}
            <View className="home-section">
              <View className="home-section__head">
                <View>
                  <Text className="home-section__title">焦点赛事</Text>
                  <Text className="home-section__sub">
                    {primaryTeam
                      ? `已优先展示你的主队「${primaryTeam.shortName}」及本轮焦点对决`
                      : '实时比分与近期焦点对决'}
                  </Text>
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
                  <Text>全部赛程 ›</Text>
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

            {/* 6. 绿茵动态区（含发帖入口、智能推荐换一批、最短列平衡瀑布流与分页） */}
            <View className="home-section">
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
                  <Text className="home-section__title">绿茵动态</Text>
                  <Text className="home-section__sub">
                    结合主队偏好、赛后快报与热度为你智能推荐
                  </Text>
                </View>
                <View className="home-section__action" onClick={handleShuffleFeed}>
                  <Text>换一批 ↻</Text>
                </View>
              </View>

              {visiblePosts.length > 0 ? (
                <>
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
                            onOpen={(clicked) => {
                              recordPostInteraction(clicked)
                              setActiveAnnouncement(clicked)
                            }}
                            onLike={(clicked) => void handleToggleLike(clicked)}
                          />
                        ))}
                      </View>
                    ))}
                  </View>

                  <View className="home-feed-footer">
                    {hasMorePosts ? (
                      <View
                        className="home-feed-footer__more-btn"
                        onClick={() => setVisiblePostCount((prev) => prev + FEED_PAGE_SIZE)}
                      >
                        <Text>
                          展开更多动态（已显示 {visiblePosts.length} / {rankedPosts.length} 条）
                        </Text>
                      </View>
                    ) : (
                      <View className="home-feed-footer__end" onClick={handleShuffleFeed}>
                        <Text>已经到底啦 · 点此换一批推荐顺序 ↻</Text>
                      </View>
                    )}
                  </View>
                </>
              ) : (
                <DataState kind="empty" title="暂无绿茵动态" description="快来发布第一条球场动态吧！" />
              )}
            </View>
          </>
        ) : null}
      </View>

      {/* 7. 官方公告列表弹窗（暖橙色边缘渐变，无关闭按钮，点任意处关闭） */}
      {noticesListOpen ? (
        <ModalSheet
          variant="warm-notice"
          eyebrow="OFFICIAL NOTICES"
          title="官方与赛事公告"
          onClose={() => setNoticesListOpen(false)}
        >
          <View className="home-notice-list">
            {allAnnouncements.map((item) => (
              <View
                key={item.id}
                className="home-notice-list__row"
                onClick={(e) => {
                  e.stopPropagation()
                  setNoticesListOpen(false)
                  setActiveAnnouncement(item)
                }}
              >
                <View className="home-notice-list__main">
                  <Text className="home-notice-list__title">
                    {item.title || '官方公告'}
                  </Text>
                  <Text className="home-notice-list__preview">{item.body}</Text>
                </View>
                <Text className="home-notice-list__date">
                  {formatShortDate(item.publishedAt)}
                </Text>
              </View>
            ))}
          </View>
        </ModalSheet>
      ) : null}

      {/* 8. 公告 / 快报全文预览弹窗（暖橙色边缘渐变，无关闭按钮，点任意位置关闭） */}
      {activeAnnouncement ? (
        <ModalSheet
          variant="warm-notice"
          eyebrow={activeAnnouncement.type === 'OFFICIAL' ? 'OFFICIAL NOTICE' : 'COMMUNITY POST'}
          title={activeAnnouncement.title || '动态详情'}
          onClose={() => setActiveAnnouncement(null)}
        >
          <View className="home-notice-detail">
            <Text className="home-notice-detail__meta">
              {activeAnnouncement.author?.displayName || '晓球官方'} ·{' '}
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
  onLikePost,
}: {
  data: SearchResponse
  onLikePost: (post: PostSummary) => void
}) {
  const totalCount =
    data.players.length + data.teams.length + data.matches.length + data.posts.length

  if (totalCount === 0) {
    return <DataState kind="empty" title="没有找到相关内容" description="换个关键词或分类试试吧" />
  }

  return (
    <View className="home-search-results">
      <Text className="home-search-results__count">共找到 {totalCount} 项结果</Text>

      {data.players.map((player) => (
        <View key={player.id} className="home-search-row">
          <UserAvatar
            name={player.displayName}
            avatarUrl={player.avatarUrl}
            size="small"
          />
          <View className="home-search-row__info">
            <Text className="home-search-row__title">{player.displayName}</Text>
            <Text className="home-search-row__sub">{player.team?.name || '参赛球员'}</Text>
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
            <Text className="home-search-row__sub">
              {team.groupName ? `${team.groupName} · ` : ''}参赛球队
            </Text>
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
          onLike={() => onLikePost(post)}
        />
      ))}
    </View>
  )
}