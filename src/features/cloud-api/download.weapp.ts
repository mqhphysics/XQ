import Taro from '@tarojs/taro'
import { initializeCloudApi } from './request.weapp'

// Private images use the WeChat channel as bytes, preserving backend authorization.
// Keep these preview files bounded rather than accumulating persistent downloads.
const previews: string[] = []
const userDataPath = Taro.env.USER_DATA_PATH!
const prefix = `${userDataPath}/xiaoqiu-cloud-preview-`
const fs = Taro.getFileSystemManager()
fs.readdir({
  dirPath: userDataPath,
  success: ({ files }) => {
    for (const file of files.filter((name) => name.startsWith('xiaoqiu-cloud-preview-')))
      fs.unlink({ filePath: `${userDataPath}/${file}` })
  },
})

export async function downloadCloudApiMedia(url: string, header: Record<string, string>) {
  const env = process.env.TARO_APP_API_PROXY_ENV?.trim()
  if (!env) return Taro.downloadFile({ url, header })
  const mediaOrigin = process.env.TARO_APP_API_PROXY_MEDIA_ORIGIN?.replace(/\/+$/, '')
  if (!mediaOrigin || !url.startsWith(`${mediaOrigin}/api/`)) throw new Error('照片地址无效')
  await initializeCloudApi()
  const result = await new Promise<{ statusCode: number; data: unknown }>((resolve, reject) => {
    const operation = wx.cloud.callContainer({
      config: { env },
      path: url.slice(mediaOrigin.length),
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
  if (!(bytes instanceof ArrayBuffer) || bytes.byteLength > 8 * 1024 * 1024)
    throw new Error('照片过大或格式无效')
  const tempFilePath = `${prefix}${Date.now()}-${Math.random().toString(36).slice(2)}.image`
  await new Promise<void>((resolve, reject) =>
    fs.writeFile({
      filePath: tempFilePath,
      data: bytes,
      success: () => resolve(),
      fail: reject,
    }),
  )
  previews.push(tempFilePath)
  while (previews.length > 16) fs.unlink({ filePath: previews.shift()! })
  return { statusCode: result.statusCode, tempFilePath }
}
