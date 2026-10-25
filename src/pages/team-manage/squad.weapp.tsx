import { Button, Input, Picker, Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useEffect, useState } from 'react'
import { UserAvatar } from '../../components/product-ui'
import { NativeDialog } from '../../components/native-ui/index.weapp'
import type { CaptainWorkspaceResponse } from '../../features/product/product.types'
import { productRepository, createClientActionId } from '../../features/product/product.repository'
import { formatDate, formatTime, positionLabel } from '../../features/product/product.format.weapp'
import {
  rosterRepository,
  type RosterWorkflowView,
} from '../../features/captain-roster/roster.repository'
import { teamManagementRepository } from '../../features/captain-roster/team-management.repository'
import { useNativeLeaveProtection } from '../../features/native-navigation/leave-guard.weapp'
import { PlayerTrigger } from '../../components/player-trigger'

const statuses: Record<string, string> = {
  DRAFT: '草稿',
  SUBMITTED: '等待审核',
  RETURNED: '已退回',
  APPROVED: '已批准，等待锁定',
  LOCKED: '已锁定',
  REOPENED: '已开放补报',
}
const positions = ['GOALKEEPER', 'DEFENDER', 'MIDFIELDER', 'FORWARD']
type Member = CaptainWorkspaceResponse['members'][number]
export function NativeManageSquad({
  workspace,
  tournamentId,
  roster,
  rosterError,
  onWorkspace,
  onRoster,
  onReload,
}: {
  workspace: CaptainWorkspaceResponse
  tournamentId: string
  roster: RosterWorkflowView | null
  rosterError: string
  onWorkspace: (next: CaptainWorkspaceResponse) => void
  onRoster: (next: RosterWorkflowView) => void
  onReload: () => void
}) {
  const [entries, setEntries] = useState<Record<string, string>>({}),
    [dirty, setDirty] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('')
  const [member, setMember] = useState<Member | null>(null)
  const available = roster?.availablePlayers || []
  const listed = new Set(available.map((p) => p.playerId))
  const rows = [
    ...available.map((p) => ({
      ...p,
      key: p.playerId,
      member: workspace.members.find((m) => m.playerId === p.playerId),
    })),
    ...workspace.members
      .filter((m) => !m.playerId || !listed.has(m.playerId))
      .map((m) => ({
        key: `member:${m.id}`,
        playerId: m.playerId,
        displayName: m.displayName,
        avatarUrl: m.avatarUrl,
        position: m.position,
        eligible: false,
        member: m,
      })),
  ]
  const resetEntries = () => {
    setEntries(
      Object.fromEntries((roster?.players || []).map((p) => [p.playerId, p.shirtNumber || ''])),
    )
    setDirty(false)
    setError('')
  }
  useEffect(resetEntries, [roster])
  useNativeLeaveProtection(dirty, busy, resetEntries)
  const editable = !!roster?.policy && ['DRAFT', 'RETURNED', 'REOPENED'].includes(roster.status)
  const send = async (action: 'SAVE' | 'SUBMIT') => {
    if (!roster || busy || !editable) return
    const players = Object.entries(entries).map(([playerId, shirtNumber]) => ({
      playerId,
      shirtNumber: shirtNumber.trim() || null,
    }))
    const numbers = players.flatMap((p) => (p.shirtNumber ? [Number(p.shirtNumber)] : []))
    if (new Set(numbers).size !== numbers.length) {
      setError('球衣号码不能重复')
      return
    }
    if (action === 'SUBMIT') {
      if (players.some((p) => !p.shirtNumber)) {
        setError('请填写所选球员的球衣号码')
        return
      }
      if (
        roster.policy &&
        (players.length < roster.policy.minPlayers || players.length > roster.policy.maxPlayers)
      ) {
        setError(`名单人数应为 ${roster.policy.minPlayers}—${roster.policy.maxPlayers} 人`)
        return
      }
      if (
        !(
          await Taro.showModal({
            title: '提交大名单',
            content: `共 ${players.length} 人，提交后等待赛事管理员审核。`,
            confirmText: '提交审核',
          })
        ).confirm
      )
        return
    }
    setBusy(true)
    setError('')
    try {
      onRoster(
        await rosterRepository.execute(
          roster.tournamentId,
          workspace.team.id,
          { action, expectedVersion: roster.version, players },
          createClientActionId('roster'),
        ),
      )
      setDirty(false)
      void Taro.showToast({
        title: action === 'SAVE' ? '名单已保存' : '已提交审核',
        icon: 'success',
      })
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : '名单保存失败')
    } finally {
      setBusy(false)
    }
  }
  const review = async (id: string, decision: 'APPROVED' | 'REJECTED') => {
    if (busy) return
    if (
      !(
        await Taro.showModal({
          title: decision === 'APPROVED' ? '批准加入球队' : '拒绝入队申请',
          content: '确认处理这份申请？',
        })
      ).confirm
    )
      return
    setBusy(true)
    setError('')
    try {
      onWorkspace(await productRepository.reviewTeamApplication(workspace.team.id, id, decision))
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : '申请处理失败')
    } finally {
      setBusy(false)
    }
  }
  return (
    <>
      {error && <Text className="native-error">{error}</Text>}
      <View className="native-manage-card">
        <Text className="native-manage-title">
          大名单 ·{' '}
          {roster ? statuses[roster.status] || roster.status : `${workspace.members.length} 名成员`}
        </Text>
        {rosterError && (
          <>
            <Text className="native-error">{rosterError}</Text>
            <Button className="native-button" onClick={onReload}>
              重新读取
            </Button>
          </>
        )}
        {roster && (
          <>
            <Text className="native-note">
              {roster.tournamentName} · 已选 {Object.keys(entries).length} 人
            </Text>
            {roster.policy && (
              <Text className="native-note">
                {roster.policy.minPlayers}—{roster.policy.maxPlayers} 人 · 截止{' '}
                {formatDate(roster.policy.submissionDeadline)}{' '}
                {formatTime(roster.policy.submissionDeadline)}
              </Text>
            )}
            {roster.decisionReason && <Text className="native-error">{roster.decisionReason}</Text>}
          </>
        )}
        {rows.map((p) => {
          const selected = !!p.playerId && p.playerId in entries
          const identity = (
            <>
              <UserAvatar avatarUrl={p.avatarUrl} name={p.displayName} size="small" />
              <View className="native-manage-person__copy">
                <Text>{p.displayName}</Text>
                <Text className="native-note">
                  {positionLabel(p.position)}
                  {p.member?.isCaptain ? ' · 队长' : ''}
                  {roster && !p.eligible ? ' · 暂不符合报名资格' : ''}
                </Text>
              </View>
            </>
          )
          return (
            <View className="native-manage-person" key={p.key}>
              {roster && p.playerId && (
                <>
                  <Button
                    aria-label={`${selected ? '移出' : '加入'}大名单 ${p.displayName}`}
                    aria-pressed={selected}
                    disabled={!editable || busy || (!p.eligible && !selected)}
                    className={`native-manage-check${selected ? ' is-selected' : ''}`}
                    onClick={() => {
                      setEntries((previous) => {
                        const next = { ...previous }
                        if (selected) delete next[p.playerId!]
                        else next[p.playerId!] = ''
                        return next
                      })
                      setDirty(true)
                    }}
                  >
                    {selected ? '●' : '○'}
                  </Button>
                </>
              )}
              <View className="native-manage-person__identity">
                {p.playerId ? (
                  <PlayerTrigger
                    playerId={p.playerId}
                    tournamentId={tournamentId}
                    name={p.displayName}
                  >
                    {identity}
                  </PlayerTrigger>
                ) : (
                  identity
                )}
              </View>
              {selected && (
                <Input
                  className="native-field"
                  type="number"
                  maxlength={2}
                  disabled={!editable || busy}
                  placeholder="号码"
                  value={entries[p.playerId!] || ''}
                  onInput={(e) => {
                    setEntries({
                      ...entries,
                      [p.playerId!]: e.detail.value.replace(/\D/g, '').slice(0, 2),
                    })
                    setDirty(true)
                  }}
                />
              )}
              {p.member && (
                <Button
                  className="native-button native-manage-person__action"
                  disabled={busy}
                  onClick={() => setMember(p.member!)}
                >
                  管理
                </Button>
              )}
            </View>
          )
        })}
        {roster && (
          <View className="native-manage-toolbar">
            <Button
              className="native-button"
              disabled={!editable || busy || !dirty}
              loading={busy}
              onClick={() => void send('SAVE')}
            >
              保存名单
            </Button>
            <Button
              className="native-button native-button--primary"
              disabled={!editable || busy}
              onClick={() => void send('SUBMIT')}
            >
              提交审核
            </Button>
          </View>
        )}
      </View>
      <View className="native-manage-card">
        <Text className="native-manage-title">入队申请</Text>
        {!workspace.applications.some((a) => a.status === 'PENDING') && (
          <Text className="native-note">暂无待处理申请</Text>
        )}
        {workspace.applications
          .filter((a) => a.status === 'PENDING')
          .map((a) => (
            <View key={a.id}>
              <View className="native-manage-person">
                <UserAvatar
                  avatarUrl={a.applicant.avatarUrl}
                  name={a.applicant.displayName}
                  size="small"
                />
                <View className="native-manage-person__copy">
                  <Text>{a.applicant.displayName}</Text>
                  <Text className="native-note">
                    {positionLabel(a.requestedPosition)}
                    {a.message ? ` · ${a.message}` : ''}
                  </Text>
                </View>
              </View>
              <View className="native-manage-toolbar">
                <Button
                  className="native-button"
                  disabled={busy}
                  onClick={() => void review(a.id, 'REJECTED')}
                >
                  拒绝
                </Button>
                <Button
                  className="native-button native-button--primary"
                  disabled={busy}
                  onClick={() => void review(a.id, 'APPROVED')}
                >
                  同意加入
                </Button>
              </View>
            </View>
          ))}
      </View>
      {member && (
        <MemberEditor
          member={member}
          teamId={workspace.team.id}
          onClose={() => setMember(null)}
          onSaved={(next) => {
            onWorkspace(next)
            setMember(null)
          }}
        />
      )}
    </>
  )
}
function MemberEditor({
  member,
  teamId,
  onClose,
  onSaved,
}: {
  member: Member
  teamId: string
  onClose: () => void
  onSaved: (next: CaptainWorkspaceResponse) => void
}) {
  const [position, setPosition] = useState(member.position || 'MIDFIELDER'),
    [reason, setReason] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('')
  const send = async (remove = false) => {
    if (busy) return
    if (!reason.trim()) {
      setError('请填写变更原因')
      return
    }
    if (
      remove &&
      !(
        await Taro.showModal({
          title: '移出球队',
          content: `确定将${member.displayName}移出球队？`,
        })
      ).confirm
    )
      return
    setBusy(true)
    setError('')
    try {
      onSaved(
        remove
          ? await teamManagementRepository.removeMember(
              teamId,
              member.id,
              member.updatedAt,
              reason,
              createClientActionId('member'),
            )
          : await teamManagementRepository.updateMember(
              teamId,
              member.id,
              position,
              member.updatedAt,
              reason,
              createClientActionId('member'),
            ),
      )
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : '成员更新失败')
    } finally {
      setBusy(false)
    }
  }
  return (
    <NativeDialog
      title={member.displayName}
      busy={busy}
      unsavedChanges={position !== (member.position || 'MIDFIELDER') || !!reason}
      onClose={onClose}
      footer={
        <>
          <Button
            className="native-button"
            disabled={busy || member.isCaptain}
            onClick={() => void send(true)}
          >
            移出球队
          </Button>
          <Button
            className="native-button native-button--primary"
            loading={busy}
            onClick={() => void send()}
          >
            保存位置
          </Button>
        </>
      }
    >
      <Picker
        range={positions.map(positionLabel)}
        value={Math.max(0, positions.indexOf(position))}
        onChange={(e) => setPosition(positions[Number(e.detail.value)]!)}
      >
        <View className="native-select">
          {positionLabel(position)}
          <View className="native-select__chevron" />
        </View>
      </Picker>
      <Text className="native-label">变更原因</Text>
      <Input
        className="native-field"
        value={reason}
        maxlength={200}
        onInput={(e) => setReason(e.detail.value)}
      />
      {error && <Text className="native-error">{error}</Text>}
    </NativeDialog>
  )
}
