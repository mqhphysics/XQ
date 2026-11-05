import Taro from '@tarojs/taro'
import { apiRequest } from '../cloud-api/request'
import type {
  AccountCapabilities,
  ProductConfiguration,
} from '../../../../../packages/contracts/src/product-config'
import { readSession } from '../product/session'
import { markAccountInvalid, readAccountPresence } from './policy-state'
import { parseProductConfiguration } from './product-config.logic'

let pendingCapabilities: { key: string; task: Promise<AccountCapabilities> } | undefined

export const productConfigRepository = {
  async getConfiguration(): Promise<ProductConfiguration> {
    // This endpoint is organization independent and sends no account token/organization selector.
    const response = await apiRequest<unknown>({
      url: `${apiBase()}/product/config`,
      method: 'GET',
      timeout: 8000,
    })
    if (response.statusCode !== 200) throw new Error('暂时无法读取产品配置，请重试')
    return parseProductConfiguration(response.data)
  },
  async getCapabilities(): Promise<AccountCapabilities> {
    const h5 = Taro.getEnv() === Taro.ENV_TYPE.WEB
    const session = h5 ? readAccountPresence().session : readSession()
    if (!session) throw new Error('请先登录账号')
    const key = JSON.stringify([
      h5,
      session.user.id,
      session.user.organizationId,
      session.accessToken,
    ])
    const pending =
      pendingCapabilities?.key === key
        ? pendingCapabilities
        : { key, task: readCapabilities(session, h5) }
    pendingCapabilities = pending
    try {
      const value = await pending.task
      const current = readSession()
      if (
        current?.accessToken !== session.accessToken ||
        current.user.id !== session.user.id ||
        current.user.organizationId !== session.user.organizationId
      )
        throw new Error('暂时无法读取账号能力，请重新验证会话')
      return JSON.parse(JSON.stringify(value)) as AccountCapabilities
    } finally {
      if (pendingCapabilities === pending) pendingCapabilities = undefined
    }
  },
}

async function readCapabilities(
  session: NonNullable<ReturnType<typeof readSession>>,
  h5: boolean,
): Promise<AccountCapabilities> {
  const response = await apiRequest<AccountCapabilities>({
    url: `${apiBase()}/me/capabilities`,
    method: 'GET',
    timeout: 8000,
    header: {
      Authorization: `Bearer ${session.accessToken}`,
      'x-organization-id': session.user.organizationId,
    },
  })
  if (h5 && response.statusCode === 401 && readSession()?.accessToken === session.accessToken)
    markAccountInvalid()
  const currentSession = readSession()
  if (
    response.statusCode !== 200 ||
    response.data.schemaVersion !== 1 ||
    response.data.organizationId !== session.user.organizationId ||
    currentSession?.accessToken !== session.accessToken ||
    currentSession.user.organizationId !== session.user.organizationId
  )
    throw new Error('暂时无法读取账号能力，请重新验证会话')
  return response.data
}

function apiBase(): string {
  const configured = process.env.TARO_APP_API_BASE_URL?.trim().replace(/\/+$/, '')
  if (!configured) throw new Error('尚未配置 API 地址')
  return configured.endsWith('/api') ? configured : `${configured}/api`
}
