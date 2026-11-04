import Taro from '@tarojs/taro'
import type {
  AccountCapabilities,
  ProductActionId,
  ProductModuleId,
} from '../../../../../packages/contracts/src/product-config'
import { productConfigRepository } from '../product-config/product-config.repository'
import { runFeatureAction } from '../product-config/product-config.logic'
import { productRepository } from '../product/product.repository'
import { readSession } from '../product/session'
import { readonlyScheduleRepository } from '../readonly-schedule/readonly-schedule.repository'
import { openIdentity } from './identity.repository.h5'
import { canReportMatch, managedTeamIds } from './entry-scope'
import { openCaptainManage } from '../captain-roster/captain-manage-navigation.h5'

const notify = (title: string) => Taro.showToast({ title, icon: 'none' })
const actionModules: Partial<Record<ProductActionId, ProductModuleId>> = {
  'identityApplications.submit': 'identityApplications',
  'teams.manage': 'teamManagement',
  'matchReports.write': 'matchReporting',
  'administration.manage': 'administration',
}

async function accountAction(
  action: ProductActionId,
  perform: (
    caps: AccountCapabilities,
    refresh: () => Promise<AccountCapabilities>,
  ) => Promise<void>,
) {
  try {
    const module = actionModules[action]
    const session = readSession()
    if (!session) throw new Error('请先登录账号')
    const current = () => {
      const value = readSession()
      if (
        value?.accessToken !== session.accessToken ||
        value.user.id !== session.user.id ||
        value.user.organizationId !== session.user.organizationId
      )
        throw new Error('账号已变更，请重新打开此入口')
    }
    const refresh = async () => {
      current()
      const caps = await productConfigRepository.getCapabilities()
      current()
      if (!module || caps.modules[module]?.enabled !== true) throw new Error('功能暂未开放')
      if (caps.organizationId !== session.user.organizationId || !caps.actions[action]?.enabled)
        throw new Error(caps.actions[action]?.reason || '当前账号没有此范围的操作权限')
      return caps
    }
    const caps = await productConfigRepository.getCapabilities()
    current()
    await runFeatureAction(
      module && caps.modules[module]?.enabled === true
        ? caps.actions[action]
        : { enabled: false, reason: '功能暂未开放' },
      () => perform(caps, refresh),
      notify,
    )
  } catch (issue) {
    if (
      issue &&
      typeof issue === 'object' &&
      'errMsg' in issue &&
      String(issue.errMsg).includes('cancel')
    )
      return
    await notify(issue instanceof Error ? issue.message : '暂时无法读取操作权限，请重试')
  }
}

async function choose<T>(items: T[], label: (item: T) => string): Promise<T> {
  if (!items.length) throw new Error('当前没有可操作的对象，请刷新后重试')
  if (items.length === 1) return items[0]!
  let page = 0
  for (;;) {
    const current = items.slice(page * 5, page * 5 + 5)
    const more = (page + 1) * 5 < items.length
    const itemList = [
      ...current.map(label),
      ...(more ? ['下一页'] : page > 0 ? ['返回第一页'] : []),
    ]
    const answer = await Taro.showActionSheet({ itemList })
    if (answer.tapIndex < current.length) return current[answer.tapIndex]!
    page = more ? page + 1 : 0
  }
}

export const identityEntryActions = {
  identity: () =>
    accountAction('identityApplications.submit', async () => {
      openIdentity()
    }),
  teamManagement: () =>
    accountAction('teams.manage', async (caps, refresh) => {
      const ids = managedTeamIds(caps.actions['teams.manage'])
      if (
        !ids.length &&
        caps.actions['teams.manage'].scopes.some(
          (scope) => scope.type === 'ORGANIZATION' && scope.id === caps.organizationId,
        )
      ) {
        // Organization maintenance uses the real admin portal; it never invents
        // a captain/coach TEAM grant or calls a private team workspace.
        await identityEntryActions.administrationEntry()
        return
      }
      const teams = await Promise.all(ids.map((id) => productRepository.getCaptainWorkspace(id)))
      const selected = await choose(teams, (workspace) => workspace.team.name)
      const latest = await refresh()
      if (!managedTeamIds(latest.actions['teams.manage']).includes(selected.team.id))
        throw new Error('当前账号已失去该球队的管理权限')
      openCaptainManage({ teamId: selected.team.id, teamName: selected.team.name })
    }),
  informationEntry: () =>
    accountAction('matchReports.write', async (caps, refresh) => {
      const tournaments = await readonlyScheduleRepository.listTournaments(true)
      if (tournaments.source !== 'api') throw new Error('信息录入需要连接真实 API')
      const schedules = await Promise.all(
        tournaments.data.map((tournament) => readonlyScheduleRepository.listMatches(tournament.id)),
      )
      if (schedules.some((schedule) => schedule.source !== 'api'))
        throw new Error('信息录入需要连接真实 API')
      const matches = schedules
        .flatMap((schedule) => schedule.data)
        .filter((match) =>
          canReportMatch(caps.actions['matchReports.write'], caps.organizationId, match),
        )
      const selected = await choose(
        matches,
        (match) =>
          `${match.homeTeamName} vs ${match.awayTeamName} · ${match.scheduledStartAt.slice(0, 10)}`,
      )
      const latest = await refresh()
      if (!canReportMatch(latest.actions['matchReports.write'], latest.organizationId, selected))
        throw new Error('当前账号已失去该比赛的录入权限')
      await Taro.navigateTo({
        url: `/pages/quick-report/index?matchId=${encodeURIComponent(selected.id)}`,
      })
    }),
  administrationEntry: () =>
    accountAction('administration.manage', async () => {
      window.location.assign('/admin/')
    }),
}
