import { useEffect, useState } from 'react'
import { AdminScheduleWorkspace } from '../adminSchedule/AdminScheduleWorkspace'
import type { AdminScheduleSnapshot, OrganizationContext } from '../adminSchedule/types'
import { mapSnapshot } from '../adminSchedule/repository'
import type { ApiAdminScheduleSnapshot } from '../adminSchedule/repository'
import {
  AdminMatchReports,
  AdminProgression,
  AdminRosterReview,
} from '../adminWorkflows/AdminWorkflows'
import { Content } from './Content'
import { Records } from './Records'
import { IdentityManagement } from './IdentityManagement'
import { publicWebsiteHref } from '../adminAuth/config'
import { PeopleManagement } from './PeopleManagement'
import { CampusDirectory } from './CampusDirectory'
import { ReporterManagement } from './ReporterManagement'
import { CompetitionPicker } from './CompetitionPicker'
import { MediaLibrary } from './MediaLibrary'
import { PostComposer, PostReview } from './PostManagement'
import { DirectMessageReview } from './DirectMessageReview'
import { Icon, useAdminData } from './shared'
import { RefreshButton } from './RefreshButton'
import { WorkspaceHome } from './WorkspaceHome'
import { AdminSheetImport } from '../adminWorkflows/AdminSheetImport'
import { MatchIntake } from '../adminWorkflows/MatchIntake'
import { AiReview } from './AiReview'
import {
  directoryTab,
  navigationGroups,
  workspaceHash,
  workspaceLocation,
  type Section,
} from './workspace-navigation'
import './admin-center.css'
import './workspace-refinement.css'

