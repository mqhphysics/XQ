import Taro, { getCurrentInstance } from '@tarojs/taro'
import { useEffect } from 'react'
export default function QuickReportPage() {
  const params = getCurrentInstance().router?.params
  useEffect(() => {
    void Taro.redirectTo({
      url: `/pages/readonly-match-detail/index?matchId=${encodeURIComponent(params?.matchId ?? '')}&edit=1`,
    })
  }, [])
  return null
}
