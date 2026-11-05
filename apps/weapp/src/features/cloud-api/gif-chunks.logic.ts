export interface GifChunkReply {
  statusCode: number
  data: ArrayBuffer
  header: Record<string, unknown>
}
export async function completeGifBytes(
  bytes: number,
  fetchRange: (start: number, end: number) => Promise<GifChunkReply>,
) {
  if (!Number.isSafeInteger(bytes) || bytes < 14 || bytes > 8 * 1024 * 1024)
    throw Error('GIF 文件大小无效')
  const chunkSize = 512 * 1024,
    result = new Uint8Array(bytes)
  let next = 0
  const worker = async () => {
    while (next < bytes) {
      const start = next,
        end = Math.min(bytes, start + chunkSize) - 1
      next = end + 1
      const response = await fetchRange(start, end)
      const range = Object.entries(response.header).find(
        ([k]) => k.toLowerCase() === 'content-range',
      )?.[1]
      if (
        !(response.data instanceof ArrayBuffer) ||
        response.data.byteLength !== end - start + 1 ||
        (response.statusCode !== 206 &&
          !(start === 0 && end + 1 === bytes && response.statusCode === 200)) ||
        (response.statusCode === 206 && range !== `bytes ${start}-${end}/${bytes}`)
      )
        throw Error('GIF 数据不完整，请重试')
      result.set(new Uint8Array(response.data), start)
    }
  }
  await Promise.all([worker(), worker(), worker()])
  return result.buffer
}
