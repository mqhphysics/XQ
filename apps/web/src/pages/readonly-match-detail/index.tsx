import { WebMatchCheckin } from '../../features/readonly-match/checkin.h5'
import { Button, Text, Textarea, View } from '@tarojs/components'
import { MatchCorrectionButton } from '../../components/campus-context/correction-button'
import Taro, { getCurrentInstance } from '@tarojs/taro'
import { openTeam } from '../../features/product/team-navigation'
import { useCallback, useEffect, useState } from 'react'

import { PublicShell } from '../../components/public-shell'
import { PersonTrigger } from '../../components/person-trigger'
import { DataState } from '../../components/public-ui'
import { MatchStatus, ProductSection, TeamCrest, UserAvatar } from '../../components/product-ui'

import { ReportModal } from '../../components/report-modal'
import { eventLabel, formatLongDate, formatTime, positionLabel } from '../../features/product/product.format'
import { peekProduct, productRepository } from '../../features/product/product.repository'
import { openPlayer } from '../../features/product/player-navigation'
import { readSession } from '../../features/product/session'
import { MatchReportEntry } from '../../features/match-report/MatchReportEntry'
import { useDetailBack } from '../readonly-schedule/detail-back'
import type { MatchExperienceResponse } from '../../features/product/product.types'

import './index.scss'

type PageState =
  | { phase: 'loading' }
  | { phase: 'failed'; message: string }
  | { phase: 'ready'; match: MatchExperienceResponse }

type DetailTab = 'ratings' | 'events' | 'lineups'

export default function MatchDetailPage() {
  const matchId = getCurrentInstance().router?.params.matchId ?? ''
  const routeTournamentId =
    Taro.getEnv() === Taro.ENV_TYPE.WEB
      ? getCurrentInstance().router?.params.tournamentId
      : undefined
  const [state, setState] = useState<PageState>(() => {
    const cached = matchId
      ? peekProduct<MatchExperienceResponse>(
          `/public/matches/${encodeURIComponent(matchId)}/experience`,
        )
      : undefined
    return cached ? { phase: 'ready', match: cached } : { phase: 'loading' }
  })
  const tournamentId = state.phase === 'ready' ? state.match.tournamentId : routeTournamentId
  useDetailBack(
    `/pages/readonly-schedule/index${tournamentId ? `?tournamentId=${encodeURIComponent(tournamentId)}` : ''}`,
  )

  const load = useCallback(async () => {
    if (!matchId) {
      setState({ phase: 'failed', message: '缺少比赛参数。' })
      return
    }
    if (
      !peekProduct<MatchExperienceResponse>(
        `/public/matches/${encodeURIComponent(matchId)}/experience`,
      )
    )
      setState({ phase: 'loading' })
    try {
      setState({ phase: 'ready', match: await productRepository.getMatch(matchId) })
    } catch (error) {
      setState({
        phase: 'failed',
        message: error instanceof Error ? error.message : '比赛详情加载失败。',
      })
    }
  }, [matchId])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <PublicShell active="schedule" showBack tournamentId={tournamentId}>
      {state.phase === 'loading' && <DataState kind="loading" title="正在读取比赛详情" />}
      {state.phase === 'failed' && (
        <DataState
          kind="error"
          title="比赛详情不可用"
          description={state.message}
          onRetry={() => void load()}
        />
      )}
      {state.phase === 'ready' && (
        <MatchContent
          match={state.match}
          onMatchUpdated={(match) => setState({ phase: 'ready', match })}
        />
      )}
    </PublicShell>
  )
}

