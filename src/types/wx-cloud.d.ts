interface WxCloud {
  callContainer<T = unknown>(options: {
    config: { env: string }
    path: string
    method?: string
    header?: Record<string, unknown>
    data?: unknown
    timeout?: number
    dataType?: string
    responseType?: string
    success?: (result: {
      statusCode: number
      data: T
      header: Record<string, string>
      errMsg: string
    }) => void
    fail?: (error: { errMsg?: string; errCode?: number }) => void
  }): Promise<{ statusCode: number; data: T; header: Record<string, string>; errMsg: string }>
}
