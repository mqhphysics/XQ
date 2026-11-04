import Taro from '@tarojs/taro'
import type { imageCrop } from './crop.logic'

function bounded<T>(work: Promise<T>, label: string, ms = 8000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(label + '超时，请重试')), ms)
    work.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (error: unknown) => {
        clearTimeout(timer)
        reject(error)
      },
    )
  })
}

/** Canvas 2D nodes also work inside the dialog's RootPortal/custom-component boundary. */
export async function exportNativeCrop(
  canvasId: string,
  path: string,
  crop: NonNullable<ReturnType<typeof imageCrop>>,
  output: { width: number; height: number },
) {
  const canvas = await bounded(
    new Promise<Taro.Canvas>((resolve, reject) => {
      const query = Taro.createSelectorQuery()
      query.select('#' + canvasId).fields({ node: true })
      query.select('.native-dialog >>> #' + canvasId).fields({ node: true })
      query.exec((results: Array<{ node?: Taro.Canvas } | null>) => {
        const node = results.find((item) => item?.node)?.node
        if (node) resolve(node)
        else reject(new Error('图片处理尚未就绪，请重试'))
      })
    }),
    '准备图片',
    3000,
  )
  canvas.width = output.width
  canvas.height = output.height
  const context = canvas.getContext('2d') as {
    clearRect: (x: number, y: number, width: number, height: number) => void
    drawImage: (image: ReturnType<Taro.Canvas['createImage']>, ...coordinates: number[]) => void
  }
  const image = canvas.createImage()
  await bounded(
    new Promise<void>((resolve, reject) => {
      image.onload = () => resolve()
      image.onerror = () => reject(new Error('图片读取失败，请重新选择'))
      image.src = path
    }),
    '读取图片',
  )
  context.clearRect(0, 0, output.width, output.height)
  context.drawImage(
    image,
    crop.x,
    crop.y,
    crop.width,
    crop.height,
    0,
    0,
    output.width,
    output.height,
  )
  const file = await bounded(
    Taro.canvasToTempFilePath({
      canvas,
      x: 0,
      y: 0,
      width: output.width,
      height: output.height,
      destWidth: output.width,
      destHeight: output.height,
      fileType: 'jpg',
      quality: 0.9,
    }),
    '处理图片',
  )
  try {
    return await bounded(
      new Promise<string>((resolve, reject) =>
        Taro.getFileSystemManager().readFile({
          filePath: file.tempFilePath,
          encoding: 'base64',
          success: (value) => resolve('data:image/jpeg;base64,' + String(value.data)),
          fail: reject,
        }),
      ),
      '准备上传',
    )
  } finally {
    Taro.getFileSystemManager().unlink({ filePath: file.tempFilePath, fail: () => {} })
  }
}
