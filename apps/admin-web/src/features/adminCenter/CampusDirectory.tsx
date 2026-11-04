import { useEffect, useState } from 'react'
import { requireAdminApi } from '../adminAuth/config'
import type { OrganizationContext } from '../adminSchedule/types'
import {
  ActionForm,
  Badge,
  DataState,
  Modal,
  Pager,
  label,
  time,
  useAdminData,
  type PageData,
  type Row,
} from './shared'
import { MediaThumbnail } from './MediaLibrary'
import { Directory } from './Directory'
import { UserDetail } from './PeopleManagement'
import { TeamSeasons } from './TeamSeasons'
import './campus-management.css'
import { StudentRegistrationReview } from './StudentRegistrationReview'

type Student = Row & {
  realName: string
  studentNumber: string | null
  gender: string
  collegeName: string
  academicYear: string
  status: string
  version: number
  cohort: string
  isDemo: boolean
  user:
    | (Row & {
        displayName: string
        loginNameNormalized: string | null
        email: string | null
        bio: string | null
        avatarUrl: string | null
        coverUrl: string | null
        updatedAt: string
        hasPassword: boolean
        profileCohort: string
        roleAssignments: Array<{ role: string; scopeType: string; scopeId: string }>
      })
    | null
  player:
    | (Row & {
        displayName: string
        avatarUrl: string | null
        portraitUrl: string | null
        coverUrl: string | null
        updatedAt: string
      })
    | null
}
type StudentDetail = Student & {
  pendingMedia: Array<{
    id: string
    purpose: string
    targetId: string
    version: number
    createdAt: string
  }>
  memberships: Array<Row & { team: { id: string; name: string } }>
  seasons: Array<
    Row & {
      displayName: string
      shirtNumber: string
      rosterSnapshot: {
        id: string
        snapshotVersion: number
        tournament: { name: string; season: { name: string } }
        team: { name: string }
      }
    }
  >
}
export function CampusDirectory({
  context,
  initialTab = 'students',
  initialSearch = '',
  tournamentId = '',
  onFindAccounts,
  onTabChange,
}: {
  context: OrganizationContext
  initialTab?: 'students' | 'users' | 'players' | 'teams'
  initialSearch?: string
  tournamentId?: string
  onFindAccounts?: (query: string) => void
  onTabChange?: (tab: 'students' | 'users' | 'players' | 'teams') => void
}) {
  const [tab, setTab] = useState<'students' | 'users' | 'players' | 'teams'>(
      initialTab === 'teams' || initialTab === 'players' ? 'teams' : 'students',
    ),
    [input, setInput] = useState(initialSearch),
    [query, setQuery] = useState(initialSearch),
    [page, setPage] = useState(1),
    [cohort, setCohort] = useState(''),
    [collegeName, setCollegeName] = useState(''),
    [academicYear, setAcademicYear] = useState(''),
    [selected, setSelected] = useState(''),
    [detailTab, setDetailTab] = useState<'student' | 'user' | 'player'>(
      initialTab === 'users' ? 'user' : initialTab === 'players' ? 'player' : 'student',
    ),
    [creating, setCreating] = useState(false)
  const result = useAdminData<
    PageData<Student> & { cohorts: Array<{ cohort: string; _count: number }> }
  >(
    context,
    tab === 'teams'
      ? null
      : `/admin/campus/students?${new URLSearchParams({ kind: tab, query, page: String(page), cohort, collegeName, academicYear })}`,
  )
  const catalog = useAdminData<{ colleges: string[]; academicYears: string[] }>(
    context,
    '/admin/campus/student-options',
  )
  const names = {
    students: '学生基础档案',
    teams: '球员、球队档案',
  }
  return (
    <>
      <StudentRegistrationReview context={context} />
      <section className="mc-panel campus-directory">
        <div className="campus-tabs" role="tablist" aria-label="人员档案分类">
          {(Object.keys(names) as Array<keyof typeof names>).map((value) => (
            <button
              role="tab"
              aria-selected={tab === value}
              key={value}
              onClick={() => {
                setTab(value)
                setPage(1)
                setSelected('')
                onTabChange?.(value)
              }}
            >
              {names[value]}
            </button>
          ))}
        </div>
        {tab !== 'teams' && (
          <>
            <form
              className="mc-toolbar campus-student-search"
              onSubmit={(e) => {
                e.preventDefault()
                setQuery(input.trim())
                setPage(1)
              }}
            >
              <input
                aria-label="搜索学生账号或球员"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="姓名、学号"
              />
              <select
                aria-label="资料范围"
                value={cohort}
                onChange={(e) => {
                  setCohort(e.target.value)
                  setPage(1)
                }}
              >
                <option value="DEMO_2026">演示资料</option>
                <option value="CURRENT">正式资料</option>
                <option value="">全部资料</option>
                <option value="LEGACY">旧资料待整理</option>
              </select>
              <button>搜索</button>
              <button type="button" className="secondary-button" onClick={() => setCreating(true)}>
                新增学生
              </button>
              <select
                aria-label="按学院筛选"
                value={collegeName}
                onChange={(e) => {
                  setCollegeName(e.target.value)
                  setPage(1)
                }}
              >
                <option value="">全部学院</option>
                {catalog.data?.colleges.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
              <select
                aria-label="按年级筛选"
                value={academicYear}
                onChange={(e) => {
                  setAcademicYear(e.target.value)
                  setPage(1)
                }}
              >
                <option value="">全部年级</option>
                {catalog.data?.academicYears.map((year) => (
                  <option key={year} value={year}>
                    {year}
                  </option>
                ))}
              </select>
              <button type="button" className="secondary-button" onClick={result.refresh}>
                刷新
              </button>
            </form>
            <DataState
              {...result}
              empty={result.data?.items.length === 0}
              onRetry={result.refresh}
            />
            {result.data && (
              <>
                <div className="workspace-directory-count">
                  共 <strong>{result.data.total}</strong> 名学生
                  {query ? `，搜索“${query}”` : ''}
                </div>
                <div className="mc-table-wrap">
                  <table className="mc-table">
                    <thead>
                      <tr>
                        <th>姓名</th>
                        <th>学号</th>
                        <th>学院</th>
                        <th>年级</th>
                        <th>状态</th>
                        <th>操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.data.items.map((student) => (
                        <tr
                          key={student.id}
                          className="mc-clickable-row"
                          tabIndex={0}
                          onClick={() => {
                            setDetailTab('student')
                            setSelected(student.id)
                          }}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter') {
                              setDetailTab('student')
                              setSelected(student.id)
                            }
                          }}
                        >
                          <td>
                            <strong>{student.realName}</strong>
                          </td>
                          <td>{student.studentNumber || '待补充'}</td>
                          <td>{student.collegeName}</td>
                          <td>{student.academicYear || '—'}</td>
                          <td>
                            <Badge value={student.status} />
                          </td>
                          <td>
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation()
                                setDetailTab('student')
                                setSelected(student.id)
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
                <Pager data={result.data} page={page} onPage={setPage} />
              </>
            )}
            {onFindAccounts && result.data?.total === 0 && (
              <p className="workspace-directory-empty-link">
                账号可能还未关联学生档案。
                <button type="button" onClick={() => onFindAccounts(query)}>
                  到账号库查找
                </button>
              </p>
            )}
          </>
        )}
      </section>
      {tab === 'teams' && <TeamSeasons context={context} tournamentId={tournamentId} />}
      {selected && (
        <StudentDrawer
          key={selected}
          context={context}
          id={selected}
          onClose={() => setSelected('')}
          onChanged={result.refresh}
          initialTab={detailTab}
        />
      )}
      {creating && (
        <Modal title="建立学生档案" onClose={() => setCreating(false)}>
          <StudentForm
            context={context}
            onDone={() => {
              setCreating(false)
              setCohort('CURRENT')
              setTab('students')
              setQuery('')
              setInput('')
              setPage(1)
              result.refresh()
            }}
          />
        </Modal>
      )}
    </>
  )
}