const pages: Record<Section, { title: string; description: string; icon: string }> = {
  intake: { title: '比赛录入', description: '', icon: 'pencil' },
  ai: { title: 'AI辅助审核', description: '', icon: 'shield-check' },
  overview: {
    title: '赛事工作台',
    description: '先处理待办，再把下一场比赛准备好。',
    icon: 'trophy',
  },
  events: {
    title: '赛事与比赛',
    description: '从赛程、名单到战报，沿着比赛的顺序完成工作。',
    icon: 'calendar',
  },
  people: {
    title: '人员与球队',
    description: '找到一个人，查看和维护学生、账号与球员的关联资料。',
    icon: 'users',
  },
  accounts: {
    title: '账号与身份',
    description: '处理登录账号、核验申请与人员授权。',
    icon: 'shield-check',
  },
  review: {
    title: '内容审核',
    description: '集中复核动态、图片和私聊，处理不合适的内容。',
    icon: 'shield-check',
  },
  publish: {
    title: '发布内容',
    description: '发布赛事公告，或分享值得记录的校园足球。',
    icon: 'pencil',
  },
  reporters: {
    title: '信息员与纠错',
    description: '先核实比赛记录，再处理质量分与复训申请。',
    icon: 'bookmark',
  },
  content: { title: '反馈与举报', description: '查看问题、完成处理，并回复提交者。', icon: 'bell' },
  audit: { title: '操作记录', description: '按时间查看资料修改、审核和授权记录。', icon: 'pencil' },
  system: {
    title: '系统状态',
    description: '检查服务、任务和数据存储的实际状态。',
    icon: 'shield-check',
  },
  media: { title: '图片维护', description: '查看现有图片引用与处理记录。', icon: 'pencil' },
}
function mapScheduleData(data: unknown) {
  return mapSnapshot(data as ApiAdminScheduleSnapshot)
}
export function AdminCenter({
  context,
  displayName,
  onLogout,
}: {
  context: OrganizationContext
  displayName: string
  onLogout: () => void
}) {
  const [route, setRoute] = useState(() => workspaceLocation(window.location.hash))
  const schedule = useAdminData<AdminScheduleSnapshot>(
    context,
    '/admin/schedule-workbench',
    mapScheduleData,
  )
  const [tournamentId, setTournamentId] = useState<string | null>(null)
  const selectedTournament =
    tournamentId !== null
      ? schedule.data?.tournaments.find((item) => item.id === tournamentId)
      : schedule.data?.tournaments.find(
          (item) =>
            item.seasonId ===
              schedule.data?.seasons.find(
                (season) => season.name.includes('2026') && !season.name.includes('演示'),
              )?.id &&
            item.name.includes('新生') &&
            !item.name.includes('女'),
        )
  const { section, view } = route
  const page = pages[section]
  const pending = useAdminData<{ counts: Record<string, number> }>(
    context,
    context.canManageOrganization ? '/admin/center/overview' : null,
  )
  const counts = pending.data?.counts ?? {}
  const aiStats = useAdminData<{ pending: number }>(
    context,
    context.canManageOrganization ? '/admin/ai-review/stats' : null,
  )
  const pendingBySection: Partial<Record<Section, number>> = {
    ai: aiStats.data?.pending ?? 0,
    events: (counts.pendingReports ?? 0) + (counts.pendingRosters ?? 0),
    accounts: counts.pendingIdentities ?? 0,
    people: counts.pendingStudentRegistrations ?? 0,
    review: (counts.pendingPosts ?? 0) + (counts.pendingMedia ?? 0) + (counts.pendingMessages ?? 0),
    reporters: (counts.openCorrections ?? 0) + (counts.pendingReinstatements ?? 0),
    content: counts.openFeedback ?? 0,
  }
  useEffect(() => {
    const changed = () => {
      const next = workspaceLocation(window.location.hash)
      setRoute(next)
    }
    window.addEventListener('hashchange', changed)
    return () => window.removeEventListener('hashchange', changed)
  }, [])
  function navigate(next: Section, nextView = '', query = '') {
    const hash = workspaceHash(next, nextView, query)
    window.location.hash = hash
    setRoute(workspaceLocation(hash))
  }
  const allowed =
    context.canManageOrganization ||
    section === 'overview' ||
    section === 'events' ||
    section === 'intake'
  const accountView = view === 'identities' ? 'identities' : 'logins'
  const withCompetition = ['overview', 'events', 'people', 'publish'].includes(section)
  return (
    <div className="mc-shell workspace-shell">
      <a
        className="mc-skip"
        href="#mc-content"
        onClick={(event) => {
          event.preventDefault()
          document.getElementById('mc-content')?.focus()
        }}
      >
        跳到主要内容
      </a>
      <aside className="mc-sidebar">
        <div className="workspace-brand-row">
          <a className="mc-brand" href="#overview" onClick={() => navigate('overview')}>
            <img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" />
            <span>
              <strong>晓球</strong>
              <small>管理中心</small>
            </span>
          </a>
          <RefreshButton />
        </div>
        <nav className="workspace-navigation" aria-label="管理中心模块">
          {navigationGroups.map((group) => {
            const items = group.items.filter(
              (item) =>
                context.canManageOrganization ||
                item === 'overview' ||
                item === 'events' ||
                item === 'intake',
            )
            return items.length ? (
              <div className="workspace-nav-group" key={group.title}>
                <div className="mc-nav-label">{group.title}</div>
                {items.map((id) => (
                  <a
                    key={id}
                    href={workspaceHash(id)}
                    onClick={(event) => {
                      event.preventDefault()
                      navigate(id)
                    }}
                    className={section === id ? 'active' : ''}
                    aria-current={section === id ? 'page' : undefined}
                  >
                    <Icon name={pages[id].icon} />
                    <span>{pages[id].title}</span>
                    {(pendingBySection[id] ?? 0) > 0 && (
                      <span
                        className="mc-pending-indicator"
                        aria-label={`${pendingBySection[id]}项待处理`}
                      />
                    )}
                  </a>
                ))}
              </div>
            ) : null
          })}
        </nav>
        <div className="mc-sidebar-bottom">
          <a href={publicWebsiteHref()} target="_blank" rel="noreferrer">
            打开晓球网站 <span>↗</span>
          </a>
          <div className="mc-account">
            <span className="mc-avatar">{displayName.slice(0, 1)}</span>
            <div>
              <strong>{displayName}</strong>
              <small>
                {context.role === 'PLATFORM_ADMIN'
                  ? '总管理员'
                  : context.role === 'ORGANIZATION_ADMIN'
                    ? '组织管理员'
                    : '赛事管理员'}
              </small>
            </div>
            <button className="mc-logout" aria-label="退出登录" title="退出登录" onClick={onLogout}>
              <Icon name="logout" />
            </button>
          </div>
        </div>
      </aside>
      <div className="mc-body">
        <main id="mc-content" className="mc-main" tabIndex={-1}>
          <header className="mc-page-heading">
            <div>
              <h1>{page.title}</h1>
            </div>
            {withCompetition && (
              <CompetitionPicker
                context={context}
                onSelect={setTournamentId}
                onCreated={schedule.refresh}
              />
            )}
          </header>
          {withCompetition && schedule.error && (
            <div className="mc-alert" role="alert">
              赛事读取失败：{schedule.error}{' '}
              <button className="secondary-button" onClick={schedule.refresh}>
                重试
              </button>
            </div>
          )}
          <div className="mc-page-content" key={`${section}-${context.userId}`}>
            {!allowed ? (
              <Restricted />
            ) : (
              <>
                {section === 'intake' && (
                  <MatchIntake context={context} initialMatchId={route.query} />
                )}
                {section === 'ai' && <AiReview context={context} />}
                {section === 'overview' && (
                  <WorkspaceHome
                    context={context}
                    navigate={navigate}
                    schedule={schedule.data}
                    tournament={selectedTournament}
                  />
                )}
                {section === 'accounts' && (
                  <>
                    <div className="workspace-view-tabs" role="tablist" aria-label="账号管理内容">
                      <button
                        role="tab"
                        aria-selected={accountView === 'logins'}
                        onClick={() => navigate('accounts', 'logins')}
                      >
                        账号与登录
                      </button>
                      <button
                        role="tab"
                        aria-selected={accountView === 'identities'}
                        onClick={() => navigate('accounts', 'identities')}
                      >
                        身份申请与授权
                      </button>
                    </div>
                    {accountView === 'identities' ? (
                      <IdentityManagement context={context} />
                    ) : (
                      <PeopleManagement
                        key={route.query}
                        context={context}
                        initialSearch={route.query}
                      />
                    )}
                  </>
                )}
                {section === 'people' && (
                  <CampusDirectory
                    key={route.query}
                    context={context}
                    initialTab={directoryTab(view)}
                    initialSearch={route.query}
                    tournamentId={selectedTournament?.id ?? ''}
                    onFindAccounts={(query) => navigate('accounts', 'logins', query)}
                    onTabChange={(tab) => navigate('people', tab, route.query)}
                  />
                )}
                {section === 'events' && (
                  <Events
                    key={`${view}-${selectedTournament?.id ?? ''}`}
                    context={context}
                    displayName={displayName}
                    onLogout={onLogout}
                    tournamentId={selectedTournament?.id ?? ''}
                    schedule={schedule.data}
                    onSnapshotChange={schedule.refresh}
                    initialTab={view || 'reports'}
                    onTabChange={(tab) => navigate('events', tab)}
                  />
                )}
                {section === 'publish' && (
                  <PostComposer context={context} tournamentId={selectedTournament?.id ?? ''} />
                )}
                {section === 'review' && (
                  <>
                    <div className="workspace-view-tabs" role="tablist" aria-label="内容审核类型">
                      <button
                        role="tab"
                        aria-selected={view !== 'messages'}
                        onClick={() => navigate('review')}
                      >
                        动态与图片
                      </button>
                      <button
                        role="tab"
                        aria-selected={view === 'messages'}
                        onClick={() => navigate('review', 'messages')}
                      >
                        私聊事后审核
                      </button>
                    </div>
                    {view === 'messages' ? (
                      <DirectMessageReview context={context} />
                    ) : (
                      <PostReview
                        key={view}
                        context={context}
                        initialStatus={view === 'pending' ? 'DRAFT' : ''}
                      />
                    )}
                  </>
                )}
                {section === 'content' && <Content context={context} />}
                {section === 'media' && <MediaLibrary context={context} />}
                {section === 'reporters' && (
                  <ReporterManagement
                    key={view}
                    context={context}
                    initialTab={view === 'cases' || view === 'applications' ? view : 'people'}
                  />
                )}
                {(section === 'audit' || section === 'system') && (
                  <Records context={context} kind={section} />
                )}
              </>
            )}
          </div>
          <footer className="mc-footer">
            <span>晓球 · 认真管理每一场校园足球</span>
            <span>修改与审核保留操作记录</span>
          </footer>
        </main>
      </div>
    </div>
  )
}
function Restricted() {
  return (
    <section className="mc-panel mc-state">
      <strong>需要组织管理权限</strong>
      <p>当前账号可管理获授权的赛事，请从“赛事与比赛”进入。</p>
    </section>
  )
}

