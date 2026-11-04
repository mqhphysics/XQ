import { useState } from 'react'
import type { OrganizationContext } from '../adminSchedule/types'
import { ActionForm, DataState, Modal, Pager, label, time, useAdminData, type PageData, type Row } from './shared'
import { UserDetail } from './PeopleManagement'
import { MediaThumbnail } from './MediaLibrary'
import { QuickApprove } from './QuickApprove'
import './activity-log.css'

type Entry = Row & {
  action: string; actorName: string; actorUserId: string | null; targetName: string;
  relatedUserId: string | null; reason: string; createdAt: string;
  before: Record<string, unknown> | null; after: Record<string, unknown> | null;
  mediaUrls: string[];
  mediaReview: { assetId?: string; version?: number; aiReviewId?: string; reviewedAt: string | null; status: string } | null;
  imageAction: { url: string; expectedVersion: number } | null;
  teamChange: { path: string; body: Record<string, unknown> } | null;
}
const names: Record<string, string> = {
  ACCOUNT_REGISTERED: '注册账号', STUDENT_NUMBER_AUTO_RECORDED: '自动收录学号', STUDENT_REGISTRATION_AUTO_RECONCILED: '确认注册资料',
  USER_AVATAR_UPDATED: '更新用户头像', PLAYER_AVATAR_UPDATED: '更新球员头像', PROFILE_UPDATED: '更新个人资料',
  MEDIA_SUBMITTED: '上传图片', MEDIA_APPROVED: '图片审核通过', MEDIA_REJECTED: '图片审核未通过',
  TEAM_PROFILE_UPDATED: '修改球队资料', TEAM_SEASON_PROFILE_UPDATED: '修改赛季球队资料',
  IDENTITY_APPLICATION_CREATED: '申请身份认证', IDENTITY_APPLICATION_APPROVED: '批准身份认证', IDENTITY_APPLICATION_REJECTED: '拒绝身份申请',
  IDENTITY_RECORD_CREATED: '登记任职', STUDENT_RECORD_SAVED: '保存学生档案', STUDENT_REGISTRATION_REVIEWED: '核验注册学号',
  STUDENT_REGISTRATION_RESUBMITTED: '更正注册学号', AI_REVIEW_HUMAN_DECIDED: '人工复核内容',
  COMMUNITY_POST_CREATED: '发布动态', COMMUNITY_POST_DELETED: '删除动态', MATCH_REPORT_SUBMIT: '保存比赛记录', MATCH_REPORT_CONFIRM: '确认赛果',
  MATCH_TECHNICAL_RECORDED: '录入比赛技术统计', TEAM_LINEUP_SAVED: '保存球队阵容', TEAM_DEFAULT_LINEUP_SET: '设置默认阵容',
  ROLE_ASSIGNMENT_GRANTED: '授予权限', ROLE_ASSIGNMENT_REVOKED: '撤销权限',
}
const fields: Record<string, string> = {
  name: '全名', shortName: '简称', displayName: '昵称', realName: '姓名', studentNumber: '学号',
  academicYear: '年级', collegeName: '学院', description: '介绍', motto: '口号', bio: '简介',
  status: '状态', version: '版本', changedFields: '修改项', position: '位置', secondaryPosition: '第二位置',
  primaryColor: '主色', secondaryColor: '辅助色', title: '标题', body: '正文', heightCm: '身高',
  dominantFoot: '惯用脚', major: '专业', hometown: '籍贯', count: '数量', revokedCount: '撤销数量',
}
function actionName(action: string) { return names[action] || label(action) }
function valueText(value: unknown): string {
  if (value === null || value === undefined || value === '') return '未填写'
  if (Array.isArray(value)) return value.map(item => fields[String(item)] || label(item)).join('、')
  return label(value)
}
function changes(entry: Entry) {
  return [...new Set([...Object.keys(entry.before ?? {}), ...Object.keys(entry.after ?? {})])]
    .filter(key => !/Url$/.test(key) && !/Id$/.test(key) && key !== 'changedFields')
}
export function ActivityLog({ context }: { context: OrganizationContext }) {
  const [activity, setActivity] = useState('IMPORTANT'), [page, setPage] = useState(1),
    [query, setQuery] = useState(''), [input, setInput] = useState(''),
    [selected, setSelected] = useState<Entry | null>(null), [user, setUser] = useState<Row | null>(null),
    [action, setAction] = useState<'restore' | 'block' | null>(null)
  const data = useAdminData<PageData<Entry>>(context, `/admin/center/audit?${new URLSearchParams({ activity, page: String(page), pageSize: '20', query })}`)
  const openUser = (id: string, name: string) => setUser({ id, displayName: name, roles: [] })
  const approved = (entry: Entry) => {
    const update = (row: Entry): Entry => row.id === entry.id && row.mediaReview
      ? { ...row, mediaReview: { ...row.mediaReview, ...(row.mediaReview.version === undefined ? {} : { version: row.mediaReview.version + 1 }),
        reviewedAt: new Date().toISOString(), status: 'APPROVED' } } : row
    data.update(current => current && ({ ...current, items: current.items.map(update) }))
    setSelected(current => current && update(current))
  }
  return <>
    <section className="mc-panel activity-log">
      <div className="mc-panel-heading"><h2>操作记录</h2><button className="secondary-button" onClick={data.refresh}>刷新</button></div>
      <div className="mc-toolbar">
        <div className="mc-tabs">{([['IMPORTANT', '重要活动'], ['ORDINARY', '普通活动'], ['ALL', '全部']] as const).map(([key, name]) =>
          <button key={key} className={activity === key ? 'active' : ''} onClick={() => { setActivity(key); setPage(1) }}>{name}</button>)}</div>
        <form onSubmit={e => { e.preventDefault(); setQuery(input.trim()); setPage(1) }}>
          <input aria-label="搜索操作记录" placeholder="搜索用户或操作" value={input} onChange={e => setInput(e.target.value)} /><button>搜索</button>
        </form>
      </div>
      <DataState {...data} empty={!data.data?.items.length} onRetry={data.refresh} />
      {data.data && <><table className="mc-table"><thead><tr><th>操作</th><th>操作者</th><th>对象与变更</th><th>时间</th><th>处理</th></tr></thead>
        <tbody>{data.data.items.map(entry => <tr key={entry.id}>
          <td><strong>{actionName(entry.action)}</strong></td>
          <td>{entry.actorUserId ? <button className="mc-link-button" onClick={() => openUser(entry.actorUserId!, entry.actorName)}>{entry.actorName}</button> : entry.actorName}</td>
          <td>{entry.relatedUserId ? <button className="mc-link-button" onClick={() => openUser(entry.relatedUserId!, entry.targetName)}>{entry.targetName}</button> : <strong>{entry.targetName}</strong>}
            {changes(entry).filter(key => ['name', 'shortName', 'displayName', 'studentNumber', 'status'].includes(key)).slice(0, 2).map(key =>
              <div key={key}>{fields[key]}：{entry.before && Object.hasOwn(entry.before, key) ? `${valueText(entry.before[key])} → ` : ''}{valueText(entry.after?.[key])}</div>)}
          </td><td>{time(entry.createdAt)}</td><td><button onClick={() => { setSelected(entry); setAction(null) }}>查看详情</button></td>
        </tr>)}</tbody></table><Pager data={data.data} page={page} onPage={setPage} /></>}
    </section>
    {selected && <Modal title={actionName(selected.action)} onClose={() => setSelected(null)}>
      <div className="gov-detail-body activity-detail">
        <p>{selected.actorUserId ? <button className="mc-link-button" onClick={() => openUser(selected.actorUserId!, selected.actorName)}>{selected.actorName}</button> : selected.actorName}
          {' · '}{selected.targetName}{' · '}{time(selected.createdAt)}</p>
        {selected.reason && <p>{selected.reason}</p>}
        {!!changes(selected).length && <table className="mc-table"><thead><tr><th>内容</th><th>修改前</th><th>修改后</th></tr></thead><tbody>
          {changes(selected).map(key => <tr key={key}><th>{fields[key] || key}</th><td>{valueText(selected.before?.[key])}</td><td>{valueText(selected.after?.[key])}</td></tr>)}
        </tbody></table>}
        <div className="gov-media-grid">{selected.mediaUrls.map(url => <MediaThumbnail key={url} context={context} url={url} large />)}</div>
        {!selected.mediaUrls.length && !changes(selected).length && <p>该历史记录保存了操作结果，未保存可展示的变更内容。</p>}
        {selected.mediaReview && !selected.mediaReview.reviewedAt && selected.mediaReview.status !== 'STALE' &&
          <QuickApprove context={context} method={selected.mediaReview.aiReviewId ? 'POST' : 'PUT'}
            path={selected.mediaReview.aiReviewId ? `/admin/ai-review/jobs/${selected.mediaReview.aiReviewId}/decision` : `/admin/media-assets/${selected.mediaReview.assetId}/review`}
            body={selected.mediaReview.aiReviewId ? { decision: 'ALLOW' } : { action: 'APPROVE', expectedVersion: selected.mediaReview.version }}
            onDone={() => approved(selected)} />}
        <div className="mc-actions">{selected.relatedUserId && <button className="secondary-button" onClick={() => openUser(selected.relatedUserId!, selected.targetName)}>打开用户资料</button>}
          {selected.teamChange && <button className="secondary-button" onClick={() => setAction('restore')}>恢复修改前的资料</button>}
          {(selected.imageAction || selected.mediaReview) && <button className="secondary-button" onClick={() => setAction('block')}>暂停公开图片</button>}
        </div>
        {action === 'restore' && selected.teamChange && <ActionForm context={context} method="PATCH" refreshAll={false}
          path={selected.teamChange.path} body={selected.teamChange.body} submitLabel="恢复资料" onDone={() => { setSelected(null); data.refresh() }} />}
        {action === 'block' && (selected.imageAction || selected.mediaReview) && <ActionForm context={context} refreshAll={false}
          method={selected.imageAction || !selected.mediaReview?.assetId ? 'POST' : 'PUT'}
          path={selected.imageAction ? '/admin/center/media/decisions' : selected.mediaReview?.assetId
            ? `/admin/media-assets/${selected.mediaReview.assetId}/review` : `/admin/ai-review/jobs/${selected.mediaReview!.aiReviewId}/decision`}
          body={selected.imageAction ? { ...selected.imageAction, action: 'BLOCK' } : selected.mediaReview?.assetId
            ? { action: 'REJECT', expectedVersion: selected.mediaReview.version } : { decision: 'BLOCK' }}
          submitLabel="暂停公开并记录原因" onDone={() => { setSelected(null); data.refresh() }} />}
      </div>
    </Modal>}
    {user && <UserDetail context={context} row={user} onClose={() => setUser(null)} onChanged={() => { setUser(null); data.refresh() }} />}
  </>
}