export function StudentDrawer({
  context,
  id,
  onClose,
  onChanged,
  initialTab,
}: {
  context: OrganizationContext
  id: string
  onClose: () => void
  onChanged: () => void
  initialTab: 'student' | 'user' | 'player'
}) {
  const detail = useAdminData<StudentDetail>(context, `/admin/campus/students/${id}`)
  const [tab, setTab] = useState<'student' | 'user' | 'player' | 'history'>(initialTab),
    [login, setLogin] = useState(false),
    [notice, setNotice] = useState('')
  const student = detail.data
  function saved() {
    setNotice('已保存，相关资料已更新。')
    detail.refresh()
    onChanged()
  }
  return (
    <Modal
      className="campus-student-dialog"
      title={student ? `${student.realName} · 人员资料` : '读取学生档案'}
      onClose={onClose}
    >
      <DataState {...detail} onRetry={detail.refresh} />
      {notice && (
        <p className="campus-save-notice" role="status">
          {notice}
        </p>
      )}
      {student && (
        <>
          <div className="campus-person-summary">
            <div>
              <span>学生</span>
              <strong>{student.realName}</strong>
              <small>{student.studentNumber ?? '学号待核验'}</small>
            </div>
            <i aria-hidden="true">→</i>
            <div>
              <span>用户</span>
              <strong>{student.user?.displayName ?? '尚未注册'}</strong>
              <small>{student.user?.loginNameNormalized ?? '暂无登录账号'}</small>
            </div>
            <i aria-hidden="true">→</i>
            <div>
              <span>球员</span>
              <strong>{student.player?.displayName ?? '暂无球员身份'}</strong>
              <small>{student.player ? '基础档案已建立' : '可后续申请认证'}</small>
            </div>
          </div>
          <div className="campus-tabs" role="tablist" aria-label="学生关联资料">
            {[
              ['student', '姓名与学号'],
              ['user', '账号与个人资料'],
              ['player', '球员与图片'],
              ['history', '赛季与球队'],
            ].map(([value, title]) => (
              <button
                key={value}
                role="tab"
                aria-selected={tab === value}
                onClick={() => {
                  setTab(value as typeof tab)
                  setNotice('')
                }}
              >
                {title}
              </button>
            ))}
          </div>
          {tab === 'student' && (
            <>
              <StudentForm
                key={student.version}
                context={context}
                student={student}
                onDone={saved}
              />
              <div className="campus-link-actions">
                <details>
                  <summary>关联已有用户或球员</summary>
                  <p className="mc-muted">
                    按稳定编号关联，姓名相同不代表同一人。关联用户时需核实其姓名学号。
                  </p>
                  <LinkForm context={context} student={student} kind="user" onDone={saved} />
                  <LinkForm context={context} student={student} kind="player" onDone={saved} />
                </details>
              </div>
            </>
          )}
          {tab === 'user' &&
            (student.user ? (
              <>
                <div className="campus-detail-heading">
                  <div>
                    <h3>用户个人资料</h3>
                    <p>昵称与照片对外展示；姓名、学号在学生档案中维护。</p>
                  </div>
                  <button onClick={() => setLogin(true)}>账号、密码与活动</button>
                </div>
                <ProfileImages context={context} type="USER" entity={student.user} onDone={saved} />
                <PendingProfileMedia
                  context={context}
                  items={student.pendingMedia.filter((item) => item.targetId === student.user!.id)}
                  onDone={saved}
                />
                <UserForm
                  key={student.user.updatedAt}
                  context={context}
                  user={student.user}
                  onDone={saved}
                />
                <dl className="campus-facts">
                  <div>
                    <dt>邮箱</dt>
                    <dd>{student.user.email ?? '尚未关联'}</dd>
                  </div>
                  <div>
                    <dt>登录状态</dt>
                    <dd>{student.user.hasPassword ? '已设置登录凭据' : '尚未设置密码'}</dd>
                  </div>
                  <div>
                    <dt>附属身份</dt>
                    <dd>
                      {student.user.roleAssignments.map((r) => label(r.role)).join('、') ||
                        '普通用户'}
                    </dd>
                  </div>
                </dl>
              </>
            ) : (
              <p className="campus-empty-note">
                这名学生尚未注册。学生资料与球员档案仍可独立维护。
              </p>
            ))}
          {tab === 'player' &&
            (student.player ? (
              <>
                <ProfileImages
                  context={context}
                  type="PLAYER"
                  entity={student.player}
                  onDone={saved}
                />
                <PendingProfileMedia
                  context={context}
                  items={student.pendingMedia.filter(
                    (item) => item.targetId === student.player!.id,
                  )}
                  onDone={saved}
                />
                <PlayerForm
                  key={student.player.updatedAt}
                  context={context}
                  player={student.player}
                  onDone={saved}
                />
              </>
            ) : (
              <div className="campus-empty-note">
                <p>暂无球员档案；可以在核实学生身份后建立基础球员资料，或关联已有档案。</p>
                <ActionForm
                  context={context}
                  path={`/admin/campus/students/${student.id}/player-profile`}
                  body={{ expectedVersion: student.version }}
                  submitLabel="建立基础球员档案"
                  onDone={saved}
                />
              </div>
            ))}
          {tab === 'history' && (
            <>
              <h3>球队与赛季记录</h3>
              <p className="mc-muted">
                名单、球衣号码和球队归属按具体赛事赛季保存，历史锁定名单保留原记录。
              </p>
              {student.seasons.length ? (
                <div className="campus-history">
                  {student.seasons.map((row) => (
                    <article key={row.id}>
                      <strong>{row.rosterSnapshot.tournament.name}</strong>
                      <span>
                        {row.rosterSnapshot.tournament.season.name} · {row.rosterSnapshot.team.name}
                      </span>
                      <small>
                        {row.displayName} · {row.shirtNumber}号 · 名单版本
                        {row.rosterSnapshot.snapshotVersion}
                      </small>
                    </article>
                  ))}
                </div>
              ) : (
                <p className="campus-empty-note">尚未进入任何赛事的锁定名单。</p>
              )}
              <h4>球队基础成员关系</h4>
              {student.memberships.map((m) => (
                <p key={m.id}>
                  {m.team.name} · {label(String(m.status))}
                </p>
              ))}
            </>
          )}
          {login && student.user && (
            <UserDetail
              context={context}
              row={{ ...student.user, requestedTab: 'login' }}
              onClose={() => setLogin(false)}
              onChanged={() => {
                setLogin(false)
                saved()
              }}
            />
          )}
        </>
      )}
    </Modal>
  )
}

