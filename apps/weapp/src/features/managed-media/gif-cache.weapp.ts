import Taro from '@tarojs/taro'
import { createGifCache, type GifCacheIndex } from './gif-cache.logic'
import { downloadCompleteGif } from '../cloud-api/gif-download.weapp'
import { matchGifUrl } from './match-gif.weapp'

const fs = Taro.getFileSystemManager(),
  directory = Taro.env.USER_DATA_PATH + '/xiaoqiu-gifs-v1'
const path = (key: string) => `${directory}/${key}.gif`
const read = (filePath: string) =>
  new Promise<ArrayBuffer>((resolve, reject) =>
    fs.readFile({ filePath, success: (r) => resolve(r.data as ArrayBuffer), fail: reject }),
  )
const write = (filePath: string, data: string | ArrayBuffer) =>
  new Promise<void>((resolve, reject) =>
    fs.writeFile({
      filePath,
      data,
      encoding: typeof data === 'string' ? 'utf8' : 'binary',
      success: () => resolve(),
      fail: reject,
    }),
  )
const remove = (filePath: string) =>
  new Promise<void>((resolve, reject) =>
    fs.unlink({ filePath, success: () => resolve(), fail: reject }),
  )
const cache = createGifCache({
  async index() {
    await new Promise<void>((resolve, reject) =>
      fs.mkdir({
        dirPath: directory,
        recursive: true,
        success: () => resolve(),
        fail: (e) => (/exist/i.test(e.errMsg) ? resolve() : reject(e)),
      }),
    )
    let index: GifCacheIndex = {}
    try {
      const body = await new Promise<string>((resolve, reject) =>
        fs.readFile({
          filePath: directory + '/index.json',
          encoding: 'utf8',
          success: (r) => resolve(String(r.data)),
          fail: reject,
        }),
      )
      const parsed: unknown = JSON.parse(body)
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed))
        index = parsed as GifCacheIndex
    } catch {
      /* Reconstructible cache index. */
    }
    const files = await new Promise<string[]>((resolve, reject) =>
      fs.readdir({ dirPath: directory, success: (r) => resolve(r.files), fail: reject }),
    )
    for (const name of files)
      if (/^[\w-]+\.gif$/.test(name) && !index[name.slice(0, -4)])
        await remove(directory + '/' + name).catch(() => {})
    return index
  },
  persist: (index) => write(directory + '/index.json', JSON.stringify(index)),
  read: (key) => read(path(key)),
  write: (key, bytes) => write(path(key), bytes),
  remove: (key) => remove(path(key)),
  path,
  fetch: (asset) => downloadCompleteGif(matchGifUrl(asset), asset.bytes),
  now: Date.now,
})
export const prepareMatchGif = cache.load
