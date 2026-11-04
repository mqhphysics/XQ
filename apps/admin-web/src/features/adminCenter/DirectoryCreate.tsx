import { useState } from 'react'
import type { OrganizationContext } from '../adminSchedule/types'
import { ActionForm, DataState, type PageData, type Row, useAdminData } from './shared'

export function DirectoryCreate({
  context,
  kind,
  onDone,
}: {
  context: OrganizationContext
  kind: 'teams' | 'players'
  onDone: () => void
}) {
  const [name, setName] = useState('')
  const [teamCode, setTeamCode] = useState('')
  const [shortName, setShortName] = useState('')
  const [collegeName, setCollegeName] = useState('')
  const [position, setPosition] = useState('')
  const [teamQuery, setTeamQuery] = useState('')
  const [selectedTeam, setSelectedTeam] = useState<Row | null>(null)
  const params = new URLSearchParams({ page: '1', pageSize: '100', query: teamQuery.trim() })
  const teams = useAdminData<PageData>(
    context,
    kind === 'players' ? `/admin/center/teams?${params}` : null,
  )
  return (
    <ActionForm
      context={context}
      path={`/admin/center/${kind}`}
      body={
        kind === 'teams'
          ? {
              teamCode: teamCode.trim(),
              profile: {
                name: name.trim(),
                ...(shortName.trim() ? { shortName: shortName.trim() } : {}),
                ...(collegeName.trim() ? { collegeName: collegeName.trim() } : {}),
              },
            }
          : {
              teamId: selectedTeam?.id ?? '',
              profile: { displayName: name.trim(), ...(position ? { position } : {}) },
            }
      }
      submitLabel={kind === 'teams' ? '创建球队档案' : '创建球员并加入球队'}
      onDone={onDone}
    >
      <p className="mc-muted">
        {kind === 'teams'
          ? '新球队可在组织球队目录中查看与关注；此操作不自动将球队报名到赛事。'
          : '球员将加入所选球队的现役成员，可在前端查看。参赛资格、球衣号码与赛事锁定名单需另行审核。'}
      </p>
      <div className="mc-form-grid">
        {kind === 'teams' ? (
          <label className="mc-field">
            <span>球队稳定编号</span>
            <input
              required
              maxLength={64}
              pattern="[A-Za-z0-9][A-Za-z0-9_.:\-]*"
              value={teamCode}
              onChange={(event) => setTeamCode(event.target.value)}
              placeholder="例如 CAMPUS-MATH"
            />
            <small>1–64 位字母、数字或 _ . : -，创建后用于稳定识别。</small>
          </label>
        ) : null}
        <label className="mc-field">
          <span>{kind === 'teams' ? '球队名称' : '球员显示姓名'}</span>
          <input
            required
            maxLength={kind === 'teams' ? 160 : 120}
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        {kind === 'teams' ? (
          <>
            <label className="mc-field">
              <span>简称（可选）</span>
              <input
                maxLength={80}
                value={shortName}
                onChange={(event) => setShortName(event.target.value)}
              />
            </label>
            <label className="mc-field">
              <span>学院（可选）</span>
              <input
                maxLength={160}
                value={collegeName}
                onChange={(event) => setCollegeName(event.target.value)}
              />
            </label>
          </>
        ) : (
          <>
            <label className="mc-field">
              <span>主位置（可选）</span>
              <select value={position} onChange={(event) => setPosition(event.target.value)}>
                <option value="">未填写</option>
                <option value="GOALKEEPER">门将</option>
                <option value="DEFENDER">后卫</option>
                <option value="MIDFIELDER">中场</option>
                <option value="FORWARD">前锋</option>
              </select>
            </label>
            <label className="mc-field">
              <span>搜索所属球队</span>
              <input
                maxLength={160}
                value={teamQuery}
                placeholder="按球队名称或编号搜索"
                onChange={(event) => setTeamQuery(event.target.value)}
              />
            </label>
            <DataState {...teams} empty={teams.data?.items.length === 0} onRetry={teams.refresh} />
            <label className="mc-field mc-wide">
              <span>所属球队</span>
              <select
                required
                value={selectedTeam?.id ?? ''}
                onChange={(event) =>
                  setSelectedTeam(
                    teams.data?.items.find((team) => team.id === event.target.value) ?? null,
                  )
                }
              >
                <option value="">请选择本组织球队</option>
                {selectedTeam && !teams.data?.items.some((team) => team.id === selectedTeam.id) ? (
                  <option value={selectedTeam.id}>
                    {String(selectedTeam.name)} · {String(selectedTeam.teamCode)}
                  </option>
                ) : null}
                {teams.data?.items.map((team) => (
                  <option key={team.id} value={team.id}>
                    {String(team.name)} · {String(team.teamCode)}
                  </option>
                ))}
              </select>
            </label>
            {teams.data && teams.data.total > teams.data.items.length ? (
              <p className="mc-muted mc-wide">
                当前显示前 {teams.data.items.length} 支球队；输入名称或编号可缩小范围。
              </p>
            ) : null}
          </>
        )}
      </div>
    </ActionForm>
  )
}
