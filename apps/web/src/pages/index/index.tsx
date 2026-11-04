import { Button, Input, Text, View } from '@tarojs/components'
import Taro, { getCurrentInstance } from '@tarojs/taro'
import { useCallback, useEffect, useRef, useState } from 'react'

import { PublicShell } from '../../components/public-shell'
import { PersistentHeaderSearch } from '../../components/public-shell/persistent-header-search'
import { IconButton } from '../../components/icon-button'
import { HeroCarousel, type HeroPhoto } from '../../components/hero-carousel'
import { HomeHeroCopy } from './home-hero-copy'

import { openPost } from '../../features/product/post-navigation'
import { openTeam } from '../../features/product/team-navigation'
import { openPlayer } from '../../features/product/player-navigation'
import { openMatch } from '../../features/product/match-navigation'
import { PersonTrigger } from '../../components/person-trigger'
import { useOverlayFocus } from '../../components/overlay-focus'
import { openMessaging } from '../../components/messaging-drawer'
import { DataState } from '../../components/public-ui'
import {
  MatchStatus,
  PostCard,
  ProductSection,
  TeamCrest,
  TeamName,
  UserAvatar,
} from '../../components/product-ui'
import { formatDate, formatTime } from '../../features/product/product.format'
import {
  createClientActionId,
  peekProduct,
  productRepository,
  resolveMediaUrl,
  sizedMediaUrl,
} from '../../features/product/product.repository'
import { readSession } from '../../features/product/session'

import { loadHomeWithEmptyState, type HomeLoadState } from '../../features/product/home-loading'
import { tournamentHeroSlides } from './home-announcements'
import { alternatingColumns } from './home-feed-layout'
import './home-desktop'
import {
  ANNOUNCEMENTS_DIALOG_SUPPORTED,
  AnnouncementsDialog,
} from '../../components/announcements-dialog'
import type {
  HomeResponse,
  MatchSummary,
  PostSummary,
  SearchCategory,
  SearchResponse,
} from '../../features/product/product.types'

import './index.scss'
import { DesktopSearchResults } from './search-results.h5'

type PageState = HomeLoadState<HomeResponse>

const searchCategories: Array<{ key: SearchCategory; label: string }> = [
  { key: 'ALL', label: '全部' },
  { key: 'PLAYER', label: '球员' },
  { key: 'TEAM', label: '球队' },
  { key: 'MATCH', label: '比赛' },
  { key: 'POST', label: '动态' },
]

function readSearchRoute() {
  if (typeof window !== 'undefined') {
    const routeQuery = window.location.hash.includes('?')
      ? window.location.hash.slice(window.location.hash.indexOf('?') + 1)
      : window.location.search
    const params = new URLSearchParams(routeQuery)
    const query = params.get('query') ?? ''
    const category =
      searchCategories.find((item) => item.key === params.get('category'))?.key ?? 'ALL'
    return { query, category, expanded: params.get('search') === '1' || Boolean(query.trim()) }
  }
  const params = getCurrentInstance().router?.params ?? {}
  let query = params.query ?? ''
  try {
    query = decodeURIComponent(query.replace(/\+/g, ' '))
  } catch {
    // Keep malformed links readable instead of failing the whole page.
  }
  const category = searchCategories.find((item) => item.key === params.category)?.key ?? 'ALL'
  return { query, category, expanded: params.search === '1' || Boolean(query.trim()) }
}

