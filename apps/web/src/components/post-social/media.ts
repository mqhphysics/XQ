import { preparePostImage } from '../post-image-picker'

export const MAX_POST_IMAGES = 9
export const MAX_POST_DATA_LENGTH = 24_000_000

export async function prepareDesktopPostImage(file: File): Promise<string> {
  if (file.type !== 'image/gif') return preparePostImage(file)
  if (file.size > 4 * 1024 * 1024) throw new Error('GIF 需小于 4 MiB')
  const url = URL.createObjectURL(file)
  try {
    const image = new Image()
    image.src = url
    await image.decode()
    if (
      image.naturalWidth < 64 ||
      image.naturalHeight < 64 ||
      image.naturalWidth * image.naturalHeight > 24_000_000
    ) {
      throw new Error('GIF 尺寸过小或过大')
    }
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result))
      reader.onerror = () => reject(new Error('GIF 读取失败'))
      reader.readAsDataURL(file)
    })
  } finally {
    URL.revokeObjectURL(url)
  }
}
