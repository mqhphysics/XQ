import Taro, { getCurrentInstance, useDidHide, useDidShow } from '@tarojs/taro'
import { useRef, useState } from 'react'
import { PublicShell } from '../../components/public-shell'
import { MatchDialog } from '../../components/match-overlay/index.h5'

export default function MatchDetailPage() {
  const params = getCurrentInstance().router?.params
  const matchId = params?.matchId ?? ''
  const tournamentId = params?.tournamentId ?? ''
  const closing = useRef(false)
  const [visible, setVisible] = useState(true)
  useDidHide(() => setVisible(false))
  useDidShow(() => setVisible(true))
  const close = async () => {
    if (closing.current) return
    closing.current = true
    try {
      if (Taro.getCurrentPages().length > 1) await Taro.navigateBack()
      else
        await Taro.redirectTo({
          url: `/pages/readonly-schedule/index${tournamentId ? `?tournamentId=${encodeURIComponent(tournamentId)}` : ''}`,
        })
    } finally {
      closing.current = false
    }
  }
  return (
    <PublicShell active="schedule" tournamentId={tournamentId}>
      {visible && <MatchDialog request={{ matchId, tournamentId }} onClose={() => void close()} />}
    </PublicShell>
  )
}