export default function IndexPage() {
  const [initialSearch] = useState(readSearchRoute)
  const [state, setState] = useState<PageState>(() => {
    const cached = peekProduct<HomeResponse>('/public/home')
    return cached ? { phase: 'ready', data: cached } : { phase: 'loading' }
  })
  const [searchText, setSearchText] = useState(initialSearch.query)
  const [searchCategory, setSearchCategory] = useState<SearchCategory>(initialSearch.category)
  const [searchMode, setSearchMode] = useState(initialSearch.expanded)
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)
  const [searchResult, setSearchResult] = useState<SearchResponse | null>(null)
  const [composerOpen, setComposerOpen] = useState(false)
  const [postBody, setPostBody] = useState('')
  const [postImageDataUrl, setPostImageDataUrl] = useState<string | null>(null)
  const [postImageProcessing, setPostImageProcessing] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [pendingPost, setPendingPost] = useState<{ id: string; signature: string } | null>(null)
  const searchRequestId = useRef(0)

  useOverlayFocus(
    composerOpen &&
      !(Taro.getEnv() === Taro.ENV_TYPE.WEB && window.matchMedia('(min-width: 721px)').matches),
    '.composer-dialog',
    () => setComposerOpen(false),
  )

  const load = useCallback(async () => {
    if (!peekProduct<HomeResponse>('/public/home')) setState({ phase: 'loading' })
    try {
      setState(
        Taro.getEnv() === Taro.ENV_TYPE.WEB
          ? await loadHomeWithEmptyState(
              () => productRepository.getHome(),
              () => productRepository.getPublishedTournaments(),
            )
          : { phase: 'ready', data: await productRepository.getHome() },
      )
    } catch (error) {
      setState({
        phase: 'failed',
        message: error instanceof Error ? error.message : '首页加载失败，请稍后重试。',
      })
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (Taro.getEnv() !== Taro.ENV_TYPE.WEB) return
    const published = (event: Event) => {
      const post = (event as CustomEvent<PostSummary>).detail
      if (!post?.id) return
      setState((current) =>
        current.phase === 'ready' && post.tournamentId === current.data.tournament.id
          ? {
              ...current,
              data: {
                ...current.data,
                posts: [post, ...current.data.posts.filter((item) => item.id !== post.id)],
              },
            }
          : current,
      )
    }
    window.addEventListener('xiaoqiu:post-published', published)
    return () => window.removeEventListener('xiaoqiu:post-published', published)
  }, [])

  const runSearch = useCallback(async (text: string, category: SearchCategory) => {
    const query = text.trim()
    const requestId = ++searchRequestId.current
    if (!query) {
      setSearching(false)
      setSearchResult(null)
      setSearchError(null)
      return
    }
    setSearching(true)
    setSearchError(null)
    setSearchResult(null)
    try {
      const result = await productRepository.search(query, category)
      if (requestId === searchRequestId.current) setSearchResult(result)
    } catch (error) {
      if (requestId === searchRequestId.current) {
        setSearchError(error instanceof Error ? error.message : '搜索失败，请稍后重试。')
      }
    } finally {
      if (requestId === searchRequestId.current) setSearching(false)
    }
  }, [])

  useEffect(() => {
    if (initialSearch.expanded) void runSearch(initialSearch.query, initialSearch.category)
    return () => {
      searchRequestId.current += 1
    }
  }, [initialSearch, runSearch])

  const handleSearch = async (category: SearchCategory = searchCategory, text = searchText) => {
    const query = text.trim()
    if (!searchMode && !query) return
    if (Taro.getEnv() === Taro.ENV_TYPE.WEB) {
      const url = `/pages/index/index?search=1&query=${encodeURIComponent(query)}&category=${category}`
      // Searching from home switches this page into search mode in place: Taro ignores a
      // navigateTo to the page that is already showing, which used to leave the URL changed
      // but the results never rendered. Refining replaces the entry the same way.
      const browserUrl = new URL(window.location.href)
      if (browserUrl.hash.startsWith('#/')) browserUrl.hash = url
      else {
        const target = new URL(url, browserUrl.origin)
        browserUrl.pathname = target.pathname
        browserUrl.search = target.search
      }
      window.history.replaceState(window.history.state, '', browserUrl)
    }
    setSearchText(text)
    setSearchMode(true)
    await runSearch(query, category)
  }

  const handleCategoryChange = (category: SearchCategory) => {
    setSearchCategory(category)
    if (searchText.trim()) void handleSearch(category)
  }

  const handleSearchTextChange = (value: string) => {
    setSearchText(value)
    if (value.trim()) return
    searchRequestId.current += 1
    setSearching(false)
    setSearchError(null)
    setSearchResult(null)
  }

  const exitSearch = () => {
    if (!searchMode) return
    if (Taro.getEnv() === Taro.ENV_TYPE.WEB && initialSearch.expanded) {
      if (window.history.state?.xiaoqiuSearchEntry) {
        window.history.back()
      } else {
        void Taro.redirectTo({ url: '/pages/index/index' })
      }
      return
    }
    searchRequestId.current += 1
    setSearchMode(false)
    setSearching(false)
    setSearchError(null)
    if (Taro.getEnv() === Taro.ENV_TYPE.WEB) {
      const browserUrl = new URL(window.location.href)
      if (browserUrl.hash.startsWith('#/')) browserUrl.hash = '/pages/index/index'
      else browserUrl.search = ''
      window.history.replaceState(window.history.state, '', browserUrl)
    }
  }

  const handleLike = async (post: PostSummary) => {
    if (!readSession()) {
      await Taro.showToast({ title: '登录后可以点赞', icon: 'none' })
      await Taro.reLaunch({ url: '/pages/login/index' })
      return
    }
    try {
      const result = await productRepository.setLike(post.id, !post.likedByMe)
      setState((current) => {
        if (current.phase !== 'ready') return current
        return {
          phase: 'ready',
          data: {
            ...current.data,
            posts: current.data.posts.map((item) =>
              item.id === post.id
                ? { ...item, likedByMe: result.liked, likeCount: result.likeCount }
                : item,
            ),
          },
        }
      })
    } catch (error) {
      await Taro.showToast({
        title: error instanceof Error ? error.message : '操作失败',
        icon: 'none',
      })
    }
  }

  const openComposer = async () => {
    if (!readSession()) {
      const result = await Taro.showModal({
        title: '登录后即可发送动态',
        content: '登录后即可发布绿茵动态。是否前往登录？',
        confirmText: '前往登录',
        cancelText: '取消',
      })
      if (result.confirm) await Taro.reLaunch({ url: '/pages/login/index' })
      return
    }
    setComposerOpen(true)
  }

  const publishPost = async () => {
    const body = postBody.trim()
    if (body.length < 2 || publishing || postImageProcessing) return
    const signature = `${body}\n${postImageDataUrl ?? ''}`
    const request =
      pendingPost?.signature === signature
        ? pendingPost
        : { id: createClientActionId('post'), signature }
    setPendingPost(request)
    setPublishing(true)
    try {
      const post = await productRepository.createPost(
        body,
        request.id,
        undefined,
        undefined,
        postImageDataUrl ?? undefined,
      )
      setState((current) =>
        current.phase === 'ready'
          ? { phase: 'ready', data: { ...current.data, posts: [post, ...current.data.posts] } }
          : current,
      )
      setPostBody('')
      setPostImageDataUrl(null)
      setPendingPost(null)
      setComposerOpen(false)
      await Taro.showToast({ title: '已发布', icon: 'success' })
    } catch (error) {
      await Taro.showToast({
        title: error instanceof Error ? error.message : '发布失败',
        icon: 'none',
      })
    } finally {
      setPublishing(false)
    }
  }

  const tournamentId = state.phase === 'ready' ? state.data.tournament.id : undefined

  return (
    <PublicShell
      active="home"
      tournamentId={tournamentId}
      onActiveReselect={() => {
        if (initialSearch.expanded) void Taro.redirectTo({ url: '/pages/index/index' })
        else exitSearch()
      }}
      headerSearch={
        searchMode ? null : (
          <PersistentHeaderSearch
            query={searchText}
            onQueryChange={handleSearchTextChange}
            onSearch={(query) => void handleSearch(searchCategory, query)}
          />
        )
      }
    >
      <CampusBackdrop search={searchMode} />
      {!searchMode && state.phase === 'loading' && (
        <DataState kind="loading" title="正在进入晓球" />
      )}
      {!searchMode && state.phase === 'failed' && (
        <DataState
          kind="error"
          title="暂时无法连接赛事数据"
          description={state.message}
          onRetry={() => void load()}
        />
      )}
      {!searchMode && state.phase === 'empty' && (
        <DataState
          kind="empty"
          title="暂无已发布赛事"
          description="当前组织还没有已发布赛事。赛事管理员发布后，赛程和赛事数据会出现在这里。"
          onRetry={() => void load()}
        />
      )}
      {searchMode ? (
        <SearchExperience
          category={searchCategory}
          error={searchError}
          query={searchText}
          result={searchResult}
          searching={searching}
          tournamentId={tournamentId ?? ''}
          onBack={exitSearch}
          onCategoryChange={handleCategoryChange}
          onQueryChange={handleSearchTextChange}
          onSearch={() => void handleSearch()}
        />
      ) : state.phase === 'ready' ? (
        <HomeContent
          composerOpen={composerOpen}
          data={state.data}
          postBody={postBody}
          postImageDataUrl={postImageDataUrl}
          postImageProcessing={postImageProcessing}
          publishing={publishing}
          searchText={searchText}
          onCloseComposer={() => setComposerOpen(false)}
          onLike={(post) => void handleLike(post)}
          onOpenComposer={() => void openComposer()}
          onPostBodyChange={setPostBody}
          onPostImageChange={setPostImageDataUrl}
          onPostImageProcessingChange={setPostImageProcessing}
          onPublish={() => void publishPost()}
          onSearch={() => void handleSearch()}
          onSearchTextChange={handleSearchTextChange}
        />
      ) : null}
      </PublicShell>
  )
}

