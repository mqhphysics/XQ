import Taro from '@tarojs/taro'
import { createCloudApiRequester } from './proxy.logic'

const env = process.env.TARO_APP_API_PROXY_ENV?.trim()
let initialization: Promise<void> | undefined
export function initializeCloudApi(): Promise<void> {
  if (!env) throw new Error('未配置云托管环境')
  if (!wx.cloud || typeof wx.cloud.callContainer !== 'function')
    throw new Error('当前微信不支持云托管调用，请升级微信')
  if (!initialization) {
    // Match the successful native probe: initialize capabilities, await readiness,
    // and select the CloudRun environment on callContainer rather than init.
    initialization = Promise.resolve()
      .then(() => wx.cloud.init())
      .then(() => undefined)
      .catch((error: unknown) => {
        initialization = undefined
        throw error
      })
  }
  return initialization
}
const request = env
  ? createCloudApiRequester(
      async (options) => {
        await initializeCloudApi()
        return new Promise<unknown>((resolve, reject) => {
          const operation = wx.cloud.callContainer({ ...options, success: resolve, fail: reject })
          if (operation && typeof operation.then === 'function') operation.then(resolve, reject)
        })
      },
      {
        env,
        serviceName: process.env.TARO_APP_API_PROXY_SERVICE?.trim() || 'express-5g68',
        apiBaseUrl: process.env.TARO_APP_API_BASE_URL || '',
        mediaOrigin: process.env.TARO_APP_API_PROXY_MEDIA_ORIGIN?.trim() || '',
      },
    )
  : undefined

export async function apiRequest<T = unknown>(
  options: Taro.request.Option<T>,
): Promise<Omit<Taro.request.SuccessCallbackResult, 'data'> & { data: T }> {
  if (!request) return Taro.request<T>(options)
  return (await request(options)) as Omit<Taro.request.SuccessCallbackResult, 'data'> & { data: T }
}