function StudentForm({
  context,
  student,
  onDone,
}: {
  context: OrganizationContext
  student?: Student
  onDone: () => void
}) {
  const options = useAdminData<{ colleges: string[]; academicYears: string[] }>(
    context,
    '/admin/campus/student-options',
  )
  const [form, setForm] = useState({
    realName: student?.realName ?? '',
    studentNumber: student?.studentNumber ?? '',
    gender: student?.gender ?? 'UNSPECIFIED',
    collegeName: student?.collegeName ?? '',
    academicYear: student?.academicYear ?? '',
    status: student?.status ?? 'ACTIVE',
  })
  const derivedYear = /^20\d{8}$/.test(form.studentNumber)
    ? `${form.studentNumber.slice(0, 4)}级`
    : ''
  return (
    <ActionForm
      context={context}
      path={`/admin/campus/students${student ? `/${student.id}` : ''}`}
      method={student ? 'PATCH' : 'POST'}
      body={{
        ...form,
        academicYear: derivedYear || form.academicYear,
        studentNumber:
          student && form.studentNumber === student.studentNumber
            ? undefined
            : form.studentNumber || null,
        ...(student ? { expectedVersion: student.version } : {}),
      }}
      submitLabel={student ? '保存学生基础资料' : '创建学生档案'}
      canSubmit={Boolean(options.data)}
      onDone={onDone}
    >
      <DataState {...options} onRetry={options.refresh} />
      <div className="mc-form-grid">
        {[
          ['realName', '姓名'],
          ['studentNumber', '学号'],
        ].map(([key, title]) => (
          <label className="mc-field" key={key}>
            <span>{title}</span>
            <input
              required={key === 'realName'}
              maxLength={key === 'studentNumber' ? 10 : 120}
              inputMode={key === 'studentNumber' ? 'numeric' : undefined}
              pattern={key === 'studentNumber' ? '20[0-9]{8}' : undefined}
              placeholder={key === 'studentNumber' ? '尚未提供可留空' : undefined}
              value={form[key as keyof typeof form]}
              onChange={(e) => setForm({ ...form, [key!]: e.target.value })}
            />
          </label>
        ))}
        <label className="mc-field">
          <span>学院</span>
          <select
            value={form.collegeName}
            onChange={(e) => setForm({ ...form, collegeName: e.target.value })}
          >
            <option value="">待补充</option>
            {options.data?.colleges.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <label className="mc-field">
          <span>年级</span>
          <select
            value={derivedYear || form.academicYear}
            disabled={Boolean(derivedYear)}
            onChange={(e) => setForm({ ...form, academicYear: e.target.value })}
          >
            <option value="">待补充</option>
            {options.data?.academicYears.map((year) => (
              <option key={year} value={year}>
                {year}
              </option>
            ))}
          </select>
        </label>
        <label className="mc-field">
          <span>性别</span>
          <select
            value={form.gender}
            onChange={(e) => setForm({ ...form, gender: e.target.value })}
          >
            <option value="UNSPECIFIED">待确认</option>
            <option value="MALE">男</option>
            <option value="FEMALE">女</option>
          </select>
        </label>
        <label className="mc-field">
          <span>档案状态</span>
          <select
            value={form.status}
            onChange={(e) => setForm({ ...form, status: e.target.value })}
          >
            <option value="ACTIVE">正常</option>
            <option value="PENDING">待核验</option>
            <option value="ARCHIVED">历史归档</option>
          </select>
        </label>
      </div>
    </ActionForm>
  )
}
function LinkForm({
  context,
  student,
  kind,
  onDone,
}: {
  context: OrganizationContext
  student: Student
  kind: 'user' | 'player'
  onDone: () => void
}) {
  const [id, setId] = useState(''),
    [input, setInput] = useState(''),
    [query, setQuery] = useState('')
  const candidates = useAdminData<PageData>(
    context,
    query
      ? `/admin/center/${kind === 'user' ? 'users' : 'players'}?${new URLSearchParams({ query, pageSize: '20' })}`
      : null,
  )
  const existing = kind === 'user' ? student.user : student.player
  if (existing)
    return (
      <p className="mc-muted">
        已关联{kind === 'user' ? '账号' : '球员'}：{existing.displayName}。可切换上方页签维护资料。
      </p>
    )
  return (
    <ActionForm
      context={context}
      path={`/admin/campus/students/${student.id}/${kind}`}
      body={{ [kind === 'user' ? 'userId' : 'playerId']: id, expectedVersion: student.version }}
      submitLabel={kind === 'user' ? '核验并关联用户' : '关联球员'}
      canSubmit={!!id}
      onDone={onDone}
    >
      <div className="workspace-link-search">
        <label className="mc-field">
          <span>查找{kind === 'user' ? '账号' : '球员'}</span>
          <input
            value={input}
            maxLength={120}
            placeholder={kind === 'user' ? '输入姓名、学号或登录名' : '输入球员姓名'}
            onChange={(event) => setInput(event.target.value)}
          />
        </label>
        <button
          type="button"
          className="secondary-button"
          disabled={!input.trim()}
          onClick={() => {
            setQuery(input.trim())
            setId('')
          }}
        >
          查找
        </button>
      </div>
      {query && (
        <>
          <DataState
            {...candidates}
            empty={candidates.data?.items.length === 0}
            onRetry={candidates.refresh}
          />
          <label className="mc-field">
            <span>核对并选择具体{kind === 'user' ? '账号' : '球员'}</span>
            <select required value={id} onChange={(event) => setId(event.target.value)}>
              <option value="">请选择查询结果</option>
              {candidates.data?.items.map((item) => (
                <option key={item.id} value={item.id}>
                  {String(item.realName ?? item.displayName)} ·{' '}
                  {String(item.username ?? item.jerseyName ?? item.displayName)}
                  {item.studentId ? ` · ${String(item.studentId)}` : ''}
                </option>
              ))}
            </select>
          </label>
          <p className="mc-muted">
            核对姓名和学号后再关联；同名不代表同一人。资料不一致时，先在原档案中更正。
          </p>
        </>
      )}
    </ActionForm>
  )
}
function UserForm({
  context,
  user,
  onDone,
}: {
  context: OrganizationContext
  user: NonNullable<Student['user']>
  onDone: () => void
}) {
  const [name, setName] = useState(user.displayName),
    [bio, setBio] = useState(user.bio ?? '')
  return (
    <ActionForm
      context={context}
      method="PATCH"
      path={`/admin/campus/users/${user.id}/profile`}
      body={{ displayName: name, bio, expectedUpdatedAt: user.updatedAt }}
      submitLabel="保存个人资料"
      onDone={onDone}
    >
      <div className="mc-form-grid">
        <label className="mc-field">
          <span>昵称</span>
          <input value={name} required maxLength={120} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="mc-field">
          <span>个性签名</span>
          <textarea value={bio} maxLength={280} onChange={(e) => setBio(e.target.value)} />
        </label>
      </div>
    </ActionForm>
  )
}
function PlayerForm({
  context,
  player,
  onDone,
}: {
  context: OrganizationContext
  player: NonNullable<Student['player']>
  onDone: () => void
}) {
  const [form, setForm] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      [
        'jerseyName',
        'major',
        'hometown',
        'heightCm',
        'bio',
        'position',
        'dominantFoot',
        'ratingShooting',
        'ratingSpeed',
        'ratingDribbling',
        'ratingPassing',
        'ratingDefending',
      ].map((key) => [key, String(player[key] ?? '')]),
    ),
  )
  const numeric = [
    'heightCm',
    'ratingShooting',
    'ratingSpeed',
    'ratingDribbling',
    'ratingPassing',
    'ratingDefending',
  ]
  const body = Object.fromEntries(
    Object.entries(form)
      .filter(
        ([key, value]) => ![...numeric, 'position', 'dominantFoot'].includes(key) || value !== '',
      )
      .map(([key, value]) => [key, numeric.includes(key) ? Number(value) : value]),
  )
  return (
    <ActionForm
      context={context}
      method="PATCH"
      path={`/admin/campus/players/${player.id}/profile`}
      body={{ ...body, expectedUpdatedAt: player.updatedAt }}
      submitLabel="保存球员资料"
      onDone={onDone}
    >
      <div className="mc-form-grid">
        <label className="mc-field">
          <span>场上位置</span>
          <select
            value={form.position ?? ''}
            onChange={(event) => setForm({ ...form, position: event.target.value })}
          >
            <option value="">尚未记录</option>
            <option value="GOALKEEPER">守门员</option>
            <option value="DEFENDER">后卫</option>
            <option value="MIDFIELDER">中场</option>
            <option value="FORWARD">前锋</option>
          </select>
        </label>
        <label className="mc-field">
          <span>惯用脚</span>
          <select
            value={form.dominantFoot ?? ''}
            onChange={(event) => setForm({ ...form, dominantFoot: event.target.value })}
          >
            <option value="">尚未记录</option>
            <option value="LEFT">左脚</option>
            <option value="RIGHT">右脚</option>
            <option value="BOTH">双脚</option>
          </select>
        </label>
        {[
          ['jerseyName', '球衣显示名'],
          ['major', '专业'],
          ['hometown', '家乡'],
          ['heightCm', '身高（cm）'],
          ['ratingShooting', '射门'],
          ['ratingSpeed', '速度'],
          ['ratingDribbling', '盘带'],
          ['ratingPassing', '传球'],
          ['ratingDefending', '防守'],
        ].map(([key, title]) => (
          <label className="mc-field" key={key}>
            <span>{title}</span>
            <input
              type={numeric.includes(key!) ? 'number' : 'text'}
              min={key === 'heightCm' ? 80 : 0}
              max={key === 'heightCm' ? 250 : 100}
              value={form[key!] ?? ''}
              onChange={(e) => setForm({ ...form, [key!]: e.target.value })}
            />
          </label>
        ))}
        <label className="mc-field">
          <span>球员介绍</span>
          <textarea
            value={form.bio ?? ''}
            maxLength={600}
            onChange={(e) => setForm({ ...form, bio: e.target.value })}
          />
        </label>
      </div>
    </ActionForm>
  )
}
function PendingProfileMedia({
  context,
  items,
  onDone,
}: {
  context: OrganizationContext
  items: StudentDetail['pendingMedia']
  onDone: () => void
}) {
  const [chosen, setChosen] = useState<StudentDetail['pendingMedia'][number] | null>(null)
  const [image, setImage] = useState(''),
    [error, setError] = useState(''),
    [decision, setDecision] = useState('APPROVE')
  useEffect(() => {
    const controller = new AbortController()
    let objectUrl = ''
    setImage('')
    setError('')
    if (chosen)
      void fetch(`${requireAdminApi()}/media-assets/${chosen.id}/content`, {
        headers: {
          authorization: `Bearer ${context.accessToken}`,
          'x-organization-id': context.organizationId,
        },
        signal: controller.signal,
      })
        .then(async (response) => {
          if (!response.ok) throw new Error('投稿图片暂不可预览')
          const blob = await response.blob()
          if (controller.signal.aborted) return
          objectUrl = URL.createObjectURL(blob)
          setImage(objectUrl)
        })
        .catch((issue) => {
          if (!controller.signal.aborted) setError(issue.message)
        })
    return () => {
      controller.abort()
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [chosen?.id, context.accessToken, context.organizationId])
  if (!items.length) return null
  const names: Record<string, string> = {
    USER_AVATAR: '账号头像',
    USER_BACKGROUND: '个人背景',
    PLAYER_PORTRAIT: '球员照片',
    TEAM_CREST: '球队队徽',
    TEAM_BACKGROUND: '球队背景',
  }
  return (
    <section className="campus-pending-media">
      <h3>待审核的资料图片</h3>
      {items.map((item) => (
        <button
          key={item.id}
          onClick={() => {
            setChosen(item)
            setDecision('APPROVE')
          }}
        >
          {names[item.purpose]} · {time(item.createdAt)} · 查看并审核
        </button>
      ))}
      {chosen && (
        <Modal title={`审核${names[chosen.purpose] ?? '资料图片'}`} onClose={() => setChosen(null)}>
          {image ? (
            <img className="campus-upload-preview" src={image} alt="待审核资料图片" />
          ) : (
            <p role="status">{error || '正在读取图片…'}</p>
          )}
          <ActionForm
            context={context}
            path={`/admin/media-assets/${chosen.id}/review`}
            method="PUT"
            body={{ action: decision, expectedVersion: chosen.version }}
            submitLabel="保存审核结果"
            onDone={() => {
              setChosen(null)
              onDone()
            }}
          >
            <label className="mc-field">
              <span>审核结果</span>
              <select value={decision} onChange={(event) => setDecision(event.target.value)}>
                <option value="APPROVE">通过</option>
                <option value="REJECT">不通过，说明原因</option>
              </select>
            </label>
          </ActionForm>
        </Modal>
      )}
    </section>
  )
}

function ProfileImages({
  context,
  type,
  entity,
  onDone,
}: {
  context: OrganizationContext
  type: 'USER' | 'PLAYER'
  entity: Row & { avatarUrl: string | null; coverUrl: string | null; updatedAt: string }
  onDone: () => void
}) {
  const [slot, setSlot] = useState<string | null>(null),
    [data, setData] = useState(''),
    [error, setError] = useState('')
  const slots =
    type === 'USER'
      ? [
          ['AVATAR', '头像', 'avatarUrl'],
          ['COVER', '个人背景', 'coverUrl'],
        ]
      : [
          ['AVATAR', '球员头像', 'avatarUrl'],
          ['PORTRAIT', '球员照片', 'portraitUrl'],
          ['COVER', '球员背景', 'coverUrl'],
        ]
  async function fileChanged(file: File | undefined) {
    if (!file) return
    if (!/^image\/(jpeg|png|webp)$/.test(file.type) || file.size > 5 * 1024 * 1024) {
      setError('请选择5MB以内的JPEG、PNG或WebP图片')
      return
    }
    setError('')
    const reader = new FileReader()
    reader.onload = () => setData(String(reader.result))
    reader.readAsDataURL(file)
  }
  return (
    <div className="campus-profile-images">
      {slots.map(([key, title, field]) => (
        <article key={key}>
          <div className={`campus-profile-images__preview ${key === 'AVATAR' ? 'is-avatar' : ''}`}>
            {entity[field!] ? (
              <MediaThumbnail context={context} url={String(entity[field!])} previewable />
            ) : (
              <span>尚未设置</span>
            )}
          </div>
          <strong>{title}</strong>
          <button
            className="mc-link-button"
            onClick={() => {
              setSlot(key!)
              setData('')
              setError('')
            }}
          >
            更换图片
          </button>
        </article>
      ))}
      {slot && (
        <Modal
          title={`更换${slots.find((s) => s[0] === slot)?.[1] ?? '图片'}`}
          onClose={() => setSlot(null)}
        >
          <ActionForm
            context={context}
            path="/admin/campus/profile-media"
            body={{
              targetType: type,
              targetId: entity.id,
              slot,
              dataUrl: data,
              expectedUpdatedAt: entity.updatedAt,
            }}
            submitLabel="保存图片"
            onDone={() => {
              setSlot(null)
              onDone()
            }}
          >
            <label className="mc-field">
              <span>选择图片</span>
              <input
                required
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={(e) => void fileChanged(e.target.files?.[0])}
              />
            </label>
            {error && <p role="alert">{error}</p>}
            {data && <img className="campus-upload-preview" src={data} alt="待保存图片预览" />}
          </ActionForm>
        </Modal>
      )}
    </div>
  )
}
