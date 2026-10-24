import Taro from '@tarojs/taro'

export interface ProxyRequest {
  url: string
  method?: string
  data?: unknown
  header?: Record<string, unknown>
  timeout?: number
}

export interface CloudCall {
  config: { env: string }
  path: string
  method: string
  header: Record<string, unknown>
  data?: unknown
  timeout: number
}

type CloudConfiguration = {
  env: string
  serviceName: string
  apiBaseUrl: string
  mediaOrigin?: string
}

let mediaOrigin = (process.env.TARO_APP_API_PROXY_MEDIA_ORIGIN || '').trim().replace(/\/+$/, '')

export function cloudApiMediaUrl(path: string | null | undefined): string | undefined {
  if (!mediaOrigin || !path || /^(?:data:|blob:)/i.test(path)) return undefined
  if (/^https?:\/\//i.test(path)) {
    return /^https:\/\/[a-z0-9-]+\.trycloudflare\.com\/api\/(?:media\/|media-assets\/)/i.test(path)
      ? path.replace(/^https:\/\/[^/]+/, mediaOrigin)
      : undefined
  }
  return path.startsWith('/api/')
    ? `${mediaOrigin}${path}`
    : `${mediaOrigin}/api/${path.replace(/^\/+/, '')}`
}

export class CloudApiConnectionError extends Error {
  readonly cloudTransport = true
  constructor(error: unknown) {
    const failure = error && typeof error === 'object' ? error : {}
    const raw =
      'errMsg' in failure
        ? String(failure.errMsg)
        : error instanceof Error
          ? error.message
          : '云调用失败'
    const detail = raw
      .replace(/https?:\/\/\S+/g, '[地址]')
      .replace(/Bearer\s+\S+/gi, '[凭据]')
      .slice(0, 160)
    super(`云托管连接失败：${detail}`)
    this.name = 'CloudApiConnectionError'
  }
}

export function cloudApiFailureMessage(error: unknown): string | undefined {
  return error instanceof CloudApiConnectionError ? error.message : undefined
}

function createCloudTransport(
  callContainer: (options: CloudCall) => Promise<unknown>,
  configuration: CloudConfiguration,
) {
  if (configuration.mediaOrigin) mediaOrigin = configuration.mediaOrigin.replace(/\/+$/, '')
  const configured = configuration.apiBaseUrl.trim().replace(/\/+$/, '')
  const apiBase = configured.endsWith('/api') ? configured : `${configured}/api`

  return async (options: ProxyRequest) => {
    if (
      options.url !== apiBase &&
      !options.url.startsWith(`${apiBase}/`) &&
      !options.url.startsWith(`${apiBase}?`)
    ) {
      throw new Error('请求不属于已配置的晓球 API')
    }

    const timeout = Math.max(500, Math.min(15000, options.timeout || 8000))
    const header: Record<string, unknown> = {}
    for (const key of Object.keys(options.header || {})) {
      if (key.toLowerCase() !== 'x-wx-service') header[key] = options.header![key]
    }
    header['X-WX-SERVICE'] = configuration.serviceName

    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      const reply = await Promise.race([
        callContainer({
          config: { env: configuration.env },
          path: `/api${options.url.slice(apiBase.length)}`,
          method: options.method || 'GET',
          header,
          ...(options.data !== undefined ? { data: options.data } : {}),
          timeout,
        }),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error('晓球云托管请求超时，请重试')), timeout)
        }),
      ])

      const result = reply
      if (
        !result ||
        typeof result !== 'object' ||
        !('statusCode' in result) ||
        typeof result.statusCode !== 'number' ||
        result.statusCode < 100 ||
        result.statusCode > 599 ||
        !('data' in result) ||
        !('header' in result)
      ) {
        throw new Error('晓球云托管响应格式无效，请联系管理员')
      }

      const replyHeader = result.header as Record<string, unknown>
      const nextOrigin = Object.entries(replyHeader).find(
        ([key]) => key.toLowerCase() === 'x-xiaoqiu-media-origin',
      )?.[1]
      if (typeof nextOrigin === 'string' && /^https:\/\/[a-z0-9.-]+(?::443)?$/i.test(nextOrigin)) {
        mediaOrigin = nextOrigin
      }

      return {
        data: result.data,
        statusCode: result.statusCode,
        header: result.header,
        cookies: [],
        errMsg: 'request:ok',
      }
    } catch (error) {
      throw new CloudApiConnectionError(error)
    } finally {
      clearTimeout(timer)
    }
  }
}

