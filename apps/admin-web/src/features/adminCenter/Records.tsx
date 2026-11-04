import { useState } from 'react'
import type { OrganizationContext } from '../adminSchedule/types'
import {
  Badge,
  DataState,
  Pager,
  PendingCapability,
  Modal,
  textValue,
  time,
  useAdminData,
} from './shared'
import type { PageData, Row } from './shared'
import { ActivityLog } from './ActivityLog'

interface SystemData {
  api: { status: string; version: string; checkedAt: string }
  database: { status: string; latencyMs: number }
  worker: { status: string; reason: string; lastProcessedAt: string | null }
  outbox: {
    counts: Record<string, number>
    total: number
    pendingCount: number
    failedCount: number
    oldestPendingAt: string | null
    recentFailures: Row[]
  }
  storage: { status: string; reason: string }
  backup: { status: string; reason: string }
}
const KIND_LABELS: Record<string, string> = {
  USER_AVATAR: '账号头像',
  PLAYER_AVATAR: '球员头像',
  PLAYER_PORTRAIT: '球员形象',
  TEAM_CREST: '球队队徽',
  TEAM_BACKGROUND: '球队背景',
  POST_IMAGE: '动态图片',
  PUBLIC: '公开引用',
  HIDDEN: '隐藏内容引用',
}
export function Records({
  context,
  kind,
}: {
  context: OrganizationContext
  kind: 'media' | 'audit' | 'system'
}) {
  return kind === 'system' ? (
    <System context={context} />
  ) : kind === 'audit' ? <ActivityLog context={context} /> : (
    <RecordList context={context} kind={kind} />
  )
}
function RecordList({ context, kind }: { context: OrganizationContext; kind: 'media' | 'audit' }) {
  const [page, setPage] = useState(1)
  const [query, setQuery] = useState('')
  const [input, setInput] = useState('')
  const [selected, setSelected] = useState<Row | null>(null)
  const result = useAdminData<PageData>(
    context,
    `/admin/center/${kind}?${new URLSearchParams({ page: String(page), pageSize: '10', query })}`,
  )
  return (
    <>
      <section className="mc-panel">
        <div className="mc-panel-heading">
          <div>
            <h2>{kind === 'audit' ? '关键操作记录' : '当前媒体引用'}</h2>
            <p>
              {kind === 'audit'
                ? '按组织读取关键操作，敏感明细不在通用审计中显示。'
                : '这里展示数据库中当前引用的图片，不代表完整文件清单。'}
            </p>
          </div>
          <button className="secondary-button" onClick={result.refresh}>
            刷新
          </button>
        </div>
        <form
          className="mc-toolbar"
          onSubmit={(e) => {
            e.preventDefault()
            setPage(1)
            setSelected(null)
            setQuery(input.trim())
          }}
        >
          <input
            aria-label={kind === 'audit' ? '搜索操作记录' : '搜索媒体引用'}
            placeholder={kind === 'audit' ? '搜索动作、对象编号或处理原因' : '搜索所属对象'}
            value={input}
            onChange={(e) => setInput(e.target.value)}
          />
          <button type="submit">搜索</button>
        </form>
        <DataState {...result} empty={result.data?.items.length === 0} onRetry={result.refresh} />
        {result.data?.items.length ? (
          <>
            <div className="mc-table-wrap">
              <table className="mc-table">
                <thead>
                  <tr>
                    <th>{kind === 'audit' ? '操作' : '所属对象'}</th>
                    <th>{kind === 'audit' ? '操作者' : '用途'}</th>
                    <th>{kind === 'audit' ? '对象' : '引用状态'}</th>
                    <th>时间</th>
                    <th>详情</th>
                  </tr>
                </thead>
                <tbody>
                  {result.data.items.map((r) => (
                    <tr key={r.id}>
                      <td>
                        <strong>{textValue(kind === 'audit' ? r.action : r.ownerName)}</strong>
                        <small>
                          {kind === 'audit' ? textValue(r.reason) : textValue(r.ownerId)}
                        </small>
                      </td>
                      <td>
                        {kind === 'audit'
                          ? textValue(r.actorName || r.actorType)
                          : KIND_LABELS[String(r.kind)] || String(r.kind)}
                      </td>
                      <td>
                        {kind === 'audit' ? (
                          <>
                            {textValue(r.targetType)}
                            <small>{textValue(r.targetId)}</small>
                          </>
                        ) : (
                          <span className="mc-badge">
                            {KIND_LABELS[String(r.visibility)] || String(r.visibility)}
                          </span>
                        )}
                      </td>
                      <td>{time(r.createdAt || r.updatedAt)}</td>
                      <td>
                        <button className="mc-link-button" onClick={() => setSelected(r)}>
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
      {selected ? (
        <Modal
          title={kind === 'audit' ? '操作详情' : '媒体引用详情'}
          variant="drawer"
          onClose={() => setSelected(null)}
        >
          <section className="mc-panel mc-detail">
            <div className="mc-panel-heading">
              <h2>{kind === 'audit' ? '操作详情' : '媒体引用详情'}</h2>
              <button className="secondary-button" onClick={() => setSelected(null)}>
                收起详情
              </button>
            </div>
            {kind === 'audit' ? (
              <>
                <dl className="mc-facts">
                  {[
                    ['记录编号', selected.id],
                    ['操作者编号', selected.actorUserId],
                    ['动作', selected.action],
                    ['对象类型', selected.targetType],
                    ['对象编号', selected.targetId],
                    ['修改原因', selected.reason],
                    ['请求编号', selected.requestId],
                    ['时间', time(selected.createdAt)],
                  ].map(([k, v]) => (
                    <div key={String(k)}>
                      <dt>{String(k)}</dt>
                      <dd>{textValue(v)}</dd>
                    </div>
                  ))}
                </dl>
                <div className="mc-compare">
                  <div>
                    <h3>修改前（可公开摘要）</h3>
                    <pre>{JSON.stringify(selected.before, null, 2) || '未记录安全摘要'}</pre>
                  </div>
                  <div>
                    <h3>修改后（可公开摘要）</h3>
                    <pre>{JSON.stringify(selected.after, null, 2) || '未记录安全摘要'}</pre>
                  </div>
                </div>
                <p className="mc-muted">
                  旧记录只显示服务端允许的状态与版本字段。比赛完整历史在“赛事与比赛 /
                  比赛战报”查看。
                </p>
              </>
            ) : (
              <dl className="mc-facts">
                <div>
                  <dt>所属对象</dt>
                  <dd>{textValue(selected.ownerName)}</dd>
                </div>
                <div>
                  <dt>对象编号</dt>
                  <dd>{textValue(selected.ownerId)}</dd>
                </div>
                <div className="mc-wide">
                  <dt>图片引用</dt>
                  <dd className="mc-break">{textValue(selected.url)}</dd>
                </div>
                <div>
                  <dt>用途</dt>
                  <dd>{KIND_LABELS[String(selected.kind)]}</dd>
                </div>
                <div>
                  <dt>引用状态</dt>
                  <dd>{KIND_LABELS[String(selected.visibility)]}</dd>
                </div>
              </dl>
            )}
          </section>
        </Modal>
      ) : null}
      {kind === 'media' ? (
        <PendingCapability
          title="媒体上传、容量与恢复"
          description="统一上传清单、私有证件、引用复核删除、配额和恢复窗口需要媒体资产服务；当前仅查询已有公开图片引用，不执行文件删除。"
        />
      ) : (
        <p className="mc-muted">操作记录只读。当前记录覆盖关键业务动作，不记录输入框的每次按键。</p>
      )}
    </>
  )
}
function System({ context }: { context: OrganizationContext }) {
  const result = useAdminData<SystemData>(context, '/admin/center/system')
  const data = result.data
  return (
    <>
      <section className="mc-panel">
        <div className="mc-panel-heading">
          <div>
            <h2>运行状态</h2>
            <p>以当前后台检查结果为准。</p>
          </div>
          <button className="secondary-button" onClick={result.refresh}>
            重新检查
          </button>
        </div>
        <DataState {...result} onRetry={result.refresh} />
        {data ? (
          <>
            <div className="mc-system-grid">
              <div>
                <span className="mc-muted">API 服务</span>
                <h3>{data.api.status === 'ok' ? '可用' : data.api.status}</h3>
                <p>
                  版本 {data.api.version || '未报告'}
                  <br />
                  检查于 {time(data.api.checkedAt)}
                </p>
              </div>
              <div>
                <span className="mc-muted">数据库</span>
                <h3>{data.database.status === 'ok' ? '连接正常' : data.database.status}</h3>
                <p>本次读取 {data.database.latencyMs} ms</p>
              </div>
              <div>
                <span className="mc-muted">异步 Worker</span>
                <h3>{data.worker.status === 'UNKNOWN' ? '运行状态未确认' : data.worker.status}</h3>
                <p>
                  {data.worker.reason}
                  <br />
                  最近完成任务 {time(data.worker.lastProcessedAt)}
                </p>
              </div>
            </div>
            <div className="mc-task-stats">
              <div>
                <strong>{data.outbox.pendingCount}</strong>
                <span>待处理任务</span>
              </div>
              <div>
                <strong>{data.outbox.failedCount}</strong>
                <span>失败任务</span>
              </div>
              <div>
                <strong>{data.outbox.total}</strong>
                <span>组织任务总数</span>
              </div>
            </div>
            <p className="mc-muted mc-pad">最早待处理任务：{time(data.outbox.oldestPendingAt)}</p>
            <div className="mc-table-wrap">
              <table className="mc-table">
                <thead>
                  <tr>
                    <th>失败任务</th>
                    <th>状态</th>
                    <th>尝试次数</th>
                    <th>错误码</th>
                    <th>时间</th>
                  </tr>
                </thead>
                <tbody>
                  {data.outbox.recentFailures.map((r) => (
                    <tr key={r.id}>
                      <td>
                        <strong>{textValue(r.eventType)}</strong>
                        <small>{textValue(r.topic)}</small>
                      </td>
                      <td>
                        <Badge value={r.status} />
                      </td>
                      <td>{textValue(r.attemptCount)}</td>
                      <td>{textValue(r.lastErrorCode)}</td>
                      <td>{time(r.updatedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!data.outbox.recentFailures.length ? (
                <p className="mc-muted mc-pad">当前组织没有失败任务记录。</p>
              ) : null}
            </div>
          </>
        ) : null}
      </section>
      <PendingCapability
        title="媒体存储监测"
        description={
          data?.storage.reason ||
          '容量、失效文件与生产持久化尚未接通；没有测量结果时不显示容量数字。'
        }
      />
      <PendingCapability
        title="备份与恢复"
        description={
          data?.backup.reason ||
          '自动备份与数据库/媒体恢复演练尚未接通，当前不能确认最后成功备份时间。'
        }
      />
    </>
  )
}
