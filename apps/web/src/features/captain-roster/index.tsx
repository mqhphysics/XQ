import { leagueShortDate, leagueTime } from '../product/league-time.ts'
import { Button, Input, Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useEffect, useRef, useState } from 'react'
import type {
  CaptainWorkspaceResponse,
  MatchSummary,
  TeamDashboardResponse,
} from '../product/product.types'
import { readSession } from '../product/session'
import { createClientActionId } from '../product/product.repository'
import { DataState } from '../../components/public-ui'
import { ProductSection } from '../../components/product-ui'
import LineupBoard from './lineup-board'
import {
  rosterRepository,
  RosterApiError,
  type RosterCommand,
  type RosterWorkflowView,
} from './roster.repository'
import './roster.scss'

interface Props {
  teamId: string
  tournamentId: string
  captain: CaptainWorkspaceResponse
  roster: TeamDashboardResponse['roster']
  matches: MatchSummary[]
  landscape?: boolean
  compact?: boolean
}
const statuses: Record<string, string> = {
  DRAFT: '草稿',
  SUBMITTED: '等待审核',
  RETURNED: '已退回',
  APPROVED: '已批准，等待锁定',
  LOCKED: '已锁定',
  REOPENED: '已开放补报',
}

export function CaptainRosterWorkflow({
  teamId,
  tournamentId,
  captain,
  roster,
  matches,
  landscape = false,
  compact = false,
}: Props) {
  const session = readSession()
  const players = captain.members.flatMap((member) => {
    if (!member.playerId) return []
    const profile = roster.find((item) => item.id === member.playerId)
    return [
      {
        id: member.playerId,
        displayName: member.displayName,
        avatarUrl: member.avatarUrl,
        shirtNumber: profile?.shirtNumber ?? null,
        position: member.position,
      },
    ]
  })
  return (
    <View className="my-team-section">
      <LineupBoard
        key={`${session?.user.id}:${tournamentId}:${teamId}`}
        players={players}
        lockedPlayers={roster
          .filter(
            (player) => (player as { rosterSource?: string }).rosterSource !== 'TEAM_MEMBERSHIP',
          )
          .map((player) => ({
            id: player.id,
            displayName: player.displayName,
            avatarUrl: player.avatarUrl,
            shirtNumber: player.shirtNumber,
            position: player.position,
          }))}
        matches={matches}
        teamId={teamId}
        tournamentId={tournamentId}
        teamName={captain.team.name}
        landscape={landscape}
        compact={compact}
      />
      <RegistrationEditor
        key={`${session?.user.id}:${tournamentId}:${teamId}`}
        teamId={teamId}
        tournamentId={tournamentId}
      />
    </View>
  )
}