const cloudEnv = process.env.TARO_APP_API_PROXY_ENV?.trim()
let initialization: Promise<void> | undefined

export function initializeCloudApi(): Promise<void> {
  if (!cloudEnv) throw new Error('未配置云托管环境')
  if (!wx.cloud || typeof wx.cloud.callContainer !== 'function') {
    throw new Error('当前微信不支持云托管调用，请升级微信')
  }
  if (!initialization) {
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

const cloudRequester = cloudEnv
  ? createCloudTransport(
      async (options) => {
        await initializeCloudApi()
        return new Promise<unknown>((resolve, reject) => {
          const operation = wx.cloud.callContainer({ ...options, success: resolve, fail: reject })
          if (operation && typeof operation.then === 'function') operation.then(resolve, reject)
        })
      },
      {
        env: cloudEnv,
        serviceName: process.env.TARO_APP_API_PROXY_SERVICE?.trim() || 'express-5g68',
        apiBaseUrl: process.env.TARO_APP_API_BASE_URL || '',
        mediaOrigin: process.env.TARO_APP_API_PROXY_MEDIA_ORIGIN?.trim() || '',
      },
    )
  : undefined

const userDataPath = Taro.env?.USER_DATA_PATH || ''
const previewPrefix = `${userDataPath}/xiaoqiu-cloud-preview-`
const tempPreviews: string[] = []

if (userDataPath && typeof Taro.getFileSystemManager === 'function') {
  const fs = Taro.getFileSystemManager()
  fs.readdir({
    dirPath: userDataPath,
    success: ({ files }) => {
      for (const file of files.filter((name) => name.startsWith('xiaoqiu-cloud-preview-'))) {
        fs.unlink({ filePath: `${userDataPath}/${file}` })
      }
    },
  })
}

export async function downloadCloudApiMedia(url: string, header: Record<string, string>) {
  if (!cloudEnv) return Taro.downloadFile({ url, header })
  const origin = (process.env.TARO_APP_API_PROXY_MEDIA_ORIGIN || '').replace(/\/+$/, '')
  if (!origin || !url.startsWith(`${origin}/api/`)) throw new Error('照片地址无效')
  await initializeCloudApi()
  const result = await new Promise<{ statusCode: number; data: unknown }>((resolve, reject) => {
    const operation = wx.cloud.callContainer({
      config: { env: cloudEnv },
      path: url.slice(origin.length),
      method: 'GET',
      header: {
        ...header,
        'X-WX-SERVICE': process.env.TARO_APP_API_PROXY_SERVICE || 'express-5g68',
      },
      timeout: 15000,
      responseType: 'arraybuffer',
      dataType: 'text',
      success: resolve,
      fail: reject,
    })
    if (operation && typeof operation.then === 'function') operation.then(resolve, reject)
  })
  if (result.statusCode !== 200) throw new Error('照片读取失败，请重新打开')
  const bytes = result.data
  if (!(bytes instanceof ArrayBuffer) || bytes.byteLength > 8 * 1024 * 1024) {
    throw new Error('照片过大或格式无效')
  }
  const fs = Taro.getFileSystemManager()
  const tempFilePath = `${previewPrefix}${Date.now()}-${Math.random().toString(36).slice(2)}.image`
  await new Promise<void>((resolve, reject) =>
    fs.writeFile({
      filePath: tempFilePath,
      data: bytes,
      success: () => resolve(),
      fail: reject,
    }),
  )
  tempPreviews.push(tempFilePath)
  while (tempPreviews.length > 16) fs.unlink({ filePath: tempPreviews.shift()! })
  return { statusCode: result.statusCode, tempFilePath }
}

export async function apiRequest<T = unknown>(
  options: Taro.request.Option<T>,
): Promise<Omit<Taro.request.SuccessCallbackResult, 'data'> & { data: T }> {
  if (!cloudRequester) return Taro.request<T>(options)
  return (await cloudRequester(options)) as Omit<Taro.request.SuccessCallbackResult, 'data'> & {
    data: T
  }
}
