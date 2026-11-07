import { PageMeta } from '@tarojs/components'
import { getCurrentInstance } from '@tarojs/taro'
import { PublicShell } from '../../components/public-shell'
import { DataState } from '../../components/public-ui'
import { NativeBackGuard } from '../../components/native-navigation/native-back-guard.weapp'
import { NativeTechnicalScreen } from '../../features/technical-statistics/screen.weapp'

export default function NativeTechnicalPage() {
  const matchId = getCurrentInstance().router?.params.matchId || ''
  return (
    <>
      <PageMeta pageStyle="height:100%;overflow:hidden;" />
      <PublicShell active="schedule" showBack nativeWorkbench>
        {matchId ? (
          <NativeTechnicalScreen key={matchId} matchId={matchId} />
        ) : (
          <DataState
            kind="error"
            title="缺少比赛信息"
            description="请返回比赛页面重新进入技术统计。"
          />
        )}
      </PublicShell>
      <NativeBackGuard />
    </>
  )
}
