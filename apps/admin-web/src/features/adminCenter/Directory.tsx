import { useId, useState } from 'react'
import type { OrganizationContext } from '../adminSchedule/types'
import {
  ActionForm,
  Badge,
  DataState,
  Modal,
  Pager,
  PendingCapability,
  label,
  textValue,
  time,
  useAdminData,
} from './shared'
import type { PageData, Row } from './shared'
import { DirectoryCreate } from './DirectoryCreate'
import { MediaThumbnail } from './MediaLibrary'

type Kind = 'users' | 'teams' | 'players'
type Field = {
  key: string
  title: string
  max?: number
  required?: boolean
  multiline?: boolean
  number?: boolean
  options?: string[]
}
const TEAM_FIELDS: Field[] = [
  { key: 'name', title: '球队名称', max: 160, required: true },
  { key: 'shortName', title: '简称', max: 80 },
  { key: 'collegeName', title: '学院', max: 160 },
  { key: 'motto', title: '球队口号', max: 160 },
  { key: 'description', title: '球队介绍', max: 600, multiline: true },
  { key: 'foundedYear', title: '成立年份', number: true },
  { key: 'primaryColor', title: '主色（如 #183f2a）', max: 16 },
  { key: 'secondaryColor', title: '辅色', max: 16 },
]
const PLAYER_FIELDS: Field[] = [
  { key: 'studentId', title: '学号', max: 32 },
  { key: 'displayName', title: '显示姓名', max: 120, required: true },
  { key: 'jerseyName', title: '球衣显示名', max: 120 },
  {
    key: 'position',
    title: '主位置',
    options: ['GOALKEEPER', 'DEFENDER', 'MIDFIELDER', 'FORWARD'],
  },
  {
    key: 'secondaryPosition',
    title: '第二位置',
    options: ['GOALKEEPER', 'DEFENDER', 'MIDFIELDER', 'FORWARD'],
  },
  { key: 'dominantFoot', title: '惯用脚', options: ['LEFT', 'RIGHT', 'BOTH'] },
  { key: 'heightCm', title: '身高（cm）', number: true },
  { key: 'academicYear', title: '入学年级', max: 32 },
  { key: 'major', title: '专业', max: 120 },
  { key: 'hometown', title: '家乡', max: 120 },
  { key: 'bio', title: '个人简介', max: 600, multiline: true },
]
function roles(row: Row) {
  const data = row.roles as { role: string }[] | undefined
  return data?.map((r) => label(r.role)).join('、') || '普通成员'
}
export function Directory({
  context,
  kind,
  initialSearch = '',
}: {
  context: OrganizationContext
  kind: Kind
  initialSearch?: string
}) {
  const [input, setInput] = useState(initialSearch)
  const [query, setQuery] = useState(initialSearch)
  const [page, setPage] = useState(1)
  const [status, setStatus] = useState('')
  const [selected, setSelected] = useState<Row | null>(null)
  const [operation, setOperation] = useState<'edit' | 'membership' | 'sessions' | null>(null)
  const [notice, setNotice] = useState('')
  const [creating, setCreating] = useState(false)
  const params = new URLSearchParams({
    page: String(page),
    pageSize: '10',
    query,
    ...(status ? { status } : {}),
  })
  const result = useAdminData<PageData>(context, `/admin/center/${kind}?${params}`)
  const title = kind === 'users' ? '组织账号' : kind === 'teams' ? '球队档案' : '球员档案'
  function done() {
    setOperation(null)
    setSelected(null)
    setNotice('操作已保存，正在重新读取后台数据。')
    result.refresh()
  }
  return (
    <>
      <section className="mc-panel">
        <div className="mc-panel-heading">
          <div>
            <h2>{title}</h2>
            <p>按稳定编号维护资料，所有修改需记录原因。</p>
          </div>
          <div className="mc-toolbar">
            {kind !== 'users' ? (
              <button
                onClick={() => {
                  setSelected(null)
                  setOperation(null)
                  setCreating(true)
                }}
              >
                {kind === 'teams' ? '新增球队' : '新增球员'}
              </button>
            ) : null}
            <button
              className="secondary-button"
              onClick={() => {
                setSelected(null)
                setOperation(null)
                setNotice('')
                result.refresh()
              }}
            >
              刷新
            </button>
          </div>
        </div>
        <form
          className="mc-toolbar"
          onSubmit={(e) => {
            e.preventDefault()
            setQuery(input.trim())
            setPage(1)
            setSelected(null)
          }}
        >
          <label className="mc-filter">
            <span className="mc-sr-only">搜索{title}</span>
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={kind === 'users' ? '搜索昵称或登录名' : '搜索名称或编号'}
            />
          </label>
          {kind === 'users' ? (
            <select
              aria-label="成员状态"
              value={status}
              onChange={(e) => {
                setStatus(e.target.value)
                setPage(1)
                setSelected(null)
              }}
            >
              <option value="">全部成员状态</option>
              <option value="ACTIVE">正常</option>
              <option value="SUSPENDED">已停用</option>
              <option value="PENDING">待审核</option>
              <option value="LEFT">已退出</option>
            </select>
          ) : null}
          <button type="submit">搜索</button>
        </form>
        {notice ? (
          <p className="mc-alert" role="status">
            {notice}
          </p>
        ) : null}
        <DataState {...result} empty={result.data?.items.length === 0} onRetry={result.refresh} />
        {result.data?.items.length ? (
          <>
            <div className="mc-table-wrap">
              <table className="mc-table">
                <thead>
                  <tr>
                    <th>{kind === 'teams' ? '球队' : kind === 'players' ? '球员' : '账号'}</th>
                    <th>
                      {kind === 'users' ? '组织角色' : kind === 'teams' ? '学院' : '位置 / 专业'}
                    </th>
                    <th>
                      {kind === 'users' ? '成员状态' : kind === 'teams' ? '当前成员' : '所属球队'}
                    </th>
                    <th>{kind === 'users' ? '有效会话' : '更新时间'}</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {result.data.items.map((row) => (
                    <tr key={row.id} className={selected?.id === row.id ? 'selected' : ''}>
                      <td>
                        <div className="mc-person-cell">
                          <span className="mc-avatar">
                            {String(row.name ?? row.displayName).slice(0, 1)}
                          </span>
                          <div>
                            <strong>{String(row.name ?? row.displayName)}</strong>
                            <small>
                              {String(
                                row.teamCode ??
                                  row.username ??
                                  row.jerseyName ??
                                  row.id.slice(0, 8),
                              )}
                            </small>
                          </div>
                        </div>
                      </td>
                      <td>
                        {kind === 'users' ? (
                          roles(row)
                        ) : kind === 'teams' ? (
                          textValue(row.collegeName)
                        ) : (
                          <>
                            {label(row.position)}
                            <small>{textValue(row.major)}</small>
                          </>
                        )}
                      </td>
                      <td>
                        {kind === 'users' ? (
                          <Badge value={row.membershipStatus} />
                        ) : kind === 'teams' ? (
                          `${textValue(row.memberCount)} 人`
                        ) : (
                          (row.teams as { name: string }[]).map((t) => t.name).join('、') ||
                          '未关联'
                        )}
                      </td>
                      <td>
                        {kind === 'users' ? textValue(row.activeSessionCount) : time(row.updatedAt)}
                      </td>
                      <td>
                        <button
                          className="mc-link-button"
                          onClick={() => {
                            setSelected(row)
                            setOperation(null)
                          }}
                        >
                          查看详情 ↗
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pager
              data={result.data}
              page={page}
              onPage={(v) => {
                setPage(v)
                setSelected(null)
              }}
            />
          </>
        ) : null}
      </section>
      {selected && !operation ? (
        <Modal
          title={kind === 'users' ? '账号详情' : kind === 'teams' ? '球队详情' : '球员详情'}
          onClose={() => setSelected(null)}
        >
          <section className="mc-panel mc-detail">
            <div className="mc-panel-heading">
              <div>
                <h2>{String(selected.name ?? selected.displayName)}</h2>
              </div>
              <button className="secondary-button" onClick={() => setSelected(null)}>
                收起详情
              </button>
            </div>
            {kind === 'teams' && (
              <div className="mc-entity-media">
                {(
                  [
                    ['crestUrl', '队徽'],
                    ['coverUrl', '球队背景'],
                  ] as const
                ).map(([field, title]) =>
                  selected[field] ? (
                    <article key={field}>
                      <strong>{title}</strong>
                      <MediaThumbnail
                        context={context}
                        url={String(selected[field])}
                        large
                        previewable
                      />
                    </article>
                  ) : null,
                )}
              </div>
            )}
            <dl className="mc-facts">
              {(kind === 'users'
                ? [
                    ['登录名', selected.username],
                    ['学号（脱敏）', selected.studentIdMasked],
                    ['邮箱（脱敏）', selected.emailMasked],
                    ['组织角色', roles(selected)],
                    ['账号状态', label(selected.userStatus)],
                    ['组织成员状态', label(selected.membershipStatus)],
                    [
                      '关联球员',
                      (selected.linkedPlayer as { displayName: string } | null)?.displayName,
                    ],
                    ['有效会话', selected.activeSessionCount],
                  ]
                : (kind === 'teams' ? TEAM_FIELDS : PLAYER_FIELDS).map((f) => [
                    f.title,
                    f.key === 'dominantFoot' && selected[f.key] === 'LEFT'
                      ? '左脚'
                      : f.options
                        ? label(selected[f.key])
                        : selected[f.key],
                  ])
              ).map(([key, value]) => (
                <div key={String(key)}>
                  <dt>{String(key)}</dt>
                  <dd>{textValue(value)}</dd>
                </div>
              ))}
            </dl>
            <div className="mc-actions">
              {kind !== 'users' ? (
                <button onClick={() => setOperation('edit')}>编辑资料</button>
              ) : (
                <>
                  <button
                    className="secondary-button"
                    onClick={() => setOperation('sessions')}
                    disabled={selected.activeSessionCount === 0 || selected.id === context.userId}
                  >
                    撤销本组织登录会话
                  </button>
                  <button
                    className="secondary-button"
                    disabled={
                      selected.id === context.userId ||
                      !['ACTIVE', 'SUSPENDED'].includes(String(selected.membershipStatus)) ||
                      (selected.roles as { role: string }[]).some((r) =>
                        ['ORGANIZATION_ADMIN', 'PLATFORM_ADMIN'].includes(r.role),
                      )
                    }
                    onClick={() => setOperation('membership')}
                  >
                    {selected.membershipStatus === 'SUSPENDED' ? '恢复组织访问' : '停用组织访问'}
                  </button>
                </>
              )}
            </div>
            {kind === 'users' ? (
              <PendingCapability
                title="密码恢复与角色调整"
                description="一次性密码重置、身份核验和角色授权待专门后台流程接通。当前可停用本组织成员、撤销其本组织登录会话；账号主队偏好不影响工作人员权限。"
              />
            ) : (
              <p className="mc-muted">本次修改公开档案，不覆盖已锁定的参赛名单和历史比赛事实。</p>
            )}
          </section>
        </Modal>
      ) : null}
      {creating && kind !== 'users' ? (
        <Modal
          title={kind === 'teams' ? '新增球队档案' : '新增球员档案'}
          onClose={() => setCreating(false)}
        >
          <DirectoryCreate
            context={context}
            kind={kind}
            onDone={() => {
              setCreating(false)
              setInput('')
              setQuery('')
              setPage(1)
              setNotice(
                kind === 'teams'
                  ? '球队档案已创建，可在前端球队目录查看；尚未报名赛事。'
                  : '球员已创建并加入球队，可在前端查看；参赛资格需另行审核。',
              )
              result.refresh()
            }}
          />
        </Modal>
      ) : null}
      {selected && operation ? (
        <Modal
          title={
            operation === 'edit'
              ? '编辑公开档案'
              : operation === 'membership'
                ? selected.membershipStatus === 'SUSPENDED'
                  ? '恢复组织访问'
                  : '停用组织访问'
                : '撤销本组织登录会话'
          }
          onClose={() => setOperation(null)}
        >
          {operation === 'edit' ? (
            <EditProfile
              context={context}
              kind={kind === 'teams' ? 'teams' : 'players'}
              row={selected}
              onDone={done}
            />
          ) : (
            <ActionForm
              context={context}
              path={`/admin/center/users/${selected.id}/${operation === 'membership' ? 'membership' : 'revoke-sessions'}`}
              body={
                operation === 'membership'
                  ? {
                      expectedUpdatedAt: selected.membershipUpdatedAt,
                      status: selected.membershipStatus === 'SUSPENDED' ? 'ACTIVE' : 'SUSPENDED',
                    }
                  : {}
              }
              submitLabel="确认操作"
              onDone={done}
            >
              <p>
                {operation === 'sessions'
                  ? '该成员在本组织的所有有效登录会话将失效，用户需要重新登录。'
                  : selected.membershipStatus === 'SUSPENDED'
                    ? '该成员将重新获得本组织访问权限。'
                    : '该成员将无法继续访问本组织，并撤销其在本组织的有效登录会话。'}
              </p>
              <strong>
                {String(selected.displayName)} · {selected.id}
              </strong>
            </ActionForm>
          )}
        </Modal>
      ) : null}
    </>
  )
}
function EditProfile({
  context,
  kind,
  row,
  onDone,
}: {
  context: OrganizationContext
  kind: 'teams' | 'players'
  row: Row
  onDone: () => void
}) {
  const fieldId = useId()
  const fields = kind === 'teams' ? TEAM_FIELDS : PLAYER_FIELDS
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(fields.map((f) => [f.key, row[f.key] == null ? '' : String(row[f.key])])),
  )
  const patch = Object.fromEntries(
    fields
      .filter((f) => values[f.key] !== (row[f.key] == null ? '' : String(row[f.key])))
      .map((f) => [
        f.key,
        values[f.key] === '' ? null : f.number ? Number(values[f.key]) : values[f.key]!.trim(),
      ]),
  )
  return (
    <ActionForm
      context={context}
      path={`/admin/center/${kind}/${row.id}`}
      method="PATCH"
      body={{ expectedUpdatedAt: row.updatedAt, patch }}
      submitLabel="保存修改"
      onDone={onDone}
    >
      <div className="mc-form-grid">
        {fields.map((f) => (
          <label className={`mc-field ${f.multiline ? 'mc-wide' : ''}`} key={f.key}>
            <span id={`${fieldId}-${f.key}`}>{f.title}</span>
            {f.multiline ? (
              <textarea
                aria-labelledby={`${fieldId}-${f.key}`}
                maxLength={f.max}
                value={values[f.key]}
                onChange={(e) => setValues({ ...values, [f.key]: e.target.value })}
              />
            ) : f.options ? (
              <select
                aria-labelledby={`${fieldId}-${f.key}`}
                value={values[f.key]}
                onChange={(e) => setValues({ ...values, [f.key]: e.target.value })}
              >
                <option value="">未填写</option>
                {f.options.map((v) => (
                  <option key={v} value={v}>
                    {f.key === 'dominantFoot' && v === 'LEFT' ? '左脚' : label(v)}
                  </option>
                ))}
              </select>
            ) : (
              <input
                aria-labelledby={`${fieldId}-${f.key}`}
                required={f.required}
                maxLength={f.max}
                type={f.number ? 'number' : 'text'}
                value={values[f.key]}
                onChange={(e) => setValues({ ...values, [f.key]: e.target.value })}
              />
            )}
          </label>
        ))}
      </div>
      <p className="mc-muted">保存前会检查资料版本，防止多人修改时互相覆盖。</p>
    </ActionForm>
  )
}
