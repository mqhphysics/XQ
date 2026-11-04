import sharp from 'sharp'

export async function gifFixture(frames = 3, delay = 100, width = 32, height = 32) {
  const pixels = Buffer.alloc(width * height * frames * 3)
  for (let frame = 0; frame < frames; frame++)
    pixels.fill((frame * 43) % 255, frame * width * height * 3, (frame + 1) * width * height * 3)
  return sharp(pixels, { raw: { width, height: height * frames, channels: 3, pageHeight: height } })
    .gif({ delay: Array.from({ length: frames }, () => delay), loop: 0 })
    .toBuffer()
}
export const dataUrl = (body: Buffer, subtype: string) =>
  `data:image/${subtype};base64,${body.toString('base64')}`