function CampusBackdrop({ search }: { search: boolean }) {
  return (
    <View
      aria-hidden="true"
      className={`campus-backdrop ${search ? 'campus-backdrop--search' : ''}`}
    >
      <View className="home-page__lineart" />
      <View className="match-ornament match-ornament--floodlight" />
      <View className="match-ornament match-ornament--goal" />
    </View>
  )
}

function HomeSearch({
  placement,
  searchText,
  onSearch,
  onSearchTextChange,
}: {
  placement: 'header' | 'body'
  searchText: string
  onSearch: () => void
  onSearchTextChange: (value: string) => void
}) {
  return (
    <View className={`home-search-entry home-search-entry--${placement}`}>
      {placement === 'header' ? (
        <View aria-hidden="true" className="persistent-header-search__icon" />
      ) : (
        <Text className="home-search-entry__icon">⌕</Text>
      )}
      <Input
        className="home-search-entry__input"
        confirmType="search"
        placeholder="搜索球员、球队、比赛或动态"
        value={searchText}
        onConfirm={onSearch}
        onInput={(event) => onSearchTextChange(event.detail.value)}
      />
      <Button aria-label="搜索" className="home-search-entry__action" onClick={onSearch}>
        搜索
      </Button>
    </View>
  )
}

function HomeContent({
  composerOpen,
  data,
  searchText,
  onLike,
  onSearch,
  onSearchTextChange,
}: {
  composerOpen: boolean
  data: HomeResponse
  postBody: string
  postImageDataUrl: string | null
  postImageProcessing: boolean
  publishing: boolean
  searchText: string
  onCloseComposer: () => void
  onLike: (post: PostSummary) => void
  onOpenComposer: () => void
  onPostBodyChange: (value: string) => void
  onPostImageChange: (value: string | null) => void
  onPostImageProcessingChange: (processing: boolean) => void
  onPublish: () => void
  onSearch: () => void
  onSearchTextChange: (value: string) => void
}) {
  const focusMatches = selectFocusMatches(data.focusMatches)
  // The signed-in account (live) wins over the cached home snapshot's viewer.
  
  const heroAnnouncements = tournamentHeroSlides(data.announcements)
  const platformAnnouncements = data.platformAnnouncements ?? []
  const [heroIndex, setHeroIndex] = useState(0)
  // One-line platform strip: rotate titles every 6 s (paused while the dialog is open).
  const [noticeIndex, setNoticeIndex] = useState(0)
  const [announcementDialog, setAnnouncementDialog] = useState<string | null | undefined>()
  // Two announcements side by side; with more than two, rotate one pair at a time.
  const noticePageCount = Math.max(1, Math.ceil(platformAnnouncements.length / 2))
  const noticeStart = (noticeIndex % noticePageCount) * 2
  const noticePair = platformAnnouncements.slice(noticeStart, noticeStart + 2)
  useEffect(() => {
    if (platformAnnouncements.length < 3 || announcementDialog !== undefined) return
    const timer = setInterval(() => setNoticeIndex((value) => value + 1), 6000)
    return () => clearInterval(timer)
  }, [platformAnnouncements.length, announcementDialog])
  const openAnnouncement = (id: string | null) => {
    if (ANNOUNCEMENTS_DIALOG_SUPPORTED) setAnnouncementDialog(id)
    else if (id) void goToPost(id)
  }
  const heroAnnouncement =
    heroAnnouncements[heroAnnouncements.length > 0 ? heroIndex % heroAnnouncements.length : 0]
  const heroPhotos: HeroPhoto[] = heroAnnouncements.flatMap((announcement) => {
    // Request a sized WebP variant: the hero panel is ~800 CSS px wide on desktop.
    const original = resolveMediaUrl(announcement.imageUrl)
    const src = original
      ? sizedMediaUrl(original, (window.devicePixelRatio || 1) > 1.25 ? 1440 : 960)
      : undefined
    if (!src) return []
    return [{ src, alt: announcement.title?.trim() || '赛事公告' }]
  })
  const linkedHero = heroPhotos.length > 0 && heroPhotos.length === heroAnnouncements.length
  const openHeroAnnouncement = (index = heroIndex) => {
    const announcement =
      heroAnnouncements[heroAnnouncements.length > 0 ? index % heroAnnouncements.length : 0]
    if (announcement) void goToPost(announcement.id)
  }
  const feedColumns = useFeedColumns()
  const renderPost = (post: PostSummary) => (
    <PostCard
      key={post.id}
      post={post}
      variant="home"
      onLike={() => onLike(post)}
      onOpen={() => void goToPost(post.id)}
      {...(post.author.messageable && readSession()
        ? {
            onMessageAuthor: () =>
              openMessaging({
                id: post.author.id,
                displayName: post.author.displayName,
                avatarUrl: post.author.avatarUrl,
              }),
          }
        : {})}
    />
  )
  return (
    // 首页 is the one desktop page that scrolls as a document (no xq-viewport-page).
    <View className="home-page">
      <View className="experience-hero">
        <HomeHeroCopy
          tournament={data.tournament}
          onOpenSchedule={() => void goToSchedule(data.tournament.id)}
        />
        <View className="experience-hero__copy hero-classic">
          <Text className="experience-hero__eyebrow">{data.tournament.name}</Text>
          <Text
            className={`experience-hero__title ${
              (heroAnnouncement?.title?.length ?? data.tournament.name.length) > 20
                ? 'experience-hero__title--long'
                : ''
            }`}
          >
            {heroAnnouncement?.title ?? data.tournament.name}
          </Text>
          <Text className="experience-hero__summary">
            {heroSummary(heroAnnouncement?.body) ?? '校园赛事、球队和绿茵动态，都在这里。'}
          </Text>
          <Button
            className="experience-hero__action"
            onClick={() =>
              heroAnnouncement ? openHeroAnnouncement() : void goToSchedule(data.tournament.id)
            }
          >
            {heroAnnouncement ? '查看公告' : '查看赛程'} <Text>→</Text>
          </Button>
        </View>
        <HeroCarousel
          key={heroAnnouncements.map((announcement) => announcement.id).join(':')}
          {...(linkedHero
            ? {
                photos: heroPhotos,
                onActiveChange: setHeroIndex,
                onSelect: openHeroAnnouncement,
              }
            : {})}
        />
        {heroAnnouncement && (
          <View className="hero-caption" aria-hidden="true">
            <Text className="hero-caption__title">{heroAnnouncement.title || '赛事公告'}</Text>
            <Text className="hero-caption__summary">{oneLine(heroAnnouncement.body ?? '')}</Text>
          </View>
        )}
      </View>

      <HomeSearch
        placement="body"
        searchText={searchText}
        onSearch={onSearch}
        onSearchTextChange={onSearchTextChange}
      />

      <View className="home-product-section">
        <ProductSection
          kicker="MATCH CENTRE"
          title="焦点赛事"
          actionLabel="查看全部"
          onAction={() => void goToSchedule(data.tournament.id)}
        />
        {focusMatches.length > 0 ? (
          <View className={`focus-match-grid focus-match-grid--count-${focusMatches.length}`}>
            {focusMatches.map((match, index) => (
              <CompactMatchCard featured={index === 0} match={match} key={match.id} />
            ))}
          </View>
        ) : (
          <DataState kind="empty" title="暂无焦点赛事" description="完整赛程发布后将在这里展示。" />
        )}
      </View>

      {platformAnnouncements.length > 0 && (
        <View className="notice-rail notice-rail--line">
          <View className="notice-rail__label">
            <Text>官方公告</Text>
            <Text className="notice-rail__label-note">平台</Text>
          </View>
          <View className="notice-rail__pair" key={`pair-${noticeIndex}`}>
            {noticePair.map((announcement) => (
              <Button
                key={announcement.id}
                className="notice-rail__headline"
                onClick={() => openAnnouncement(announcement.id)}
              >
                <Text className="notice-rail__dot" />
                <Text className="notice-rail__title">{announcement.title || '平台公告'}</Text>
                {announcement.body && (
                  <Text className="notice-rail__excerpt">{oneLine(announcement.body)}</Text>
                )}
              </Button>
            ))}
          </View>
          <Button
            className="notice-rail__more"
            onClick={() => openAnnouncement(noticePair[0]?.id ?? null)}
          >
            查看详情 →
          </Button>
        </View>
      )}
      {announcementDialog !== undefined && (
        <AnnouncementsDialog
          announcements={platformAnnouncements}
          initialId={announcementDialog}
          onClose={() => setAnnouncementDialog(undefined)}
          onOpenPost={(postId) => {
            setAnnouncementDialog(undefined)
            void goToPost(postId)
          }}
        />
      )}

      <View className="community-column">
        <ProductSection kicker="CAMPUS FEED" title="绿茵动态" note="全校社区" />
        <View className={`community-feed ${feedColumns > 1 ? 'community-feed--masonry' : ''}`}>
          {data.posts.length > 0 ? (
            feedColumns > 1 ? (
              alternatingColumns(data.posts, feedColumns, (post) =>
                Boolean(post.imageUrl || post.imageUrls?.length),
              ).map((column, columnIndex) => (
                <View className="community-feed__column" key={columnIndex}>
                  {column.map(renderPost)}
                </View>
              ))
            ) : (
              data.posts.map(renderPost)
            )
          ) : (
            <DataState
              kind="empty"
              title="还没有绿茵动态"
              description="登录后可以发布第一条动态。"
            />
          )}
        </View>
      </View>

      {composerOpen &&
        !(
          Taro.getEnv() === Taro.ENV_TYPE.WEB && window.matchMedia('(min-width: 721px)').matches
        ) && (
          null
        )}
    </View>
  )
}

