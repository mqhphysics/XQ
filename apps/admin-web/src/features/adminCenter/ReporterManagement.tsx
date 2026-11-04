import { useState } from 'react'
import type { OrganizationContext } from '../adminSchedule/types'
import { ActionForm, Badge, DataState, Modal, time, useAdminData } from './shared'
import './campus-management.css'

interface Profile {
  id: string
  userId: string
  score: number
  status: string
  probationUntil: string | null
  consecutiveQualified: number
  lastContributionAt: string | null
  user: { displayName: string; realName: string | null }
}
interface Correction {
  id: string
  profileId: string
  matchId: string
  reportRevisionId: string
  matchTitle: string
  reportVersion: number | null
  description: string
  errorKey: string
  evidence: string[]
  status: string
  version: number
  reviewNote: string | null
  appeal: string | null
  createdAt: string
}
interface Application {
  id: string
  profileId: string
  reason: string
  status: string
  version: number
  reviewNote: string | null
  createdAt: string
}
interface Data {
  profiles: Profile[]
  cases: Correction[]
  applications: Application[]
}
const statuses: Record<string, string> = {
  ACTIVE: '正常',
  PROBATION: '复训考察',
  FROZEN: '已冻结',
  COOLDOWN: '等待解冻',
  BANNED: '资格封禁',
  OPEN: '待核实',
  CONFIRMED: '差错成立',
  DISMISSED: '不成立',
  OVERTURNED: '已撤销',
  SUBMITTED: '待复核',
  APPROVED: '已批准',
  REJECTED: '未批准',
}
export function ReporterManagement({
  context,
  initialTab = 'people',
}: {
  context: OrganizationContext
  initialTab?: 'people' | 'cases' | 'applications'
}) {
  const result = useAdminData<Data>(context, '/admin/campus/reporters')
  const [tab, setTab] = useState<'people' | 'cases' | 'applications'>(initialTab),
    [chosen, setChosen] = useState<Correction | null>(null),
    [application, setApplication] = useState<Application | null>(null),
    [decision, setDecision] = useState('CONFIRMED')
  const data = result.data
  const name = (id: string) => {
    const p = data?.profiles.find((p) => p.id === id)
    return p?.user.realName ?? p?.user.displayName ?? '信息员'
  }
  return (
    <section className="mc-panel">
      <div className="mc-panel-heading">
        <div>
          <h2>信息员与记录质量</h2>
          <p>先核实比赛记录，再处理分数；每一次变更都有依据和流水。</p>
        </div>
        <button className="secondary-button" onClick={result.refresh}>
          刷新
        </button>
      </div>
      <div className="campus-rule-strip">
        <span>
          <strong>100</strong> 初始分
        </span>
        <span>
          <strong>−10</strong> 确认差错
        </span>
        <span>
          <strong>+10</strong> 连续三场合格
        </span>
        <span>
          <strong>−20</strong> 复训考察期差错
        </span>
      </div>
      <div className="campus-tabs" role="tablist" aria-label="信息员管理">
        <button role="tab" aria-selected={tab === 'people'} onClick={() => setTab('people')}>
          信息员
        </button>
        <button role="tab" aria-selected={tab === 'cases'} onClick={() => setTab('cases')}>
          纠错核实{' '}
          {data?.cases.filter((c) => c.status === 'OPEN' || (c.appeal && c.status === 'CONFIRMED'))
            .length || ''}
        </button>
        <button
          role="tab"
          aria-selected={tab === 'applications'}
          onClick={() => setTab('applications')}
        >
          复训申请 {data?.applications.filter((a) => a.status === 'SUBMITTED').length || ''}
        </button>
      </div>
      <DataState {...result} onRetry={result.refresh} />
      {data && tab === 'people' && (
        <div className="mc-table-wrap">
          <table className="mc-table">
            <thead>
              <tr>
                <th>信息员</th>
                <th>记录质量分</th>
                <th>身份状态</th>
                <th>合格记录进度</th>
                <th>最近贡献</th>
                <th>考察期</th>
              </tr>
            </thead>
            <tbody>
              {data.profiles.map((p) => (
                <tr key={p.id}>
                  <td>
                    <strong>{p.user.realName ?? p.user.displayName}</strong>
                    <small>{p.user.displayName}</small>
                  </td>
                  <td>
                    <span className={`campus-score ${p.score < 60 ? 'is-low' : ''}`}>
                      {p.score}
                      <small>/100</small>
                    </span>
                  </td>
                  <td>
                    <Badge value={statuses[p.status] ?? p.status} />
                  </td>
                  <td>{p.consecutiveQualified} / 3 场</td>
                  <td>{p.lastContributionAt ? time(p.lastContributionAt) : '尚未提供记录'}</td>
                  <td>
                    {p.status === 'PROBATION' && p.probationUntil ? (
                      <>
                        不早于{time(p.probationUntil)}
                        <small>还需完整正式赛季核验</small>
                      </>
                    ) : (
                      '—'
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!data.profiles.length && (
            <p className="campus-empty-note">
              尚未分配信息员身份。可在账号与身份管理中核验和授予。
            </p>
          )}
        </div>
      )}
      {data && tab === 'cases' && (
        <div className="campus-case-list">
          {data.cases.map((c) => (
            <article key={c.id}>
              <div>
                <Badge value={statuses[c.status] ?? c.status} />
                <span>
                  {name(c.profileId)} · {time(c.createdAt)}
                </span>
              </div>
              <h3>{c.description}</h3>
              <p>
                {c.matchTitle} · 报告第{c.reportVersion ?? '—'}版
              </p>
              {c.reviewNote && <p>复核意见：{c.reviewNote}</p>}
              {c.appeal && <p className="campus-appeal">信息员申诉：{c.appeal}</p>}
              {(c.status === 'OPEN' || (c.status === 'CONFIRMED' && c.appeal)) && (
                <button
                  onClick={() => {
                    setChosen(c)
                    setDecision(c.appeal ? 'OVERTURNED' : 'CONFIRMED')
                  }}
                >
                  {c.appeal ? '复核申诉' : '核实处理'}
                </button>
              )}
            </article>
          ))}
          {!data.cases.length && <p className="campus-empty-note">没有待核实的比赛信息纠错。</p>}
        </div>
      )}
      {data && tab === 'applications' && (
        <div className="campus-case-list">
          {data.applications.map((a) => (
            <article key={a.id}>
              <div>
                <Badge value={statuses[a.status] ?? a.status} />
                <span>
                  {name(a.profileId)} · {time(a.createdAt)}
                </span>
              </div>
              <h3>{a.reason}</h3>
              {a.reviewNote && <p>复核意见：{a.reviewNote}</p>}
              {a.status === 'SUBMITTED' && (
                <button
                  onClick={() => {
                    setApplication(a)
                    setDecision('APPROVED')
                  }}
                >
                  审核复训申请
                </button>
              )}
            </article>
          ))}
          {!data.applications.length && <p className="campus-empty-note">没有复训申请。</p>}
        </div>
      )}
      <details className="campus-policy">
        <summary>完整规则与权限边界</summary>
        <p>
          初始100分，低于60冻结。完整赛季没有合格记录也会冻结。纠错经本组织总管理员核实后才扣分；重复反馈合并，同一事项只扣一次；本人不能审核本人事项。
        </p>
        <p>
          连续三场记录经比赛审核确认合格，加10分，上限100。确认差错会中断合格进度。冻结后申请复训，批准后冷却7天；首次恢复至少60分，后续恢复保留原分数。考察期至少90天并覆盖之后一个完整正式赛季，期间确认差错扣20分。0分封禁信息员资格，不能再申请。
        </p>
        <p>
          裁定通知后7天内可申诉。申诉成立返还原次扣分，并保留撤销流水。信息员资格处理不冻结普通用户账号。
        </p>
      </details>
      {chosen && (
        <Modal
          title={chosen.appeal ? '复核信息员申诉' : '核实比赛记录差错'}
          onClose={() => setChosen(null)}
        >
          <p>
            {name(chosen.profileId)}：{chosen.description}
          </p>
          {chosen.appeal && <p className="campus-appeal">申诉说明：{chosen.appeal}</p>}
          <dl className="campus-facts">
            <div>
              <dt>比赛</dt>
              <dd>{chosen.matchTitle}</dd>
            </div>
            <div>
              <dt>报告版本</dt>
              <dd>第{chosen.reportVersion ?? '—'}版</dd>
            </div>
            <div>
              <dt>问题位置</dt>
              <dd>
                {(
                  {
                    score: '比分',
                    goal: '进球/助攻',
                    lineup: '名单',
                    card: '红黄牌',
                    other: '其他',
                  } as Record<string, string>
                )[chosen.errorKey] ?? chosen.errorKey}
              </dd>
            </div>
          </dl>
          {chosen.evidence.length > 0 && (
            <div className="campus-evidence">
              <strong>反馈证据</strong>
              {chosen.evidence.map((value, index) => (
                <p key={index}>
                  {/^https?:\/\//i.test(value) ? (
                    <a href={value} target="_blank" rel="noreferrer">
                      查看证据 {index + 1}
                    </a>
                  ) : (
                    value
                  )}
                </p>
              ))}
            </div>
          )}
          <ActionForm
            context={context}
            path={`/admin/campus/corrections/${chosen.id}/review`}
            body={{ decision, expectedVersion: chosen.version }}
            submitLabel="确认裁定并保存"
            onDone={() => {
              setChosen(null)
              result.refresh()
            }}
          >
            <label className="mc-field">
              <span>核实结果</span>
              <select value={decision} onChange={(e) => setDecision(e.target.value)}>
                {chosen.appeal ? (
                  <option value="OVERTURNED">申诉成立，撤销本次扣分</option>
                ) : (
                  <>
                    <option value="CONFIRMED">差错成立，按当前规则扣分</option>
                    <option value="DISMISSED">不成立或证据不足，不扣分</option>
                  </>
                )}
              </select>
            </label>
            <p className="mc-muted">请结合原始报告、现场记录与证据核实，并在下方写明依据。</p>
          </ActionForm>
        </Modal>
      )}
      {application && (
        <Modal title="审核信息员复训申请" onClose={() => setApplication(null)}>
          <p>
            {name(application.profileId)}：{application.reason}
          </p>
          <ActionForm
            context={context}
            path={`/admin/campus/reinstatements/${application.id}/review`}
            body={{ decision, expectedVersion: application.version }}
            submitLabel="保存复核结果"
            onDone={() => {
              setApplication(null)
              result.refresh()
            }}
          >
            <label className="mc-field">
              <span>复核结果</span>
              <select value={decision} onChange={(e) => setDecision(e.target.value)}>
                <option value="APPROVED">批准，进入7天冷却期</option>
                <option value="REJECTED">暂不批准，说明需补充的内容</option>
              </select>
            </label>
          </ActionForm>
        </Modal>
      )}
    </section>
  )
}
