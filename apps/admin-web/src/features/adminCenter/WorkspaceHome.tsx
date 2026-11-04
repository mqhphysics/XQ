import { useState } from 'react'
import type { AdminScheduleSnapshot, OrganizationContext, Tournament } from '../adminSchedule/types'
import { Modal, useAdminData, DataState, time } from './shared'
import type { Navigate } from './workspace-navigation'
import { StudentRegistrationReview } from './StudentRegistrationReview'
import { AiReviewStats, AiReviewQueue } from './AiReview'
import { AdminMatchReports, AdminRosterReview } from '../adminWorkflows/AdminWorkflows'
import { IdentityManagement } from './IdentityManagement'
import { PostReview } from './PostManagement'
import { Content } from './Content'
import { ReporterManagement } from './ReporterManagement'
import { DirectMessageReview } from './DirectMessageReview'
import { ManagedMediaReviews } from './ManagedMediaReviews'
const tasks = [
  ['pendingReports', '比赛战报'],
  ['pendingRosters', '球队名单'],
  ['pendingIdentities', '身份申请'],
  ['pendingPosts', '动态审核'],
  ['pendingMessages', '私聊复核'],
  ['openCorrections', '比赛纠错'],
  ['pendingReinstatements', '信息员复训'],
  ['openFeedback', '反馈与举报'],
] as const
export function WorkspaceHome({
  context,
  navigate,
  schedule,
  tournament,
}: {
  context: OrganizationContext
  navigate: Navigate
  schedule: AdminScheduleSnapshot | null
  tournament: Tournament | undefined
}) {
  const data = useAdminData<{ counts: Record<string, number> }>(
      context,
      context.canManageOrganization ? '/admin/center/overview' : null,
    ),
    [task, setTask] = useState('')
  const counts = data.data?.counts ?? {},
    matches = (schedule?.matches ?? [])
      .filter((m) => m.tournamentId === tournament?.id && m.scheduledStartAt)
      .sort(
        (a, b) =>
          Math.abs(Date.parse(a.scheduledStartAt) - Date.now()) -
          Math.abs(Date.parse(b.scheduledStartAt) - Date.now()),
      )
      .slice(0, 4),
    teams = new Map(schedule?.teams.map((t) => [t.id, t.name]))
  return (
    <>
      <AiReviewStats context={context} />
      <StudentRegistrationReview context={context} compact />
      <AiReviewQueue context={context} compact />
      <ManagedMediaReviews context={context} compact />
      <section className="mc-panel">
        <div className="mc-panel-heading">
          <h2>待办事项</h2>
        </div>
        <DataState {...data} onRetry={data.refresh} />
        <div className="workspace-direct-tasks">
          {tasks
            .filter(([key]) => (counts[key] ?? 0) > 0)
            .map(([key, title]) => (
              <div key={key}>
                <strong>{title}</strong>
                <span>{counts[key]} 项待处理</span>
                <button onClick={() => setTask(key)}>处理</button>
              </div>
            ))}
          {data.data && !tasks.some(([key]) => (counts[key] ?? 0) > 0) && <p>当前没有其他待办。</p>}
        </div>
      </section>
      <section className="mc-panel">
        <div className="mc-panel-heading">
          <h2>近期比赛</h2>
          <button className="secondary-button" onClick={() => navigate('intake')}>
            比赛录入
          </button>
        </div>
        <div className="workspace-direct-tasks">
          {matches.map((match) => (
            <div key={match.id}>
              <strong>
                {teams.get(match.homeTeamId ?? '') || '待定'} —{' '}
                {teams.get(match.awayTeamId ?? '') || '待定'}
              </strong>
              <span>{time(match.scheduledStartAt)}</span>
              <button onClick={() => navigate('intake', '', match.id)}>录入</button>
            </div>
          ))}
        </div>
      </section>
      {task && (
        <Modal
          title={tasks.find(([key]) => key === task)?.[1] ?? '待办处理'}
          className="workspace-task-dialog"
          onClose={() => {
            setTask('')
            data.refresh()
          }}
        >
          {task === 'pendingReports' && tournament && (
            <AdminMatchReports context={context} tournamentId={tournament.id} />
          )}
          {task === 'pendingRosters' && tournament && (
            <AdminRosterReview context={context} tournamentId={tournament.id} />
          )}
          {task === 'pendingIdentities' && <IdentityManagement context={context} />}
          {task === 'pendingPosts' && <PostReview context={context} initialStatus="DRAFT" />}
          {task === 'pendingMessages' && <DirectMessageReview context={context} />}
          {task === 'openFeedback' && <Content context={context} />}
          {(task === 'openCorrections' || task === 'pendingReinstatements') && (
            <ReporterManagement
              context={context}
              initialTab={task === 'openCorrections' ? 'cases' : 'applications'}
            />
          )}
        </Modal>
      )}
    </>
  )
}
