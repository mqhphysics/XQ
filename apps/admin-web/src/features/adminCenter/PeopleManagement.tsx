import { AdminMessage } from './AdminMessage'
import { useState } from 'react'
import type { OrganizationContext } from '../adminSchedule/types'
import { ActionForm, Badge, DataState, Modal, Pager, time, useAdminData, label } from './shared'
import type { PageData, Row } from './shared'

export function PeopleManagement({
  context,
  initialSearch = '',
}: {
  context: OrganizationContext
  initialSearch?: string
}) {
  const [page, setPage] = useState(1),
    [query, setQuery] = useState(initialSearch),
    [input, setInput] = useState(initialSearch),
    [chosen, setChosen] = useState<Row | null>(null),
    [provisioning, setProvisioning] = useState(false),
    [createCount, setCreateCount] = useState(60)
  const list = useAdminData<PageData>(
    context,
    `/admin/center/users?${new URLSearchParams({ page: String(page), pageSize: '25', query })}`,
  )
  return (
    <>
      <section className="mc-panel">
        <div className="mc-panel-heading">
          <div>
            <h2>用户资料与账号管理</h2>
            <p>查看完整资料、活动和后台分配的登录密码，也可为球员创建账号。</p>
          </div>
          <div className="mc-actions">
            <button onClick={() => setProvisioning(true)}>为球员创建账号</button>
            <button className="secondary-button" onClick={list.refresh}>
              刷新
            </button>
          </div>
        </div>
        <form
          className="mc-toolbar"
          onSubmit={(e) => {
            e.preventDefault()
            setPage(1)
            setQuery(input.trim())
          }}
        >
          <input
            aria-label="搜索用户"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="姓名、用户名、学号或邮箱"
          />
          <button>搜索</button>
        </form>
        <DataState {...list} empty={list.data?.items.length === 0} onRetry={list.refresh} />
        {list.data ? (
          <>
            <div className="mc-table-wrap">
              <table className="mc-table">
                <thead>
                  <tr>
                    <th>用户</th>
                    <th>真实姓名</th>
                    <th>学号</th>
                    <th>邮箱</th>
                    <th>组织状态</th>
                    <th>操作</th>
                    <th>登录信息</th>
                  </tr>
                </thead>
                <tbody>
                  {list.data.items.map((user) => (
                    <tr key={user.id} className="mc-clickable-row" onClick={() => setChosen(user)}>
                      <td>
                        <strong>{String(user.displayName)}</strong>
                        <small>{String(user.username)}</small>
                      </td>
                      <td>{String(user.realName ?? '未填写')}</td>
                      <td>{String(user.studentId ?? '未填写')}</td>
                      <td>{String(user.email ?? '未填写')}</td>
                      <td>
                        <UserState status={String(user.membershipStatus)} />
                      </td>
                      <td>
                        <button className="mc-link-button" onClick={() => setChosen(user)}>
                          资料 / 活动 / 管理 ↗
                        </button>
                      </td>
                      <td>
                        <button
                          className="mc-link-button"
                          onClick={() => setChosen({ ...user, requestedTab: 'login' })}
                        >
                          查看密码
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pager data={list.data} page={page} onPage={setPage} />
          </>
        ) : null}
      </section>
      {chosen ? (
        <UserDetail
          key={chosen.id}
          context={context}
          row={chosen}
          onClose={() => setChosen(null)}
          onChanged={() => {
            setChosen(null)
            list.refresh()
          }}
        />
      ) : null}
      {provisioning ? (
        <Modal title="为球员创建登录账号" onClose={() => setProvisioning(false)}>
          <ActionForm
            context={context}
            path="/admin/center/users/provision-from-players"
            body={{ count: createCount }}
            submitLabel={`创建${createCount}个账号`}
            onDone={() => {
              setProvisioning(false)
              list.refresh()
            }}
          >
            <label className="mc-field">
              <span>创建数量（1–60）</span>
              <input
                aria-label="创建账号数量"
                type="number"
                min={1}
                max={60}
                required
                value={createCount}
                onChange={(e) => setCreateCount(Number(e.target.value))}
              />
            </label>
            <p>
              从当前组织尚未绑定账号的球员中创建，分配独立六位随机密码。优先用学号登录，不编造邮箱，不更改现有账号或授予管理权限。
            </p>
          </ActionForm>
        </Modal>
      ) : null}
    </>
  )
}
function UserState({ status }: { status: string }) {
  return status === 'SUSPENDED' ? (
    <span className="mc-badge mc-status-suspended">已冻结</span>
  ) : status === 'LEFT' ? (
    <span className="mc-badge mc-status-hidden">已封禁 / 已退出</span>
  ) : (
    <Badge value={status} />
  )
}
export function UserDetail({
  context,
  row,
  onClose,
  onChanged,
}: {
  context: OrganizationContext
  row: Row
  onClose: () => void
  onChanged: () => void
}) {
  const data = useAdminData<Row>(context, `/admin/center/users/${row.id}`)
  const [tab, setTab] = useState(String(row.requestedTab ?? 'info')),
    [action, setAction] = useState<'FREEZE' | 'BAN' | 'RESTORE' | null>(null),
    [editing, setEditing] = useState(false)
  const [systemMessage, setSystemMessage] = useState(false)
  const target = data.data ?? row
  const protectedUser =
    row.id === context.userId ||
    ((target.roles ?? []) as { role: string }[]).some((r) =>
      ['ORGANIZATION_ADMIN', 'PLATFORM_ADMIN'].includes(r.role),
    )
  return (
    <Modal title={String(row.displayName)} onClose={onClose}>
      {systemMessage && (
        <AdminMessage
          context={context}
          recipient={{ id: row.id, displayName: String(row.displayName) }}
          system
          onClose={() => setSystemMessage(false)}
        />
      )}
      <div className="mc-tabs gov-detail-tabs">
        <button className={tab === 'info' ? 'active' : ''} onClick={() => setTab('info')}>
          完整资料
        </button>
        <button className={tab === 'activity' ? 'active' : ''} onClick={() => setTab('activity')}>
          活动记录
        </button>
        <button className={tab === 'sessions' ? 'active' : ''} onClick={() => setTab('sessions')}>
          登录会话
        </button>
        <button className={tab === 'login' ? 'active' : ''} onClick={() => setTab('login')}>
          登录密码
        </button>
      </div>
      <DataState {...data} onRetry={data.refresh} />
      {editing ? (
        <EditUser context={context} row={target} onDone={onChanged} />
      ) : action ? (
        <ActionForm
          context={context}
          path={`/admin/center/users/${row.id}/sanctions`}
          body={{ action, expectedUpdatedAt: target.membershipUpdatedAt }}
          submitLabel={
            action === 'BAN'
              ? '确认封禁账号'
              : action === 'FREEZE'
                ? '确认冻结账号'
                : '确认恢复访问'
          }
          onDone={onChanged}
        >
          <p>
            {action === 'RESTORE'
              ? '恢复该用户在本组织的访问。'
              : '将撤销该用户本组织的登录会话，禁止继续登录和账号操作。历史资料与记录保留。'}
          </p>
          <UserState status={String(target.membershipStatus)} />
        </ActionForm>
      ) : tab === 'login' ? (
        <LoginInformation context={context} row={target} onReset={data.refresh} />
      ) : tab === 'activity' ? (
        <Activity context={context} id={row.id} />
      ) : tab === 'sessions' ? (
        <div className="gov-detail-body">
          <h3>已记录的登录会话</h3>
          {(target.sessions as Row[] | undefined)?.map((s) => (
            <div key={s.id} className="gov-activity">
              <strong>{s.revokedAt ? '已撤销' : '会话记录'}</strong>
              <span>{time(s.createdAt)}</span>
              <p>
                IP：{String(s.ipAddress ?? '未记录')}
                <br />
                客户端：{String(s.userAgent ?? '未记录')}
                <br />
                最近活动：{time(s.lastSeenAt)}
              </p>
            </div>
          ))}
        </div>
      ) : (
        <div className="gov-detail-body">
          <dl className="mc-facts">
            {[
              ['用户名', target.username],
              ['昵称', target.displayName],
              ['真实姓名', target.realName],
              ['学号', target.studentId],
              ['邮箱', target.email],
              ['简介', target.bio],
              ['关联球员编号', target.playerProfileId],
              ['创建时间', time(target.createdAt)],
            ].map(([key, value]) => (
              <div key={String(key)}>
                <dt>{String(key)}</dt>
                <dd>{String(value ?? '未填写')}</dd>
              </div>
            ))}
          </dl>
          <div className="mc-actions">
            <button className="secondary-button" onClick={() => setSystemMessage(true)}>
              发送系统通知
            </button>
            <button disabled={!data.data} onClick={() => setEditing(true)}>
              编辑用户资料
            </button>
            <button
              className="secondary-button"
              disabled={protectedUser}
              onClick={() => setAction('FREEZE')}
            >
              冻结账号
            </button>
            <button
              className="secondary-button"
              disabled={protectedUser}
              onClick={() => setAction('BAN')}
            >
              封禁账号
            </button>
            <button
              className="secondary-button"
              disabled={protectedUser || target.membershipStatus === 'ACTIVE'}
              onClick={() => setAction('RESTORE')}
            >
              恢复访问
            </button>
          </div>
          <p className="mc-muted">
            冻结是暂时停用；封禁是长期禁止本组织访问。两者都会撤销有效会话，恢复须记录原因。
          </p>
        </div>
      )}
    </Modal>
  )
}
const fields = [
  ['username', '用户名'],
  ['displayName', '昵称'],
  ['realName', '真实姓名'],
  ['studentId', '学号'],
  ['email', '邮箱'],
  ['bio', '简介'],
  ['playerProfileId', '关联球员稳定编号'],
] as const
function LoginInformation({
  context,
  row,
  onReset,
}: {
  context: OrganizationContext
  row: Row
  onReset: () => void
}) {
  const information = useAdminData<{
    username: string | null
    available: boolean
    password: string | null
    assignedAt: string | null
    description: string
  }>(context, `/admin/center/users/${row.id}/login-access`)
  const [resetting, setResetting] = useState(false)
  return (
    <div className="gov-detail-body">
      <h3>登录信息</h3>
      <DataState {...information} onRetry={information.refresh} />
      {information.data ? (
        <>
          <dl className="mc-facts">
            <div>
              <dt>用户名</dt>
              <dd>{information.data.username ?? '未设置，可用已绑定的学号或邮箱'}</dd>
            </div>
            <div>
              <dt>六位登录密码</dt>
              <dd>
                <code style={{ fontSize: 24, letterSpacing: 3, userSelect: 'all' }}>
                  {information.data.password ?? '尚无可查看的分配记录'}
                </code>
              </dd>
            </div>
            <div>
              <dt>分配时间</dt>
              <dd>{time(information.data.assignedAt)}</dd>
            </div>
          </dl>
          <p className="mc-muted">{information.data.description}</p>
        </>
      ) : null}
      {resetting ? (
        <ActionForm
          context={context}
          path={`/admin/center/users/${row.id}/login-password`}
          body={{ expectedUpdatedAt: row.updatedAt }}
          submitLabel="确认分配新的六位密码"
          onDone={() => {
            setResetting(false)
            information.refresh()
            onReset()
          }}
        >
          <p>原密码立即失效，其他登录会话会被撤销。当前管理员自己的管理会话保留。</p>
        </ActionForm>
      ) : (
        <button
          className="secondary-button"
          disabled={!row.updatedAt}
          onClick={() => setResetting(true)}
        >
          分配新的六位随机密码
        </button>
      )}
    </div>
  )
}
function EditUser({
  context,
  row,
  onDone,
}: {
  context: OrganizationContext
  row: Row
  onDone: () => void
}) {
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(fields.map(([key]) => [key, String(row[key] ?? '')])),
  )
  const patch = Object.fromEntries(
    fields
      .filter(([key]) => values[key] !== String(row[key] ?? ''))
      .map(([key]) => [key, values[key]?.trim() || null]),
  )
  return (
    <ActionForm
      context={context}
      path={`/admin/center/users/${row.id}`}
      method="PATCH"
      body={{ patch, expectedUpdatedAt: row.updatedAt }}
      submitLabel="保存用户资料"
      onDone={onDone}
    >
      <div className="mc-form-grid">
        {fields.map(([key, title]) => (
          <label className="mc-field" key={key}>
            <span>{title}</span>
            {key === 'bio' ? (
              <textarea
                aria-label={title}
                maxLength={280}
                value={values[key]}
                onChange={(e) => setValues({ ...values, [key]: e.target.value })}
              />
            ) : (
              <input
                aria-label={title}
                value={values[key]}
                type={key === 'email' ? 'email' : 'text'}
                onChange={(e) => setValues({ ...values, [key]: e.target.value })}
                maxLength={
                  key === 'email' ? 254 : ['studentId', 'username'].includes(key) ? 32 : 120
                }
              />
            )}
          </label>
        ))}
      </div>
      <p className="mc-muted">
        按当前账号编号修改。学号、邮箱和球员关联若冲突，后台会拒绝保存；不会按同名覆盖另一人。
      </p>
    </ActionForm>
  )
}
function Activity({ context, id }: { context: OrganizationContext; id: string }) {
  const [page, setPage] = useState(1)
  const result = useAdminData<PageData & { coverage: string }>(
    context,
    `/admin/center/users/${id}/activity?page=${page}&pageSize=25`,
  )
  return (
    <div className="gov-detail-body">
      <h3>已保存的活动记录</h3>
      <p className="mc-muted">{result.data?.coverage ?? '只显示已保存的记录，不补造历史操作。'}</p>
      <DataState {...result} empty={result.data?.items.length === 0} onRetry={result.refresh} />
      {result.data ? (
        <>
          {result.data.items.map((item) => (
            <article key={`${item.kind}:${item.id}`} className="gov-activity">
              <div>
                <strong>{label(item.action)}</strong>
                <time>{time(item.occurredAt)}</time>
              </div>
              <p>{String(item.summary ?? '')}</p>
              <small>
                {String(item.source)} · {String(item.targetType)} · {String(item.targetId)}
              </small>
            </article>
          ))}
          <Pager data={result.data} page={page} onPage={setPage} />
        </>
      ) : null}
    </div>
  )
}
