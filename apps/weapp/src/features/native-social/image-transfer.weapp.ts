import { productRequest } from '../product/product.repository'
import { readSession } from '../product/session'
import { nativeImageData, type NativeDraftImage } from './images.weapp'

interface Transfer {
  id: string
  partCharacters: number
  parts: number
  received: number[]
}
const newId = () =>
  'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const n = Math.floor(Math.random() * 16)
    return (c === 'x' ? n : (n & 3) | 8).toString(16)
  })

/** Small payloads keep the old request; large images resume authenticated, idempotent parts. */
export async function nativeImageSubmission(
  images: NativeDraftImage[],
  progress: (percent: number) => void = () => {},
  allocated: () => void = () => {},
): Promise<{ imageDataUrls?: string[]; imageUploadIds?: string[] }> {
  const token = readSession()?.accessToken
  if (!token) throw new Error('请先登录后上传图片')
  const data = await Promise.all(images.map(nativeImageData))
  if (token !== readSession()?.accessToken) throw new Error('账号已切换，请重新打开页面')
  const characters = data.reduce((total, value) => total + value.length, 0)
  if (characters > 24_000_000) throw new Error('图片合计过大，请减少图片后再发布')
  if (characters <= 750000) return { imageDataUrls: data }
  const ids: string[] = []
  let completed = 0
  for (let i = 0; i < images.length; i++) {
    if (token !== readSession()?.accessToken) throw new Error('账号已切换，请重新打开页面')
    const image = images[i]!,
      content = data[i]!
    if (!image.transferId) {
      image.transferId = newId()
      allocated()
    }
    const url = `/me/image-transfers/${image.transferId}`
    const state = await productRequest<Transfer>(url, {
      method: 'PUT',
      data: { characters: content.length },
    })
    if (state.partCharacters < 1 || state.partCharacters > 750000)
      throw new Error('图片上传配置异常，请重试')
    for (let part = 0; part < state.parts; part++) {
      if (token !== readSession()?.accessToken) throw new Error('账号已切换，请重新打开页面')
      const value = content.slice(part * state.partCharacters, (part + 1) * state.partCharacters)
      if (!state.received.includes(part))
        await productRequest(`${url}/parts/${part}`, { method: 'PUT', data: { content: value } })
      progress(
        Math.min(
          100,
          Math.round(
            ((completed + Math.min(content.length, (part + 1) * state.partCharacters)) /
              characters) *
              100,
          ),
        ),
      )
    }
    completed += content.length
    ids.push(image.transferId)
  }
  if (token !== readSession()?.accessToken) throw new Error('账号已切换，请重新打开页面')
  return { imageUploadIds: ids }
}
