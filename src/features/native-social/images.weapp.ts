import Taro from '@tarojs/taro'
export interface NativeDraftImage {
  path: string
  mime: string
  owned?: boolean
}
export async function copyNativeDraftImage(image: NativeDraftImage): Promise<NativeDraftImage> {
  const suffix =
    image.mime === 'image/gif'
      ? 'gif'
      : image.mime === 'image/png'
        ? 'png'
        : image.mime === 'image/webp'
          ? 'webp'
          : 'jpg'
  const path = `${Taro.env.USER_DATA_PATH}/xiaoqiu-draft-${Date.now()}-${Math.random().toString(36).slice(2)}.${suffix}`
  await new Promise<void>((resolve, reject) =>
    Taro.getFileSystemManager().copyFile({
      srcPath: image.path,
      destPath: path,
      success: () => resolve(),
      fail: reject,
    }),
  )
  return { path, mime: image.mime, owned: true }
}
export async function nativeImageData(image: NativeDraftImage): Promise<string> {
  const data = await new Promise<string>((resolve, reject) =>
    Taro.getFileSystemManager().readFile({
      filePath: image.path,
      encoding: 'base64',
      success: (result) => resolve(String(result.data)),
      fail: reject,
    }),
  )
  if (data.length > 5_592_408) throw new Error('单张图片需小于4 MiB，请压缩后重新选择')
  return `data:${image.mime};base64,${data}`
}
export async function chooseNativePostImages(count: number): Promise<NativeDraftImage[]> {
  const choice = await Taro.chooseImage({
    count,
    sizeType: ['original'],
    sourceType: ['album', 'camera'],
  })
  const saved: NativeDraftImage[] = []
  try {
    for (const source of choice.tempFilePaths) {
      let path = source
      let info = await Taro.getImageInfo({ src: path })
      if (info.type !== 'gif') {
        const scale = Math.min(1, 1600 / Math.max(info.width, info.height))
        path = (
          await Taro.compressImage({
            src: path,
            quality: 82,
            compressedWidth: Math.round(info.width * scale),
            compressedHeight: Math.round(info.height * scale),
          })
        ).tempFilePath
        info = await Taro.getImageInfo({ src: path })
      }
      const mime =
        info.type === 'gif'
          ? 'image/gif'
          : info.type === 'png'
            ? 'image/png'
            : info.type === 'webp'
              ? 'image/webp'
              : 'image/jpeg'
      await nativeImageData({ path, mime })
      const savedFilePath = await new Promise<string>((resolve, reject) =>
        Taro.getFileSystemManager().saveFile({
          tempFilePath: path,
          success: (result) => {
            if ('savedFilePath' in result) resolve(String(result.savedFilePath))
            else reject(new Error('图片未能保存到草稿，请重新选择'))
          },
          fail: reject,
        }),
      )
      saved.push({ path: savedFilePath, mime })
    }
    return saved
  } catch (issue) {
    await releaseNativePostImages(saved)
    throw issue
  }
}
export async function releaseNativePostImages(images: NativeDraftImage[]) {
  await Promise.allSettled(
    images.map(
      (image) =>
        new Promise<void>((resolve, reject) =>
          (image.owned
            ? Taro.getFileSystemManager().unlink.bind(Taro.getFileSystemManager())
            : Taro.getFileSystemManager().removeSavedFile.bind(Taro.getFileSystemManager()))({
            filePath: image.path,
            success: () => resolve(),
            fail: reject,
          }),
        ),
    ),
  )
}