function SearchExperience({
  category,
  error,
  query,
  result,
  searching,
  tournamentId,
  onBack,
  onCategoryChange,
  onQueryChange,
  onSearch,
}: {
  category: SearchCategory
  error: string | null
  query: string
  result: SearchResponse | null
  searching: boolean
  tournamentId: string
  onBack: () => void
  onCategoryChange: (category: SearchCategory) => void
  onQueryChange: (query: string) => void
  onSearch: () => void
}) {
  const desktop =
    Taro.getEnv() === Taro.ENV_TYPE.WEB && window.matchMedia('(min-width: 721px)').matches
  return (
    <View className="search-experience">
      <View className="search-experience__head">
        <IconButton
          icon="back"
          aria-label="退出搜索"
          className="search-experience__back"
          onClick={onBack}
        >
          <Text className="search-experience__mobile-back">←</Text>
        </IconButton>
        <Text className="search-experience__title">全站搜索</Text>
        <Button className="search-experience__exit" onClick={onBack}>
          退出
        </Button>
      </View>
      <View className="search-experience__desktop-bar">
        <PersistentHeaderSearch
          expanded
          query={query}
          searching={searching}
          onQueryChange={onQueryChange}
          onSearch={onSearch}
        />
      </View>
      <View className="search-experience__bar">
        <Input
          focus
          className="search-experience__input"
          confirmType="search"
          placeholder="搜索球员、球队、比赛或动态"
          value={query}
          onConfirm={onSearch}
          onInput={(event) => onQueryChange(event.detail.value)}
        />
        <Button className="search-experience__submit" loading={searching} onClick={onSearch}>
          搜索
        </Button>
      </View>
      <View className="global-search__categories">
        {searchCategories.map((item) => (
          <Button
            className={`search-category ${category === item.key ? 'search-category--active' : ''}`}
            key={item.key}
            onClick={() => onCategoryChange(item.key)}
          >
            {item.label}
          </Button>
        ))}
      </View>
      {searching && <DataState kind="loading" title="正在搜索" />}
      {error && (
        <DataState kind="error" title="搜索暂时不可用" description={error} onRetry={onSearch} />
      )}
      {!error && !result && !searching && (
        <View className="search-experience__empty">
          <Text>输入关键词，查找晓球里的球员、球队、比赛和动态。</Text>
        </View>
      )}
      {!error && result && !searching ? (
        desktop ? (
          <DesktopSearchResults
            result={result}
            category={category}
            onTeam={(id) => void goToTeam(id, tournamentId)}
            onPlayer={(id) => void goToPlayer(id, tournamentId)}
            onMatch={(id) => void goToMatch(id)}
            onPost={(id) => void goToPost(id)}
            onCategory={onCategoryChange}
          />
        ) : (
          <SearchResults result={result} tournamentId={tournamentId} />
        )
      ) : null}
    </View>
  )
}

