import { Button, Text, Textarea, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useEffect, useRef, useState } from 'react'
import { ProductSection } from '../../components/product-ui'
import { DataState } from '../../components/public-ui'
import { createClientActionId } from '../product/product.repository'
import { rosterRepository, RosterApiError, type RosterWorkflowView } from './roster.repository'
import './roster.scss'

type ReviewAction = 'RETURN' | 'APPROVE' | 'LOCK' | 'REOPEN'
type Command = { action: ReviewAction; expectedVersion: number; reason?: string }
const statusNames: Record<string, string> = {
  DRAFT: '队长草稿',
  SUBMITTED: '等待审核',
  RETURNED: '已退回',
  APPROVED: '已批准，等待锁定',
  LOCKED: '已锁定',
  REOPENED: '已开放补报',
}
export function RosterReviewWorkspace({
  tournamentId,
  teamId,
}: {
  tournamentId: string
  teamId: string
}) {
  const [data, setData] = useState<RosterWorkflowView | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [reason, setReason] = useState('')
  const [pending, setPending] = useState<{ command: Command; key: string } | null>(null)
  const alive = useRef(true),
    sending = useRef(false)
  const load = async () => {
    setLoading(true)
    try {
      const result = await rosterRepository.read(tournamentId, teamId)
      if (alive.current) {
        setData(result)
        setError('')
        setPending(null)
      }
    } catch (failure) {
      if (alive.current) {
        setError(failure instanceof Error ? failure.message : '名单读取失败')
        if (failure instanceof RosterApiError && [401, 403].includes(failure.status)) setData(null)
      }
    } finally {
      if (alive.current) setLoading(false)
    }
  }
  useEffect(() => {
    alive.current = true
    void load()
    return () => {
      alive.current = false
    }
  }, [teamId, tournamentId])
  const send = async (action: ReviewAction, retry = false) => {
    if (!data || sending.current || loading) return
    const request =
      retry && pending
        ? pending
        : {
            command: {
              action,
              expectedVersion: data.version,
              ...(reason.trim() ? { reason: reason.trim() } : {}),
            },
            key: createClientActionId('roster-review'),
          }
    sending.current = true
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const result = await rosterRepository.review(
        tournamentId,
        teamId,
        request.command,
        request.key,
      )
      if (alive.current) {
        setData(result)
        setPending(null)
        setReason('')
        setNotice(
          `${statusNames[result.status] ?? result.status} · v${result.version}，站内通知已发送。`,
        )
      }
    } catch (failure) {
      if (alive.current) {
        setError(failure instanceof Error ? failure.message : '审核失败')
        if (!(failure instanceof RosterApiError) || failure.status >= 500 || failure.status === 0)
          setPending(request)
        else setPending(null)
      }
    } finally {
      sending.current = false
      if (alive.current) setBusy(false)
    }
  }
  const canUse = !loading && !busy && !pending && Boolean(data?.policy)
  return (
    <View className="captain-review surface">
      <View className="captain-review__head">
        <ProductSection
          kicker="ROSTER REVIEW"
          title="赛事名单审核"
          note={data ? `${data.tournamentName} · ${data.teamName}` : '仅本赛事获授权管理员可审核'}
        />
        <View>
          <Button disabled={busy || Boolean(pending)} onClick={() => void load()}>
            刷新审核名单
          </Button>
          <Button onClick={() => void Taro.reLaunch({ url: '/pages/me/index' })}>返回我的</Button>
        </View>
      </View>
      {loading && <DataState kind="loading" title="正在读取授权名单" />}
      {error && (
        <View className="captain-registration__error" role="alert">
          <Text>{error}</Text>
          {pending && (
            <Button disabled={busy} onClick={() => void send(pending.command.action, true)}>
              用原审核请求重试
            </Button>
          )}
        </View>
      )}
      {notice && (
        <View className="captain-registration__notice" role="status">
          <Text>{notice}</Text>
        </View>
      )}
      {data && (
        <View>
          <Text className="captain-review__status">
            {statusNames[data.status] ?? data.status} · v{data.version} · {data.players.length} 人
            {data.lockedSnapshot ? ` · 已发布名单 v${data.lockedSnapshot.version}` : ''}
          </Text>
          <Text className="captain-registration__note">
            审核当前提交版本；锁定后保留原快照，补报只生成新版本。
          </Text>
          {!data.policy && (
            <Text className="captain-registration__reason">
              赛事尚未配置名单资格、人数和期限，请先完成规程配置。
            </Text>
          )}
          {data.decisionReason && (
            <Text className="captain-registration__reason">
              上次审核说明：{data.decisionReason}
            </Text>
          )}
          <View className="captain-review__players">
            {data.players.map((player) => (
              <View key={player.playerId}>
                <Text>{player.shirtNumber ?? '—'}</Text>
                <Text>{player.displayName}</Text>
              </View>
            ))}
            {!data.players.length && (
              <Text className="captain-registration__note">队长尚未选择报名球员。</Text>
            )}
          </View>
          <Text className="captain-registration__note">
            退回或开放补报请填写原因；队长会收到这段说明。
          </Text>
          <Textarea
            aria-label="名单审核原因"
            className="captain-review__reason"
            maxlength={500}
            value={reason}
            disabled={busy || Boolean(pending)}
            placeholder="填写需要队长修订的内容或补报原因"
            onInput={(event) => setReason(event.detail.value)}
          />
          <View className="captain-review__actions">
            <Button
              disabled={
                !canUse || !['SUBMITTED', 'APPROVED'].includes(data.status) || !reason.trim()
              }
              onClick={() => void send('RETURN')}
            >
              退回名单
            </Button>
            <Button
              disabled={!canUse || data.status !== 'SUBMITTED'}
              onClick={() => void send('APPROVE')}
            >
              批准名单
            </Button>
            <Button
              disabled={!canUse || data.status !== 'APPROVED'}
              onClick={() => void send('LOCK')}
            >
              锁定名单
            </Button>
            <Button
              disabled={!canUse || data.status !== 'LOCKED' || !reason.trim()}
              onClick={() => void send('REOPEN')}
            >
              开放补报
            </Button>
          </View>
        </View>
      )}
    </View>
  )
}
