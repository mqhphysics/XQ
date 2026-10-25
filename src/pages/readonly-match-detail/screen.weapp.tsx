import { useNativeRefreshTask } from '../../features/product/native-refresh.weapp'
import {
  NativeContentPager,
  measureNativeContent,
} from '../../components/native-navigation/content-pager.weapp'
import { Button, Image, Text, Video, View } from '@tarojs/components'
import Taro, { getCurrentInstance } from '@tarojs/taro'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { NativeSocialInput } from '../../components/native-social/input.weapp'
import { nativeWriteEnabled } from '../../features/native-social/config.weapp'
import {
  nativeSocialApi,
  readNativeDraft,
  saveNativeDraft,
  clearNativeDraft,
} from '../../features/native-social/runtime.weapp'
import { useNativeLeaveProtection } from '../../features/native-navigation/leave-guard.weapp'
import { PublicShell } from '../../components/public-shell'
import { DataState } from '../../components/public-ui'
import { MatchStatus, TeamCrest, UserAvatar } from '../../components/product-ui'
import { NativeDialog } from '../../components/native-ui/index.weapp'
import { useNativePreferences } from '../../components/native-ui/preferences.weapp'
import {
  productRepository,
  resolveMediaUrl,
  peekNativeProduct,
} from '../../features/product/product.repository'
import { readSession } from '../../features/product/session'
import { eventLabel } from '../../features/product/product.format'
import { openPlayer } from '../../features/product/player-navigation'
import { openTeam } from '../../features/product/team-navigation'
import { nativeMatchMedia, ownMediaImage } from '../../features/managed-media/native-media.weapp'
import type { MediaAsset } from '../../features/managed-media/repository.h5'
import type {
  MatchExperienceResponse,
  TeamSummary,
  PostSummary,
} from '../../features/product/product.types'
import {
  nativeTimeline,
  type NativeMatchEvent,
} from '../../features/readonly-match/match-detail.logic.weapp'
import { minuteLabel } from '../../features/readonly-match/lineup.logic'
import { NativeLineups } from '../../components/native-ui/match-lineups.weapp'
import { NativeMatchIcon } from '../../features/readonly-match/match-icons.weapp'
import { isGoalEventType } from '../../features/readonly-match/match-bulletin.logic'
import { knockoutMatchTime } from '../data-center/knockout-display.logic'
import './index.weapp.scss'
import { openPost } from '../../features/product/post-navigation'
import { formatDate } from '../../features/product/product.format'
import { useNativeRouteState } from '../../features/native-navigation/index.weapp'

type State =
  | { phase: 'loading' }
  | { phase: 'failed'; message: string }
  | { phase: 'ready'; match: MatchExperienceResponse }
export default function NativeMatchScreen({
  matchId: suppliedMatch,
}: { matchId?: string | undefined } = {}) {
  const matchId = suppliedMatch || getCurrentInstance().router?.params.matchId || ''
  const cachedMatch = peekNativeProduct<MatchExperienceResponse>(
    `/public/matches/${encodeURIComponent(matchId)}/experience`,
  )
  const [state, setState] = useNativeRouteState<State>(
    'match-data',
    cachedMatch ? { phase: 'ready', match: cachedMatch } : { phase: 'loading' },
  )
  const load = useCallback(async () => {
    if (!matchId) {
      setState({ phase: 'failed', message: '缺少比赛信息' })
      return
    }
    try {
      setState({ phase: 'ready', match: await productRepository.getMatch(matchId) })
    } catch (issue) {
      setState({
        phase: 'failed',
        message: issue instanceof Error ? issue.message : '比赛读取失败',
      })
    }
  }, [matchId])
  useNativeRefreshTask(load)
  useEffect(() => {
    void load()
  }, [load])
  return (
    <PublicShell
      active="schedule"
      showBack
      {...(state.phase === 'ready' ? { tournamentId: state.match.tournamentId } : {})}
    >
      {state.phase === 'loading' && <DataState kind="loading" title="正在读取比赛" />}
      {state.phase === 'failed' && (
        <DataState
          kind="error"
          title="比赛暂不可用"
          description={state.message}
          onRetry={() => void load()}
        />
      )}
      {state.phase === 'ready' && (
        <NativeMatchContent
          key={state.match.id}
          match={state.match}
          onUpdated={(match) => setState({ phase: 'ready', match })}
        />
      )}
    </PublicShell>
  )
}