function CompactMatchCard({ match, featured }: { match: MatchSummary; featured: boolean }) {
  const hasScore = match.homeScore !== null && match.awayScore !== null
  return (
    <Button
      aria-label={`查看${match.title}比赛详情`}
      className={`compact-match ${featured ? 'compact-match--featured' : ''}`}
      onClick={() => void goToMatch(match.id)}
    >
      <View className="compact-match__meta">
        <MatchStatus status={match.status} />
        <View className="compact-match__meta-copy">
          <Text className="compact-match__round">{match.title}</Text>
          <Text className="compact-match__time">
            {formatDate(match.scheduledStartAt)} {formatTime(match.scheduledStartAt)}
          </Text>
        </View>
      </View>
      <View className="compact-match__line">
        <View className="compact-match__side">
          <TeamCrest team={match.homeTeam} size="medium" />
          <TeamName
            className="compact-match__team"
            team={match.homeTeam}
            tournamentId={match.tournamentId}
            fallback="待定"
          />
        </View>
        <Text className="compact-match__score">
          {hasScore ? `${match.homeScore} : ${match.awayScore}` : 'VS'}
        </Text>
        <View className="compact-match__side compact-match__side--away">
          <TeamCrest team={match.awayTeam} size="medium" />
          <TeamName
            className="compact-match__team"
            team={match.awayTeam}
            tournamentId={match.tournamentId}
            fallback="待定"
          />
        </View>
      </View>
      <Text className="compact-match__stage">{match.venue?.name ?? '场地待定'}</Text>
    </Button>
  )
}