function RegistrationEditor({ teamId, tournamentId }: { teamId: string; tournamentId: string }) {
  const [data, setData] = useState<RosterWorkflowView | null>(null)
  const [entries, setEntries] = useState<RosterCommand['players']>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [expanded, setExpanded] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [pending, setPending] = useState<{ command: RosterCommand; key: string } | null>(null)
  const alive = useRef(true)
  const sending = useRef(false)
  const loadGeneration = useRef(0)
  const load = async () => {
    const generation = ++loadGeneration.current
    setLoading(true)
    try {
      const result = await rosterRepository.read(tournamentId, teamId)
      if (!alive.current || generation !== loadGeneration.current) return
      setData(result)
      setEntries(
        result.players.map((player) => ({
          playerId: player.playerId,
          shirtNumber: player.shirtNumber,
        })),
      )
      setError('')
      setPending(null)
      setDirty(false)
    } catch (reason) {
      if (alive.current && generation === loadGeneration.current) {
        if (reason instanceof RosterApiError && [401, 403].includes(reason.status)) setData(null)
        setError(reason instanceof Error ? reason.message : '赛事名单加载失败')
      }
    } finally {
      if (alive.current && generation === loadGeneration.current) setLoading(false)
    }
  }
  useEffect(() => {
    alive.current = true
    void load()
    return () => {
      alive.current = false
    }
  }, [tournamentId, teamId])
  const editable = Boolean(
    data?.policy &&
    ['DRAFT', 'RETURNED', 'REOPENED'].includes(data.status) &&
    !['WITHDRAWN', 'SUSPENDED'].includes(data.registrationStatus) &&
    !busy &&
    !loading &&
    !pending,
  )
  const refresh = async () => {
    if (busy || pending || loading) return
    if (dirty) {
      const answer = await Taro.showModal({
        title: '重新读取名单',
        content: '将读取服务器最新名单，当前未保存的报名编辑会被替换。',
        confirmText: '重新读取',
      })
      if (!answer.confirm) return
    }
    await load()
  }
  const send = async (action: 'SAVE' | 'SUBMIT', retry = false) => {
    if (!data || sending.current) return
    const request =
      retry && pending
        ? pending
        : {
            command: { action, expectedVersion: data.version, players: entries },
            key: createClientActionId('roster'),
          }
    if (!retry && action === 'SUBMIT') {
      const confirmation = await Taro.showModal({
        title: '提交赛事报名名单',
        content: `将提交 ${entries.length} 名球员供管理员审核。审核期间不能编辑；球场战术草稿不会随名单提交。`,
        confirmText: '提交审核',
      })
      if (!confirmation.confirm || sending.current) return
    }
    sending.current = true
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const result = await rosterRepository.execute(
        tournamentId,
        teamId,
        request.command,
        request.key,
      )
      if (!alive.current) return
      setData(result)
      setEntries(
        result.players.map((player) => ({
          playerId: player.playerId,
          shirtNumber: player.shirtNumber,
        })),
      )
      setPending(null)
      setDirty(false)
      setNotice(
        result.status === 'SUBMITTED'
          ? '报名名单已提交，等待管理员审核。'
          : '报名名单已保存到服务器。',
      )
    } catch (reason) {
      if (!alive.current) return
      setError(reason instanceof Error ? reason.message : '名单保存失败')
      // Unknown outcome: retain the exact command/key, and prevent editing until retry/read.
      if (!(reason instanceof RosterApiError) || reason.status >= 500 || reason.status === 0)
        setPending(request)
      else setPending(null)
    } finally {
      sending.current = false
      if (alive.current) setBusy(false)
    }
  }
  return (
    <View className="captain-registration surface">
      <View className="captain-registration__head">
        <ProductSection
          kicker="TOURNAMENT REGISTRATION"
          title="赛事报名名单"
          note={
            data ? `${statuses[data.status] ?? data.status} · v${data.version}` : '独立于战术草稿'
          }
        />
        <View className="captain-registration__head-buttons">
          <Button disabled={busy || loading || Boolean(pending)} onClick={() => void refresh()}>
            刷新名单
          </Button>
          <Button onClick={() => setExpanded(!expanded)}>
            {expanded ? '收起名单' : '查看与编辑'}
          </Button>
        </View>
      </View>
      {loading && <DataState kind="loading" title="正在读取赛事报名名单" />}
      {error && (
        <View className="captain-registration__error" role="alert">
          <Text>{error}</Text>
          <Button
            disabled={busy}
            onClick={() => {
              if (pending) void send(pending.command.action, true)
              else
                void (async () => {
                  if (dirty) {
                    const answer = await Taro.showModal({
                      title: '重新读取名单',
                      content: '将读取服务器最新名单，当前未保存的报名编辑会被替换。',
                      confirmText: '重新读取',
                    })
                    if (!answer.confirm) return
                  }
                  await load()
                })()
            }}
          >
            {pending ? '用原请求重试' : '重新读取名单'}
          </Button>
        </View>
      )}
      {notice && (
        <View className="captain-registration__notice" role="status">
          <Text>{notice}</Text>
        </View>
      )}
      {data && (
        <View>
          <Text className="captain-registration__note">
            {data.tournamentName}
            {data.lockedSnapshot
              ? ` · 已发布锁定名单 v${data.lockedSnapshot.version}`
              : ' · 尚无锁定名单'}
          </Text>
          {!data.policy && (
            <Text className="captain-registration__note">
              赛事管理员尚未配置人数、资格与期限，报名提交暂不可用。球场战术仍可在本机规划。
            </Text>
          )}
          {data.policy && (
            <Text className="captain-registration__note">
              报名 {data.policy.minPlayers}–{data.policy.maxPlayers} 人 · 截止{' '}
              {`${leagueShortDate(data.policy.submissionDeadline)} ${leagueTime(data.policy.submissionDeadline)}`}
            </Text>
          )}
          {data.decisionReason && (
            <Text className="captain-registration__reason">管理员说明：{data.decisionReason}</Text>
          )}
          {expanded && (
            <View>
              <View className="captain-registration__list">
                {data.availablePlayers.map((player) => {
                  const entry = entries.find((item) => item.playerId === player.playerId)
                  return (
                    <View className="captain-registration__player" key={player.playerId}>
                      <Button
                        disabled={!editable || (!player.eligible && !entry)}
                        aria-pressed={Boolean(entry)}
                        className={entry ? 'is-selected' : ''}
                        onClick={() => {
                          setEntries(
                            entry
                              ? entries.filter((item) => item.playerId !== player.playerId)
                              : [...entries, { playerId: player.playerId, shirtNumber: null }],
                          )
                          setDirty(true)
                        }}
                      >
                        {entry ? '已选' : '加入'}
                      </Button>
                      <View>
                        <Text>{player.displayName}</Text>
                        <Text>
                          {player.eligible ? '已通过赛事资格审核' : '尚未通过赛事资格审核'}
                        </Text>
                      </View>
                      <Input
                        aria-label={`${player.displayName}球衣号码`}
                        disabled={!editable || !entry}
                        maxlength={16}
                        placeholder="号码"
                        value={entry?.shirtNumber ?? ''}
                        onInput={(event) => {
                          setEntries(
                            entries.map((item) =>
                              item.playerId === player.playerId
                                ? { ...item, shirtNumber: event.detail.value }
                                : item,
                            ),
                          )
                          setDirty(true)
                        }}
                      />
                    </View>
                  )
                })}
                {entries
                  .filter(
                    (entry) =>
                      !data.availablePlayers.some((player) => player.playerId === entry.playerId),
                  )
                  .map((entry) => (
                    <View className="captain-registration__player" key={entry.playerId}>
                      <Text>
                        {data.players.find((player) => player.playerId === entry.playerId)
                          ?.displayName ?? '已离队球员'}{' '}
                        · 已不在现役成员中
                      </Text>
                      <Button
                        disabled={!editable}
                        onClick={() => {
                          setEntries(entries.filter((item) => item.playerId !== entry.playerId))
                          setDirty(true)
                        }}
                      >
                        从报名中移除
                      </Button>
                    </View>
                  ))}
              </View>
              {!data.availablePlayers.length && (
                <Text className="captain-registration__note">
                  没有已关联球员档案的现役成员，请先完成成员关联。
                </Text>
              )}
              <View className="captain-registration__actions">
                <Text>
                  已选 {entries.length} 人{dirty ? ' · 未保存' : ''}
                </Text>
                <Button disabled={!editable} loading={busy} onClick={() => void send('SAVE')}>
                  保存报名名单
                </Button>
                <Button
                  className="button--primary"
                  disabled={
                    !editable ||
                    !data.policy ||
                    entries.length < data.policy.minPlayers ||
                    entries.length > data.policy.maxPlayers
                  }
                  onClick={() => void send('SUBMIT')}
                >
                  提交报名名单
                </Button>
              </View>
            </View>
          )}
        </View>
      )}
    </View>
  )
}