function NativeMatchContent({
  match,
  onUpdated,
}: {
  match: MatchExperienceResponse
  onUpdated: (match: MatchExperienceResponse) => void
}) {
  const [tab, setTab] = useNativeRouteState<'events' | 'lineups' | 'ratings'>(
    'match-tab',
    'ratings',
  )
  const scored = match.homeScore !== null && match.awayScore !== null
  return (
    <View className="native-match-detail">
      <View className="native-match-hero">
        <View className="native-match-meta">
          <Text>
            {match.stageName || '赛事'} · {match.roundName || match.title}
          </Text>
          <MatchStatus status={match.status} />
        </View>
        <View className="native-match-scoreboard">
          <TeamSide team={match.homeTeam} tournamentId={match.tournamentId} />
          <View className="native-match-result">
            <Text>
              {scored
                ? `${match.homeScore} : ${match.awayScore}`
                : knockoutMatchTime(match.scheduledStartAt).split(' ')[1] || '待定'}
            </Text>
            {(match.homePenaltyScore !== null || match.awayPenaltyScore !== null) && (
              <Text className="native-match-penalty">
                点球 {match.homePenaltyScore ?? 0} : {match.awayPenaltyScore ?? 0}
              </Text>
            )}
          </View>
          <TeamSide team={match.awayTeam} tournamentId={match.tournamentId} />
        </View>
        <Text className="native-match-kickoff">
          {knockoutMatchTime(match.scheduledStartAt)} · {match.venue?.name || '场地待定'}
        </Text>
        {match.statusReason && <Text className="native-match-reason">{match.statusReason}</Text>}
      </View>
      <View className="native-match-tabs" role="tablist">
        {(
          [
            ['ratings', '比赛评分'],
            ['events', '比赛事件'],
            ['lineups', '首发阵容'],
          ] as const
        ).map(([key, label]) => (
          <Button
            key={key}
            className={tab === key ? 'is-active' : ''}
            aria-selected={tab === key}
            onClick={() => setTab(key)}
          >
            {label}
          </Button>
        ))}
      </View>
      <NativeContentPager
        index={['ratings', 'events', 'lineups'].indexOf(tab)}
        onSelect={(index) => setTab((['ratings', 'events', 'lineups'] as const)[index]!)}
        pages={[
          <NativeRatings match={match} onUpdated={onUpdated} />,
          <NativeEvents match={match} />,
          <NativeLineups match={match} />,
        ]}
      />
    </View>
  )
}
function TeamSide({ team, tournamentId }: { team: TeamSummary | null; tournamentId: string }) {
  return (
    <Button
      className="native-match-team"
      disabled={!team}
      onClick={() => {
        if (team) void openTeam(team.id, tournamentId)
      }}
    >
      <TeamCrest team={team} size="large" interactive={false} />
      <Text>{team?.shortName || team?.name || '待定'}</Text>
    </Button>
  )
}

