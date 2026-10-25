export interface ProxyRequest {
  url: string
  method?: string
  data?: unknown
  header?: Record<string, unknown>
  timeout?: number
}

let mediaOrigin = ''

// The proxy supplies its current upstream origin so tunnel rotation does not
// leave relative image URLs pointing at the URL embedded in an old build.
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

interface RequestChain {
  requestParams: ProxyRequest
  proceed: (request: ProxyRequest) => Promise<unknown>
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

// Repositories call this transport explicitly. No global Taro interceptor or
// direct HTTP fallback is involved when the cloud channel is configured.
export function createCloudApiRequester(
  callContainer: (options: CloudCall) => Promise<unknown>,
  configuration: CloudConfiguration,
) {
  const transport = createCloudApiInterceptor(callContainer, configuration)
  return async (options: ProxyRequest) => {
    try {
      return await transport({
        requestParams: options,
        proceed: async () => {
          throw new Error('请求不属于已配置的晓球 API')
        },
      })
    } catch (error) {
      throw new CloudApiConnectionError(error)
    }
  }
}

export function createCloudApiInterceptor(
  callContainer: (options: CloudCall) => Promise<unknown>,
  configuration: CloudConfiguration,
) {
  if (configuration.mediaOrigin) mediaOrigin = configuration.mediaOrigin.replace(/\/+$/, '')
  const configured = configuration.apiBaseUrl.trim().replace(/\/+$/, '')
  const apiBase = configured.endsWith('/api') ? configured : `${configured}/api`
  return async (chain: RequestChain) => {
    const options = chain.requestParams
    if (
      options.url !== apiBase &&
      !options.url.startsWith(`${apiBase}/`) &&
      !options.url.startsWith(`${apiBase}?`)
    )
      return chain.proceed(options)

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
      if (typeof nextOrigin === 'string' && /^https:\/\/[a-z0-9.-]+(?::443)?$/i.test(nextOrigin))
        mediaOrigin = nextOrigin
      return {
        data: result.data,
        statusCode: result.statusCode,
        header: result.header,
        cookies: [],
        errMsg: 'request:ok',
      }
    } finally {
      clearTimeout(timer)
    }
  }
}
