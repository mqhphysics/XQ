import Taro, { getCurrentInstance } from '@tarojs/taro'
import { useEffect, useState } from 'react'
import { PlayerDialog } from '../../components/player-overlay/index.h5'
import { PublicShell } from '../../components/public-shell'
import ExistingPlayerPage from './player-detail.shared'

export default function H5PlayerDetailPage() {
  const [desktop, setDesktop] = useState(() => window.matchMedia('(min-width: 721px)').matches)
  useEffect(() => {
    const media = window.matchMedia('(min-width: 721px)')
    const changed = () => setDesktop(media.matches)
    media.addEventListener('change', changed)
    return () => media.removeEventListener('change', changed)
  }, [])
  if (!desktop) return <ExistingPlayerPage />
  const params = getCurrentInstance().router?.params
  const request = { playerId: params?.playerId ?? '', tournamentId: params?.tournamentId ?? '' }
  return (
    <PublicShell active="data" tournamentId={request.tournamentId}>
      <PlayerDialog
        request={request}
        onClose={() => {
          void Taro.navigateBack().catch(() => Taro.reLaunch({ url: '/pages/index/index' }))
        }}
      />
    </PublicShell>
  )
}