type Playing = { source: string; title: string; video: boolean } | null
function NativeEvents({ match }: { match: MatchExperienceResponse }) {
  const [media, setMedia] = useState<MediaAsset[]>([]),
    [error, setError] = useState(''),
    [playing, setPlaying] = useState<Playing>(null)
  const { autoplayGif, reduceMotion } = useNativePreferences()
  const rows = useMemo(() => nativeTimeline(match), [match])
  const load = useCallback(() => {
    setError('')
    if (!match.events.length || !readSession()) {
      setMedia([])
      return
    }
    void nativeMatchMedia(match.id)
      .then((data) =>
        setMedia(
          data.items.filter(
            (item) =>
              item.visibility !== 'HIDDEN' &&
              item.visibility !== 'DELETED' &&
              item.associationState !== 'REMOVED_OR_CHANGED',
          ),
        ),
      )
      .catch(() => setError('比赛片段暂未读取，点击重试'))
  }, [match.id, match.events.length])
  useEffect(load, [load])
  useEffect(() => {
    measureNativeContent()
  }, [media, error])
  const play = async (event: NativeMatchEvent, asset: MediaAsset) => {
    try {
      const source =
        asset.status === 'PENDING'
          ? await ownMediaImage(asset.contentUrl)
          : resolveMediaUrl(asset.contentUrl)!
      setPlaying({
        source,
        title: `${minuteLabel(event)} ${eventLabel(event.type)}`,
        video: asset?.mimeType === 'video/mp4',
      })
    } catch (issue) {
      void Taro.showToast({
        title: issue instanceof Error ? issue.message : '片段读取失败',
        icon: 'none',
      })
    }
  }
  return (
    <View className="native-match-events">
      {error && (
        <Button className="native-match-media-error" onClick={load}>
          {error}
        </Button>
      )}
      {!match.events.length && <Text className="native-match-empty">比赛事件尚未公布</Text>}
      {match.events.length > 0 && (
        <View className="native-match-timeline">
          {rows.map((row) => {
            if (row.kind === 'marker')
              return (
                <View className="native-timeline-marker" key={row.id}>
                  <Text>{row.label}</Text>
                </View>
              )
            const first = row.events[0]!,
              asset = media.find((item) => row.events.some((event) => event.id === item.targetId)),
              goal = isGoalEventType(first.type)
            return (
              <View className={`native-timeline-row native-timeline-row--${row.side}`} key={row.id}>
                <Text className="native-timeline-minute">{minuteLabel(first)}</Text>
                <View
                  className={`native-timeline-card${goal ? ' native-timeline-card--goal' : ''}`}
                >
                  {row.events.map((event) => (
                    <View key={event.id}>
                      {event.type === 'SUBSTITUTION' ? (
                        <>
                          <EventPerson
                            event={event}
                            related
                            icon="ON"
                            tournamentId={match.tournamentId}
                          />
                          <EventPerson event={event} icon="OFF" tournamentId={match.tournamentId} />
                        </>
                      ) : (
                        <>
                          <EventPerson
                            event={event}
                            icon={event.type}
                            tournamentId={match.tournamentId}
                          />
                          {event.relatedPlayer && event.type === 'GOAL' && (
                            <EventPerson
                              event={event}
                              related
                              icon="ASSIST"
                              tournamentId={match.tournamentId}
                            />
                          )}
                        </>
                      )}
                      {event.description &&
                        !isGoalEventType(event.type) &&
                        event.type !== 'SUBSTITUTION' && (
                          <Text className="native-event-description">{event.description}</Text>
                        )}
                    </View>
                  ))}
                  {asset && (
                    <Button
                      className="native-event-media"
                      aria-label="播放比赛片段"
                      onClick={() => void play(first, asset)}
                    >
                      {autoplayGif && !reduceMotion && asset?.mimeType !== 'video/mp4' ? (
                        <Image
                          src={resolveMediaUrl(asset.contentUrl)!}
                          mode="aspectFill"
                          lazyLoad
                        />
                      ) : (
                        <Image
                          src={resolveMediaUrl(asset.posterUrl || asset.contentUrl)!}
                          mode="aspectFill"
                          lazyLoad
                        />
                      )}
                      <Text>{asset?.mimeType === 'video/mp4' ? '▶ 视频' : '▶ GIF'}</Text>
                    </Button>
                  )}
                </View>
              </View>
            )
          })}
        </View>
      )}
      {playing && <NativeMatchPlayback playing={playing} onClose={() => setPlaying(null)} />}
    </View>
  )
}
function NativeMatchPlayback({
  playing,
  onClose,
}: {
  playing: NonNullable<Playing>
  onClose: () => void
}) {
  const [phase, setPhase] = useState<'loading' | 'ready' | 'failed'>('loading')
  const [attempt, setAttempt] = useState(0)
  return (
    <NativeDialog title={playing.title} onClose={onClose}>
      {playing.video ? (
        <Video className="native-match-media-player" src={playing.source} controls autoplay />
      ) : (
        <View className="native-match-media-frame">
          <Image
            key={attempt}
            className="native-match-media-player"
            src={playing.source}
            mode="aspectFit"
            onLoad={() => setPhase('ready')}
            onError={() => setPhase('failed')}
          />
          {phase !== 'ready' && (
            <View className="native-match-media-state">
              <Text>{phase === 'loading' ? '正在加载 GIF…' : 'GIF 加载失败'}</Text>
              {phase === 'failed' && (
                <Button
                  className="native-button"
                  onClick={() => {
                    setPhase('loading')
                    setAttempt((value) => value + 1)
                  }}
                >
                  重试
                </Button>
              )}
            </View>
          )}
        </View>
      )}
    </NativeDialog>
  )
}
function EventPerson({
  event,
  related = false,
  icon,
  tournamentId,
}: {
  event: NativeMatchEvent
  related?: boolean
  icon?: string
  tournamentId: string
}) {
  const player = related ? event.relatedPlayer : event.player
  return (
    <Button
      className={`native-event-person${icon === 'OFF' || icon === 'ASSIST' ? ' is-muted' : ''}`}
      disabled={!player}
      onClick={() => {
        if (player) void openPlayer(player.id, tournamentId)
      }}
    >
      <Text>{player?.displayName || '球员待补充'}</Text>
      {icon && <NativeMatchIcon kind={icon} />}
    </Button>
  )
}

