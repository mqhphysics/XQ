import { NativeContentPager } from '../../components/native-navigation/content-pager.weapp'
import { Button, Input, Text, Textarea, View } from '@tarojs/components'
import { getCurrentInstance } from '@tarojs/taro'
import { useEffect, useState } from 'react'
import { PublicShell } from '../../components/public-shell'
import { DataState } from '../../components/public-ui'
import {
  NativeDetailTabs,
  NativeProfileCover,
} from '../../components/native-navigation/profile-parts.weapp'
import { TeamCrest } from '../../components/product-ui'
import { NativeDialog } from '../../components/native-ui/index.weapp'
import {
  teamManagementRepository,
  type CaptainTeamProfile,
} from '../../features/captain-roster/team-management.repository'
import {
  rosterRepository,
  type RosterWorkflowView,
} from '../../features/captain-roster/roster.repository'
import { createClientActionId, productRepository } from '../../features/product/product.repository'
import type {
  CaptainWorkspaceResponse,
  TeamDashboardResponse,
} from '../../features/product/product.types'
import { allowNativeLeave } from '../../features/native-navigation/leave-guard.weapp'
import { NativeManageSquad } from './squad.weapp'
import { NativeManageLineup } from './lineup.weapp'
import { NativeTeamCoverEditor } from './cover.weapp'
import { useNativeRouteState } from '../../features/native-navigation/index.weapp'
import { openTeam } from '../../features/product/team-navigation'
import { readSession } from '../../features/product/session'
import Taro from '@tarojs/taro'
import {
  nativeLineupBackupKey,
  readNativeLineupBackup,
} from '../../features/captain-roster/lineup-native.logic.weapp'
import './index.weapp.scss'