function selectFocusMatches(matches: MatchSummary[]): MatchSummary[] {
  const live = matches
    .filter((match) => match.status === 'LIVE')
    .sort(
      (left, right) =>
        upcomingDateValue(left.scheduledStartAt) - upcomingDateValue(right.scheduledStartAt),
    )
  const finished = matches
    .filter((match) => match.status === 'FINISHED')
    .sort((left, right) => dateValue(right.scheduledStartAt) - dateValue(left.scheduledStartAt))
  const upcoming = matches
    .filter((match) => match.status !== 'LIVE' && match.status !== 'FINISHED')
    .sort(
      (left, right) =>
        upcomingDateValue(left.scheduledStartAt) - upcomingDateValue(right.scheduledStartAt),
    )
  const selected = [...live, ...finished.slice(0, 1), ...upcoming].slice(0, 3)
  return selected.length > 0 ? selected : matches.slice(0, 3)
}

function dateValue(value: string | null): number {
  return value ? new Date(value).getTime() : 0
}

function upcomingDateValue(value: string | null): number {
  return value ? new Date(value).getTime() : Number.MAX_SAFE_INTEGER
}

function SearchResults({ result, tournamentId }: { result: SearchResponse; tournamentId: string }) {
  const total =
    result.players.length + result.teams.length + result.matches.length + result.posts.length
  return (
    <View className="search-results">
      <View className="search-results__head">
        <Text>“{result.query}”的搜索结果</Text>
        <Text>{total} 项</Text>
      </View>
      {total === 0 && <Text className="search-results__empty">没有找到相关内容</Text>}
      {result.players.map((player) => (
        <View
          className="search-result-row"
          key={player.id}
          onClick={() => void goToPlayer(player.id, tournamentId)}
        >
          <UserAvatar
            avatarUrl={player.avatarUrl}
            playerId={player.id}
            tournamentId={tournamentId}
            name={player.displayName}
            color={player.profileColor}
            size="small"
          />
          <View className="search-result-row__copy">
            <PersonTrigger
              playerId={player.id}
              tournamentId={tournamentId}
              name={player.displayName}
            >
              <Text>{player.displayName}</Text>
            </PersonTrigger>
            <Text>
              <TeamName team={player.team} tournamentId={tournamentId} fallback="暂无球队" /> · 球员
            </Text>
          </View>
        </View>
      ))}
      {result.teams.map((team) => (
        <View
          className="search-result-row"
          key={team.id}
          onClick={() => void goToTeam(team.id, tournamentId)}
        >
          <TeamCrest team={team} size="small" />
          <View className="search-result-row__copy">
            <TeamName team={team} tournamentId={tournamentId} />
            <Text>{team.collegeName} · 球队</Text>
          </View>
        </View>
      ))}
      {result.matches.map((match) => (
        <View className="search-result-row" key={match.id} onClick={() => void goToMatch(match.id)}>
          <Text className="search-result-row__tag">赛</Text>
          <View className="search-result-row__copy">
            <Text>
              <TeamName team={match.homeTeam} tournamentId={tournamentId} fallback="待定" /> vs{' '}
              <TeamName team={match.awayTeam} tournamentId={tournamentId} fallback="待定" />
            </Text>
            <Text>
              {match.title} · {formatDate(match.scheduledStartAt)}
            </Text>
          </View>
        </View>
      ))}
      {result.posts.map((post) => (
        <View className="search-result-row" key={post.id} onClick={() => void goToPost(post.id)}>
          <Text className="search-result-row__tag">文</Text>
          <View className="search-result-row__copy">
            <Text>{post.title ?? post.body.slice(0, 24)}</Text>
            <Text>
              <PersonTrigger
                userId={post.author.id}
                tournamentId={tournamentId}
                name={post.author.displayName}
              >
                {post.author.displayName}
              </PersonTrigger>{' '}
              · 动态
            </Text>
          </View>
        </View>
      ))}
    </View>
  )
}

