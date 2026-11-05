import Taro from '@tarojs/taro'
import { initializeCloudApi } from './request.weapp'
import { completeGifBytes, type GifChunkReply } from './gif-chunks.logic'

export async function downloadCompleteGif(url: string, bytes: number) {
  const env = process.env.TARO_APP_API_PROXY_ENV?.trim()
  if (!env) {
    const response = await Taro.request<ArrayBuffer>({
      url,
      responseType: 'arraybuffer',
      timeout: 90000,
    })
    if (response.statusCode !== 200 || response.data.byteLength !== bytes)
      throw Error('GIF 数据不完整，请重试')
    return response.data
  }
  const origin = process.env.TARO_APP_API_PROXY_MEDIA_ORIGIN?.replace(/\/+$/, '')
  if (!origin || !url.startsWith(origin + '/api/')) throw Error('GIF 地址无效')
  await initializeCloudApi()
  return completeGifBytes(bytes, async (start, end) => {
    for (let attempt = 0; ; attempt++) {
      try {
        return await new Promise<GifChunkReply>((resolve, reject) => {
          const operation = wx.cloud.callContainer({
            config: { env },
            path: url.slice(origin.length),
            method: 'GET',
            header: {
              'X-WX-SERVICE': process.env.TARO_APP_API_PROXY_SERVICE || 'express-5g68',
              Range: `bytes=${start}-${end}`,
            },
            timeout: 45000,
            responseType: 'arraybuffer',
            dataType: 'text',
            success: resolve,
            fail: reject,
          })
          if (operation && typeof operation.then === 'function') operation.then(resolve, reject)
        })
      } catch (error) {
        if (attempt >= 1) throw error
        await new Promise<void>((resolve) => setTimeout(resolve, 500))
      }
    }
  })
}