type Workspace = CaptainWorkspaceResponse & { team: CaptainTeamProfile }
export default function NativeTeamManage({
  teamId: suppliedTeam,
  tournamentId: suppliedTournament,
}: { teamId?: string | undefined; tournamentId?: string | undefined } = {}) {
  const params = getCurrentInstance().router?.params
  const teamId = suppliedTeam || params?.teamId || '',
    tournamentId = suppliedTournament || params?.tournamentId || ''
  const [workspace, setWorkspace] = useState<Workspace | null>(null),
    [dashboard, setDashboard] = useState<TeamDashboardResponse | null>(null)
  const [roster, setRoster] = useState<RosterWorkflowView | null>(null),
    [rosterError, setRosterError] = useState('')
  const [error, setError] = useState(''),
    [attempt, setAttempt] = useState(0),
    [edit, setEdit] = useState(false),
    [coverEdit, setCoverEdit] = useState(false)
  const [tab, setTab] = useNativeRouteState('manage-tab', () => {
    const user = readSession()?.user
    if (!user) return 0
    try {
      return readNativeLineupBackup(
        Taro.getStorageSync(
          nativeLineupBackupKey(user.organizationId, user.id, teamId, tournamentId),
        ),
      )
        ? 1
        : 0
    } catch {
      return 0
    }
  })
  useEffect(() => {
    let active = true
    if (!teamId) {
      setError('缺少球队信息')
      return
    }
    setError('')
    const load = async () => {
      try {
        const [nextWorkspace, nextDashboard, nextRoster] = await Promise.all([
          teamManagementRepository.read(teamId),
          productRepository.getTeamDashboard(teamId, tournamentId || undefined).catch(() => null),
          tournamentId
            ? rosterRepository
                .read(tournamentId, teamId)
                .then((data) => ({ data, message: '' }))
                .catch((issue: Error) => ({ data: null, message: issue.message }))
            : Promise.resolve({ data: null, message: '请先选择赛事' }),
        ])
        if (!active) return
        setDashboard(nextDashboard)
        setRoster(nextRoster.data)
        setRosterError(nextRoster.message)
        setWorkspace(nextWorkspace)
      } catch (issue) {
        if (active) setError(issue instanceof Error ? issue.message : '球队管理读取失败')
      }
    }
    void load()
    return () => {
      active = false
    }
  }, [teamId, tournamentId, attempt])
  const team = workspace?.team
  const players = roster?.lockedSnapshot?.players.length
    ? roster.lockedSnapshot.players
    : workspace?.members.flatMap((member) =>
        member.playerId
          ? [
              {
                id: member.playerId,
                displayName: member.displayName,
                avatarUrl: member.avatarUrl,
                position: member.position,
                shirtNumber:
                  dashboard?.roster.find((p) => p.id === member.playerId)?.shirtNumber || null,
              },
            ]
          : [],
      ) || []
  return (
    <PublicShell active="me" showBack tournamentId={tournamentId}>
      <View className="native-team-manage">
        <View className="native-page-top">
          <Text className="native-page-title">管理球队</Text>
        </View>
        {error ? (
          <DataState
            kind="error"
            title="球队管理暂不可用"
            description={error}
            onRetry={() => setAttempt((n) => n + 1)}
          />
        ) : !workspace ? (
          <DataState kind="loading" title="正在读取球队管理" />
        ) : (
          <>
            <NativeProfileCover src={team?.coverUrl || dashboard?.team.coverUrl}>
              <TeamCrest team={team!} size="large" />
              <View
                className="native-profile-cover__copy"
                onClick={() => void openTeam(teamId, tournamentId)}
              >
                <Text>{team!.name}</Text>
                <Text>{team!.collegeName || '校园足球球队'}</Text>
                <Text>{team!.motto || ''}</Text>
              </View>
            </NativeProfileCover>
            <Button
              className="native-button native-manage-cover-action"
              onClick={() => setCoverEdit(true)}
            >
              更换球队背景
            </Button>
            <NativeDetailTabs
              tabs={['球队主页', '阵容', '大名单']}
              selected={tab}
              onSelect={(next) => {
                void allowNativeLeave().then((allowed) => {
                  if (allowed) setTab(next)
                })
              }}
            />
            <NativeContentPager
              index={tab}
              onSelect={async (next) => {
                if (!(await allowNativeLeave())) return false
                setTab(next)
                return true
              }}
              pages={[
                <View className="native-manage-card">
                  <Text className="native-manage-title">球队资料</Text>
                  {[
                    ['简称', team!.shortName],
                    ['院系', team!.collegeName],
                    ['成立年份', team!.foundedYear],
                    ['口号', team!.motto],
                    ['简介', team!.description],
                  ].map(([label, value]) => (
                    <View className="native-manage-fact" key={String(label)}>
                      <Text>{label}</Text>
                      <Text>{value || '未登记'}</Text>
                    </View>
                  ))}
                  <Button
                    className="native-button native-button--primary"
                    onClick={() => setEdit(true)}
                  >
                    编辑球队资料
                  </Button>
                </View>,
                <NativeManageLineup
                  teamId={teamId}
                  tournamentId={tournamentId}
                  players={players}
                />,
                <NativeManageSquad
                  tournamentId={tournamentId}
                  workspace={workspace}
                  roster={roster}
                  rosterError={rosterError || (!tournamentId ? '请先选择赛事' : '')}
                  onWorkspace={(next) => setWorkspace({ ...next, team: workspace.team })}
                  onRoster={setRoster}
                  onReload={() => setAttempt((n) => n + 1)}
                />,
              ]}
            />

            {edit && (
              <ProfileEditor
                team={workspace.team}
                onClose={() => setEdit(false)}
                onSaved={(updated) => {
                  setWorkspace({ ...workspace, team: updated })
                  setEdit(false)
                }}
              />
            )}
            {coverEdit && (
              <NativeTeamCoverEditor
                teamId={teamId}
                onClose={() => setCoverEdit(false)}
                onSaved={async () => {
                  const fresh = await teamManagementRepository.read(teamId)
                  setWorkspace(fresh)
                }}
              />
            )}
          </>
        )}
      </View>
    </PublicShell>
  )
}
function ProfileEditor({
  team,
  onClose,
  onSaved,
}: {
  team: CaptainTeamProfile
  onClose: () => void
  onSaved: (team: CaptainTeamProfile) => void
}) {
  const initial = {
    name: team.name,
    shortName: team.shortName || '',
    collegeName: team.collegeName || '',
    foundedYear: team.foundedYear ? String(team.foundedYear) : '',
    motto: team.motto || '',
    description: team.description || '',
  }
  const [draft, setDraft] = useState(initial),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('')
  const save = async () => {
    if (busy) return
    if (!draft.name.trim()) {
      setError('请填写球队名称')
      return
    }
    if (
      draft.foundedYear &&
      (!/^\d{4}$/.test(draft.foundedYear) || Number(draft.foundedYear) > new Date().getFullYear())
    ) {
      setError('请填写有效的成立年份')
      return
    }
    setBusy(true)
    setError('')
    try {
      onSaved(
        await teamManagementRepository.saveProfile(
          team.id,
          {
            expectedUpdatedAt: team.updatedAt,
            patch: {
              ...draft,
              name: draft.name.trim(),
              foundedYear: draft.foundedYear ? Number(draft.foundedYear) : null,
            },
            reason: '更新球队资料',
          },
          createClientActionId('team-profile'),
        ),
      )
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : '资料保存失败')
    } finally {
      setBusy(false)
    }
  }
  return (
    <NativeDialog
      title="编辑球队资料"
      busy={busy}
      unsavedChanges={JSON.stringify(draft) !== JSON.stringify(initial)}
      onClose={onClose}
      footer={
        <Button
          className="native-button native-button--primary"
          loading={busy}
          onClick={() => void save()}
        >
          保存
        </Button>
      }
    >
      {(
        [
          ['name', '球队名称'],
          ['shortName', '简称'],
          ['collegeName', '院系'],
          ['foundedYear', '成立年份'],
          ['motto', '口号'],
        ] as const
      ).map(([key, label]) => (
        <View key={key}>
          <Text className="native-label">{label}</Text>
          <Input
            className="native-field"
            value={draft[key]}
            maxlength={key === 'foundedYear' ? 4 : 100}
            onInput={(e) => setDraft({ ...draft, [key]: e.detail.value })}
          />
        </View>
      ))}
      <Text className="native-label">简介</Text>
      <Textarea
        className="native-field"
        value={draft.description}
        maxlength={2000}
        onInput={(e) => setDraft({ ...draft, description: e.detail.value })}
      />
      {error && <Text className="native-error">{error}</Text>}
    </NativeDialog>
  )
}