function MatchContent({
  match,
  onMatchUpdated,
}: {
  match: MatchExperienceResponse
  onMatchUpdated: (match: MatchExperienceResponse) => void
}) {
  const [activeTab, setActiveTab] = useState<DetailTab>('ratings')
  const [lineupTeamId, setLineupTeamId] = useState(match.lineups[0]?.team.id ?? '')
  const [rating, setRating] = useState(match.reviews.viewerReview?.rating ?? 0)
  const [reviewBody, setReviewBody] = useState(match.reviews.viewerReview?.body ?? '')
  const [submitting, setSubmitting] = useState(false)
  const hasScore = match.homeScore !== null && match.awayScore !== null
  const isFinished = match.status === 'FINISHED' || match.status === 'CONFIRMED'
  const selectedLineup =
    match.lineups.find((lineup) => lineup.team.id === lineupTeamId) ?? match.lineups[0]

  useEffect(() => {
    setRating(match.reviews.viewerReview?.rating ?? 0)
    setReviewBody(match.reviews.viewerReview?.body ?? '')
    setLineupTeamId(match.lineups[0]?.team.id ?? '')
  }, [match.id, match.reviews.viewerReview, match.lineups])

  const submitReview = async () => {
    if (!isFinished || submitting) return
    if (!readSession()) {
      await Taro.showToast({ title: '登录后可以评分', icon: 'none' })
      await Taro.reLaunch({ url: '/pages/login/index' })
      return
    }
    if (rating < 1) {
      await Taro.showToast({ title: '请先选择 1 至 5 星', icon: 'none' })
      return
    }
    setSubmitting(true)
    try {
      const updated = await productRepository.reviewMatch(match.id, rating, reviewBody)
      onMatchUpdated(updated)
      await Taro.showToast({ title: '评分已保存', icon: 'success' })
    } catch (error) {
      await Taro.showToast({
        title: error instanceof Error ? error.message : '评分提交失败',
        icon: 'none',
      })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <View>
      <View className="experience-match-header">
        <View className="experience-match-header__meta">
          <Text>
            {match.stageName ?? '赛事'} · {match.roundName ?? match.title}
          </Text>
          <MatchStatus status={match.status} />
        </View>
        <Text className="experience-match-header__date">
          {formatLongDate(match.scheduledStartAt)} {formatTime(match.scheduledStartAt)}
        </Text>
        <Text className="experience-match-header__venue">{match.venue?.name ?? '场地待定'}</Text>

        <View className="experience-scoreboard">
          <TeamSide
            team={match.homeTeam}
            placeholder={match.homePlaceholder}
            tournamentId={match.tournamentId}
          />
          <View className="experience-scoreboard__score">
            <Text>{hasScore ? `${match.homeScore} : ${match.awayScore}` : 'VS'}</Text>
            {(match.homePenaltyScore !== null || match.awayPenaltyScore !== null) && (
              <Text>
                点球 {match.homePenaltyScore ?? 0} : {match.awayPenaltyScore ?? 0}
              </Text>
            )}
          </View>
          <TeamSide
            team={match.awayTeam}
            placeholder={match.awayPlaceholder}
            tournamentId={match.tournamentId}
          />
        </View>
      </View>

      <MatchReportEntry matchId={match.id} />
      <MatchCorrectionButton matchId={match.id} />

      {(match.summary || match.statusReason) && (
        <View className="match-summary surface">
          <Text className="match-summary__label">
            {match.statusReason ? '比赛说明' : '比赛战报'}
          </Text>
          <Text className="match-summary__body">{match.statusReason ?? match.summary}</Text>
          {match.attendance !== null && (
            <Text className="match-summary__attendance">现场观众 {match.attendance} 人</Text>
          )}
        </View>
      )}

      <View className="match-detail-tabs">
        <TabButton
          active={activeTab === 'ratings'}
          label="评分与评论"
          note={match.reviews.ratingCount > 0 ? String(match.reviews.ratingCount) : undefined}
          onClick={() => setActiveTab('ratings')}
        />
        <TabButton
          active={activeTab === 'events'}
          label="比赛事件"
          note={match.events.length > 0 ? String(match.events.length) : undefined}
          onClick={() => setActiveTab('events')}
        />
        <TabButton
          active={activeTab === 'lineups'}
          label="双方阵容"
          onClick={() => setActiveTab('lineups')}
        />
      </View>

      {activeTab === 'ratings' && (
        <RatingsPanel
          body={reviewBody}
          isFinished={isFinished}
          match={match}
          rating={rating}
          submitting={submitting}
          onBodyChange={setReviewBody}
          onRatingChange={setRating}
          onSubmit={() => void submitReview()}
        />
      )}

      {activeTab === 'events' && (
        <View className="match-tab-content">
          <ProductSection kicker="TIMELINE" title="比赛事件" note={`${match.events.length} 条`} />
          {match.events.length === 0 ? (
            <DataState kind="empty" title="暂无比赛事件" />
          ) : (
            <View className="event-timeline surface">
              {match.events.map((event) => (
                <View
                  className={`event-row ${event.team.id === match.homeTeam?.id ? 'event-row--home' : 'event-row--away'}`}
                  key={event.id}
                >
                  <Text className="event-row__minute">
                    {event.minute}
                    {event.stoppageMinute ? `+${event.stoppageMinute}` : ''}'
                  </Text>
                  <Text className={`event-row__type event-row__type--${event.type.toLowerCase()}`}>
                    {eventLabel(event.type)}
                  </Text>
                  <View className="event-row__copy">
                    <PersonTrigger playerId={event.player?.id} tournamentId={match.tournamentId} name={event.player?.displayName ?? event.team.shortName}><Text>{event.player?.displayName ?? event.team.shortName}</Text></PersonTrigger>
                    <Text>
                      {event.relatedPlayer
                        ? <>助攻 <PersonTrigger playerId={event.relatedPlayer.id} tournamentId={match.tournamentId} name={event.relatedPlayer.displayName}>{event.relatedPlayer.displayName}</PersonTrigger></>
                        : (event.description ?? event.team.name)}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          )}
        </View>
      )}

      {activeTab === 'lineups' && (
        <View className="match-tab-content">
          <ProductSection
            kicker="LINEUPS"
            title="双方阵容"
            note={match.lineups.length > 0 ? '公开出场名单' : '待公布'}
          />
          {match.lineups.length === 0 ? (
            <DataState kind="empty" title="阵容尚未公布" />
          ) : (
            <View className="lineup-panel surface">
              <View className="lineup-tabs">
                {match.lineups.map((lineup) => (
                  <Button
                    className={lineupTeamId === lineup.team.id ? 'lineup-tab--active' : ''}
                    key={lineup.team.id}
                    onClick={() => setLineupTeamId(lineup.team.id)}
                  >
                    {lineup.team.shortName}
                  </Button>
                ))}
              </View>
              <View className="lineup-list">
                {selectedLineup?.players.map((player) => (
                  <View
                    className="lineup-player"
                    key={player.id}
                    onClick={() =>
                      void openPlayer(player.id, match.tournamentId)
                    }
                  >
                    <Text className="lineup-player__number">{player.shirtNumber ?? '-'}</Text>
                    <UserAvatar name={player.displayName} playerId={player.id} tournamentId={match.tournamentId} size="small" />
                    <View className="lineup-player__copy">
                      <PersonTrigger playerId={player.id} tournamentId={match.tournamentId} name={player.displayName}><Text>{player.displayName}</Text></PersonTrigger>
                      <Text>
                        {positionLabel(player.position)} · {player.starter ? '首发' : '替补'}
                      </Text>
                    </View>
                    <Text className="lineup-player__minutes">{player.minutesPlayed}'</Text>
                  </View>
                ))}
              </View>
            </View>
          )}
        </View>
      )}
    </View>
  )
}

function RatingsPanel({
  match,
  rating,
  body,
  isFinished,
  submitting,
  onRatingChange,
  onBodyChange,
  onSubmit,
}: {
  match: MatchExperienceResponse
  rating: number
  body: string
  isFinished: boolean
  submitting: boolean
  onRatingChange: (rating: number) => void
  onBodyChange: (body: string) => void
  onSubmit: () => void
}) {
  const session = readSession()
  const [reportId, setReportId] = useState<string | null>(null)
  return (
    <View className="ratings-layout match-tab-content">
      <View className="rating-overview surface">
        <View className="rating-overview__score">
          <Text>{match.reviews.averageRating?.toFixed(1) ?? '-'}</Text>
          <Text>{renderStars(Math.round(match.reviews.averageRating ?? 0))}</Text>
          <Text>{match.reviews.ratingCount} 人评分</Text>
        </View>
        <View className="rating-form">
          <Text className="rating-form__title">
            {!isFinished
              ? '赛后开放评分'
              : session
                ? match.reviews.viewerReview
                  ? '更新我的评分'
                  : '为这场比赛评分'
                : '登录后参与评分'}
          </Text>
          <View className="rating-stars" aria-label="选择星级">
            {[1, 2, 3, 4, 5].map((value) => (
              <Button
                aria-label={`${value} 星`}
                className={value <= rating ? 'rating-star rating-star--active' : 'rating-star'}
                disabled={!isFinished}
                key={value}
                onClick={() => onRatingChange(value)}
              >
                ★
              </Button>
            ))}
          </View>
          <Textarea
            className="rating-form__textarea"
            disabled={!isFinished}
            maxlength={500}
            placeholder={
              isFinished ? '说说这场比赛的节奏、表现或现场体验（可选）' : '比赛结束后可评论'
            }
            value={body}
            onInput={(event) => onBodyChange(event.detail.value)}
          />
          <Button
            className="button button--primary rating-form__submit"
            disabled={!isFinished || rating < 1 || submitting}
            loading={submitting}
            onClick={onSubmit}
          >
            {session ? '保存评分' : '登录后评分'}
          </Button>
        </View>
      </View>

      <WebMatchCheckin matchId={match.id} />
      {reportId && (
        <ReportModal
          targetId={reportId}
          targetType="MATCH_REVIEW"
          title="投诉这条观赛评论"
          onClose={() => setReportId(null)}
        />
      )}
    </View>
  )
}

function TabButton({
  label,
  note,
  active,
  onClick,
}: {
  label: string
  note?: string | undefined
  active: boolean
  onClick: () => void
}) {
  return (
    <Button
      className={active ? 'match-detail-tab match-detail-tab--active' : 'match-detail-tab'}
      onClick={onClick}
    >
      <Text>{label}</Text>
      {note && <Text>{note}</Text>}
    </Button>
  )
}

function renderStars(value: number): string {
  return `${'★'.repeat(Math.max(0, Math.min(5, value)))}${'☆'.repeat(Math.max(0, 5 - value))}`
}

function TeamSide({
  team,
  placeholder,
  tournamentId,
}: {
  team: MatchExperienceResponse['homeTeam']
  placeholder: string | null | undefined
  tournamentId: string
}) {
  return (
    <View
      className={`experience-scoreboard__team ${team ? 'experience-scoreboard__team--linked' : ''}`}
      onClick={() =>
        team &&
        void openTeam(team.id, tournamentId)
      }
    >
      <TeamCrest team={team} size="large" />
      <Text>{team?.name ?? placeholder ?? '席位待定'}</Text>
    </View>
  )
}