function Events({
  context,
  displayName,
  onLogout,
  tournamentId,
  schedule,
  onSnapshotChange,
  initialTab,
  onTabChange,
}: {
  context: OrganizationContext
  displayName: string
  onLogout: () => void
  tournamentId: string
  schedule: AdminScheduleSnapshot | null
  onSnapshotChange: () => void
  initialTab: string
  onTabChange?: (tab: string) => void
}) {
  const [tab, setTab] = useState(initialTab)
  const tabs = [
    ['reports', '比赛战报'],
    ['rosters', '名单审核'],
    ['schedule', '赛程管理'],
    ['events', '赛季与赛事'],
    ['teams', '球队与场地'],
    ['progression', '规程与晋级'],
  ]
  return (
    <>
      <div className="mc-tabs" role="group" aria-label="赛事管理功能">
        {tabs.map(([id, title]) => (
          <button
            key={id}
            className={tab === id ? 'active' : ''}
            onClick={() => {
              setTab(id!)
              onTabChange?.(id!)
            }}
          >
            {title}
          </button>
        ))}
      </div>
      {tab === 'schedule' || tab === 'events' || tab === 'teams' ? (
        <div className="mc-legacy">
          <AdminScheduleWorkspace
            key={tab}
            context={context}
            displayName={displayName}
            onLogout={onLogout}
            initialSection={tab}
            onSnapshotChange={onSnapshotChange}
          />
        </div>
      ) : !tournamentId ? (
        <div className="mc-panel mc-state">请先选择赛事。你可以在“赛季与赛事”中创建。</div>
      ) : tab === 'reports' ? (
        <AdminMatchReports
          key={`report-${tournamentId}`}
          context={context}
          tournamentId={tournamentId}
          matches={schedule?.matches.filter((m) => m.tournamentId === tournamentId) ?? []}
        />
      ) : tab === 'sheet' ? (
        <AdminSheetImport
          key={`sheet-${tournamentId}`}
          context={context}
          tournamentId={tournamentId}
          matches={schedule?.matches ?? []}
        />
      ) : tab === 'rosters' ? (
        <AdminRosterReview
          key={`roster-${tournamentId}`}
          context={context}
          tournamentId={tournamentId}
        />
      ) : (
        <AdminProgression
          key={`progression-${tournamentId}`}
          context={context}
          tournamentId={tournamentId}
        />
      )}
    </>
  )
}
