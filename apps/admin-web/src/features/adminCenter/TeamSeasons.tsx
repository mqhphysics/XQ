import { useState } from 'react'
import type { OrganizationContext } from '../adminSchedule/types'
import { ActionForm, DataState, Modal, label, useAdminData, type Row } from './shared'
import { MediaThumbnail } from './MediaLibrary'
import { StudentDrawer } from './CampusDirectory'
type Player = Row & {
  displayName: string
  jerseyName?: string
  position?: string
  academicYear?: string
  major?: string
  bio?: string
  avatarUrl?: string
  portraitUrl?: string
  coverUrl?: string
  studentRecord: { id: string } | null
  linkedUser: { displayName: string } | null
}
type Team = Row & {
  name: string
  shortName: string | null
  collegeName: string | null
  description: string | null
  motto: string | null
  crestUrl: string | null
  coverUrl: string | null
}
type Registration = Row & {
  updatedAt: string
  group: { name: string } | null
  seasonTeam: Team
  team: Team & { memberships: Array<{ playerProfile: Player | null }> }
  rosterSnapshots: Array<{ entries: Array<{ playerProfileId: string; shirtNumber: string }> }>
}
export function TeamSeasons({
  context,
  tournamentId,
}: {
  context: OrganizationContext
  tournamentId: string
}) {
  const result = useAdminData<{ items: Registration[] }>(
    context,
    `/admin/campus/team-seasons?tournamentId=${encodeURIComponent(tournamentId)}`,
  )
  const [query, setQuery] = useState(''),
    [selected, setSelected] = useState<Registration | null>(null),
    [view, setView] = useState<'team' | 'players'>('team'),
    [editing, setEditing] = useState(false),
    [student, setStudent] = useState(''),
    [player, setPlayer] = useState<Player | null>(null)
  const items = (result.data?.items ?? []).filter((item) =>
    `${item.seasonTeam.name} ${item.seasonTeam.collegeName}`.includes(query.trim()),
  )
  return (
    <>
      <section className="mc-panel team-directory-panel">
        <div className="mc-toolbar team-directory-search">
          <input
            aria-label="搜索球队"
            placeholder="搜索球队"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button type="button" className="secondary-button" onClick={result.refresh}>
            刷新
          </button>
        </div>
        <DataState {...result} empty={!items.length} onRetry={result.refresh} />
        <div className="admin-team-grid">
          {items.map((item) => (
            <article className="admin-team-card" key={item.id}>
              <div className="admin-team-cover">
                {item.seasonTeam.coverUrl && (
                  <MediaThumbnail context={context} url={item.seasonTeam.coverUrl} />
                )}
              </div>
              <div className="admin-team-card-body">
                <div className="admin-team-heading">
                  <span className="admin-team-crest">
                    {item.seasonTeam.crestUrl && (
                      <MediaThumbnail context={context} url={item.seasonTeam.crestUrl} />
                    )}
                  </span>
                  <div>
                    <h3>{item.seasonTeam.name}</h3>
                    <span>
                      {item.group?.name || '未分组'} · {item.team.memberships.length} 名球员
                    </span>
                  </div>
                </div>
                <div className="mc-actions">
                  <button
                    onClick={() => {
                      setSelected(item)
                      setView('team')
                      setEditing(false)
                    }}
                  >
                    球队资料
                  </button>
                  <button
                    className="secondary-button"
                    onClick={() => {
                      setSelected(item)
                      setView('players')
                    }}
                  >
                    球员资料
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>
      {selected && (
        <Modal
          title={`${selected.seasonTeam.name} · ${view === 'team' ? '球队资料' : '球员资料'}`}
          onClose={() => setSelected(null)}
          className="admin-team-dialog"
        >
          {view === 'team' ? (
            <div className="gov-detail-body">
              <div className="mc-entity-media">
                {selected.seasonTeam.crestUrl && (
                  <article>
                    <MediaThumbnail context={context} url={selected.seasonTeam.crestUrl} large />
                    <strong>队徽</strong>
                  </article>
                )}
                {selected.seasonTeam.coverUrl && (
                  <article>
                    <MediaThumbnail context={context} url={selected.seasonTeam.coverUrl} large />
                    <strong>球队背景</strong>
                  </article>
                )}
              </div>
              {editing ? (
                <SeasonTeamForm
                  context={context}
                  registration={selected}
                  onDone={() => {
                    setEditing(false)
                    setSelected(null)
                    result.refresh()
                  }}
                />
              ) : (
                <>
                  <dl className="mc-facts">
                    <div>
                      <dt>学院</dt>
                      <dd>{selected.seasonTeam.collegeName || '—'}</dd>
                    </div>
                    <div>
                      <dt>口号</dt>
                      <dd>{selected.seasonTeam.motto || '—'}</dd>
                    </div>
                    <div>
                      <dt>介绍</dt>
                      <dd>{selected.seasonTeam.description || '—'}</dd>
                    </div>
                  </dl>
                  <button onClick={() => setEditing(true)}>编辑球队资料</button>
                </>
              )}
            </div>
          ) : (
            <div className="gov-detail-body">
              <table className="mc-table">
                <thead>
                  <tr>
                    <th>号码</th>
                    <th>姓名</th>
                    <th>位置</th>
                    <th>关联用户</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {selected.team.memberships
                    .flatMap((member) => (member.playerProfile ? [member.playerProfile] : []))
                    .map((p) => (
                      <tr
                        key={p.id}
                        className="mc-clickable-row"
                        onClick={() =>
                          p.studentRecord ? setStudent(p.studentRecord.id) : setPlayer(p)
                        }
                      >
                        <td>
                          {selected.rosterSnapshots[0]?.entries.find(
                            (entry) => entry.playerProfileId === p.id,
                          )?.shirtNumber || '—'}
                        </td>
                        <td>{p.displayName}</td>
                        <td>{label(p.position)}</td>
                        <td>{p.linkedUser?.displayName || '未注册'}</td>
                        <td>
                          <button
                            onClick={(event) => {
                              event.stopPropagation()
                              p.studentRecord ? setStudent(p.studentRecord.id) : setPlayer(p)
                            }}
                          >
                            查看资料
                          </button>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}
        </Modal>
      )}
      {student && (
        <StudentDrawer
          context={context}
          id={student}
          initialTab="player"
          onClose={() => setStudent('')}
          onChanged={result.refresh}
        />
      )}
      {player && (
        <Modal title={player.displayName} onClose={() => setPlayer(null)}>
          <div className="gov-detail-body">
            {player.avatarUrl && <MediaThumbnail context={context} url={player.avatarUrl} large />}
            <dl className="mc-facts">
              {['position', 'academicYear', 'major', 'bio'].map((key) => (
                <div key={key}>
                  <dt>
                    {{ position: '位置', academicYear: '年级', major: '专业', bio: '简介' }[key]}
                  </dt>
                  <dd>{label(player[key])}</dd>
                </div>
              ))}
            </dl>
          </div>
        </Modal>
      )}
    </>
  )
}
function SeasonTeamForm({
  context,
  registration,
  onDone,
}: {
  context: OrganizationContext
  registration: Registration
  onDone: () => void
}) {
  const [form, setForm] = useState({
    name: registration.seasonTeam.name,
    shortName: registration.seasonTeam.shortName ?? '',
    collegeName: registration.seasonTeam.collegeName ?? '',
    motto: registration.seasonTeam.motto ?? '',
    description: registration.seasonTeam.description ?? '',
  })
  return (
    <ActionForm
      context={context}
      method="PATCH"
      path={`/admin/campus/team-seasons/${registration.id}`}
      body={{ ...form, expectedUpdatedAt: registration.updatedAt }}
      submitLabel="保存资料"
      onDone={onDone}
    >
      <div className="mc-form-grid">
        {Object.entries({
          name: '球队名称',
          shortName: '简称',
          collegeName: '学院',
          motto: '口号',
          description: '介绍',
        }).map(([key, title]) => (
          <label className="mc-field" key={key}>
            <span>{title}</span>
            <input
              value={form[key as keyof typeof form]}
              onChange={(e) => setForm({ ...form, [key]: e.target.value })}
              maxLength={key === 'description' ? 600 : 160}
            />
          </label>
        ))}
      </div>
    </ActionForm>
  )
}
