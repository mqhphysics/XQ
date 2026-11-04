import { getCurrentInstance } from '@tarojs/taro'
import { PublicShell } from '../../components/public-shell'
import { TeamDetailView } from '../../components/team-hub/detail.h5'
import { useDesktopTeamView } from '../../components/team-hub/data.h5'
import { useDetailBack } from '../readonly-schedule/detail-back'
import ExistingTeamDetail from './team-detail.shared'
import '../../components/team-hub/index.h5.scss'
import './index.h5.scss'

export default function H5TeamDetailPage() {
  const desktop = useDesktopTeamView()
  const params = getCurrentInstance().router?.params
  return desktop ? (
    <DesktopTeamDetail teamId={params?.teamId ?? ''} tournamentId={params?.tournamentId} />
  ) : (
    <ExistingTeamDetail />
  )
}

function DesktopTeamDetail({
  teamId,
  tournamentId,
}: {
  teamId: string
  tournamentId: string | undefined
}) {
  useDetailBack(
    `/pages/my-team/index${tournamentId ? `?tournamentId=${encodeURIComponent(tournamentId)}` : ''}`,
  )
  return (
    <PublicShell active="team" showBack tournamentId={tournamentId}>
      <div className="th-root th-page">
        <TeamDetailView teamId={teamId} tournamentId={tournamentId} />
      </div>
    </PublicShell>
  )
}