function NativeRatings({
  match,
  onUpdated,
}: {
  match: MatchExperienceResponse
  onUpdated: (match: MatchExperienceResponse) => void
}) {
  const [rating, setRating] = useState(0),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('')
  const saved = match.reviews.viewerReview?.rating || 0
  const finished = ['FINISHED', 'CONFIRMED'].includes(match.status)
  const scope = `match-comment:${match.id}`
  const [body, setBody] = useState(() => readNativeDraft(scope, ''))
  const lock = useRef(false)
  const commentsEnabled = nativeWriteEnabled('matchComments')
  useEffect(() => {
    measureNativeContent()
  }, [error])
  const changeBody = (text: string) => {
    setBody(text)
    saveNativeDraft(scope, text)
  }
  const clearBody = () => {
    setBody('')
    clearNativeDraft(scope)
  }
  useNativeLeaveProtection(commentsEnabled && Boolean(body.trim()), busy, clearBody, true)
  const submit = async () => {
    if (!rating || busy || lock.current || saved || !finished) return
    if (!readSession()) {
      void Taro.showToast({ title: '登录后可以评分', icon: 'none' })
      return
    }
    setBusy(true)
    lock.current = true
    setError('')
    try {
      const text = commentsEnabled ? body.trim() : ''
      onUpdated(await productRepository.reviewMatch(match.id, rating, text || undefined))
      if (text) clearBody()
      void Taro.showToast({ title: '评分已保存', icon: 'success' })
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : '评分保存失败')
    } finally {
      setBusy(false)
      lock.current = false
    }
  }
  const comment = async () => {
    if (lock.current || !body.trim() || !finished) return
    lock.current = true
    setBusy(true)
    setError('')
    try {
      onUpdated(
        await nativeSocialApi.commentMatch(
          match.id,
          saved ? undefined : rating || undefined,
          body.trim(),
        ),
      )
      clearBody()
      await Taro.hideKeyboard().catch(() => {})
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : '评论未发出，文字已保留')
    } finally {
      lock.current = false
      setBusy(false)
    }
  }
  return (
    <View className="native-match-ratings">
      {Boolean(match.flashReports?.length) && (
        <View className="native-review-card">
          <Text className="native-match-section-title">比赛快报</Text>
          {match.flashReports!.map((post) => (
            <FlashPreview key={post.id} post={post} />
          ))}
        </View>
      )}
      <View className="native-review-card">
        <View className="native-match-rating-summary">
          <Text>
            {match.reviews.averageRating === null ? '—' : match.reviews.averageRating.toFixed(1)}
          </Text>
          <View>
            <Text>比赛评分</Text>
            <Text>{match.reviews.ratingCount} 人评分</Text>
          </View>
        </View>
        {Boolean(saved) &&
          (match.reviews.ratingDistribution || []).map((item) => (
            <View className="native-rating-distribution" key={item.rating}>
              <Text>{item.rating} 星</Text>
              <View className="native-rating-track">
                <View
                  style={`width:${match.reviews.ratingCount ? (item.count / match.reviews.ratingCount) * 100 : 0}%;`}
                />
              </View>
              <Text>{item.count}</Text>
            </View>
          ))}
        <Text className="native-match-section-title">{saved ? '我的评分' : '为这场比赛评分'}</Text>
        <View className="native-rating-stars" role="group" aria-label="1至5星评分">
          {[1, 2, 3, 4, 5].map((value) => (
            <Button
              key={value}
              disabled={Boolean(saved) || !finished || busy}
              className={(saved || rating) >= value ? 'is-selected' : ''}
              aria-label={`${value}星`}
              aria-pressed={(saved || rating) === value}
              onClick={() => setRating(value)}
            >
              ★
            </Button>
          ))}
        </View>
        {error && <Text className="native-error">{error}</Text>}
        {saved ? (
          <Text className="native-note">已评分 {saved} 星</Text>
        ) : finished ? (
          <Button
            className="native-button native-button--primary"
            disabled={!rating || busy}
            loading={busy}
            onClick={() => void submit()}
          >
            确认评分
          </Button>
        ) : (
          <Text className="native-note">比赛结束后可以评分</Text>
        )}
      </View>
      <View className="native-review-card">
        <Text className="native-match-section-title">评论</Text>
        {commentsEnabled && finished && readSession() && (
          <NativeSocialInput
            value={body}
            onChange={changeBody}
            onSend={() => void comment()}
            maximum={500}
            busy={busy}
            label="发表评论"
            placeholder={!saved && rating ? '写评论，也可以随评分一起提交…' : '聊聊这场比赛…'}
          />
        )}
        {match.reviews.comments.length ? (
          match.reviews.comments.map((comment) => (
            <View className="native-review-comment" key={comment.id}>
              <View className="native-review-comment__author">
                <UserAvatar
                  name={comment.author.displayName}
                  avatarUrl={comment.author.avatarUrl}
                  size="small"
                />
                <Text>{comment.author.displayName}</Text>
                <Text className="native-review-comment__stars" aria-label={`${comment.rating}星`}>
                  {'★'.repeat(Math.max(0, Math.min(5, Math.round(comment.rating))))}
                </Text>
              </View>
              <Text className="native-review-comment__body">{comment.body}</Text>
              <Text className="native-note">{formatDate(comment.createdAt)}</Text>
            </View>
          ))
        ) : (
          <Text className="native-note">暂无评论</Text>
        )}
      </View>
    </View>
  )
}
function FlashPreview({ post }: { post: PostSummary }) {
  const [failed, setFailed] = useState(false)
  const cover = [...(post.imageUrls || []), post.imageUrl].find(
    (url) => url && !url.includes('/demo/album:'),
  )
  const image = !failed ? resolveMediaUrl(cover) : undefined
  return (
    <Button className="native-match-flash" onClick={() => void openPost(post.id)}>
      {image && <Image mode="aspectFill" src={image} onError={() => setFailed(true)} />}
      <Text>{post.title || '比赛快报'}</Text>
    </Button>
  )
}