async function goToMatch(matchId: string) {
  await openMatch(matchId)
}

async function goToSchedule(tournamentId: string) {
  await Taro.redirectTo({
    url: `/pages/readonly-schedule/index?tournamentId=${encodeURIComponent(tournamentId)}`,
  })
}

async function goToTeam(teamId: string, tournamentId: string) {
  await openTeam(teamId, tournamentId)
}

async function goToPlayer(playerId: string, tournamentId: string) {
  await openPlayer(playerId, tournamentId)
}

async function goToPost(postId: string) {
  await openPost(postId)
}

/** First sentence of an announcement body, so the hero stays to one short line. */
function heroSummary(body?: string | null): string | undefined {
  const text = body?.trim()
  if (!text) return undefined
  const first = text.split(/(?<=[。！？!?])/)[0]!.trim()
  return first.length > 46 ? `${first.slice(0, 44)}…` : first
}

function oneLine(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

/** Desktop H5 feed columns: 3 on wide screens, 2 on narrow desktops, 1 elsewhere. */
function useFeedColumns(): number {
  const read = () => {
    if (Taro.getEnv() !== Taro.ENV_TYPE.WEB) return 1
    if (window.matchMedia('(min-width: 1151px)').matches) return 3
    if (window.matchMedia('(min-width: 721px)').matches) return 2
    return 1
  }
  const [columns, setColumns] = useState(read)
  useEffect(() => {
    if (Taro.getEnv() !== Taro.ENV_TYPE.WEB) return
    const update = () => setColumns(read())
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])
  return columns
}
