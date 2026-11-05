export function gifInfo(input: ArrayBuffer) {
  const b = new Uint8Array(input)
  const word = (i: number) => b[i]! + b[i + 1]! * 256
  const text = (i: number, n: number) => String.fromCharCode(...b.subarray(i, i + n))
  if (b.length < 14 || !['GIF87a', 'GIF89a'].includes(text(0, 6))) throw Error('GIF 文件无效')
  let cursor = 13 + (b[10]! & 128 ? 3 * 2 ** ((b[10]! & 7) + 1) : 0)
  let frames = 0,
    durationMs = 0,
    delay = 0,
    loop = -1
  const skip = (start: number) => {
    let i = start
    while (i < b.length) {
      const size = b[i++]!
      if (!size) return i
      i += size
    }
    throw Error('GIF 文件尚未完整加载')
  }
  while (cursor < b.length) {
    if (b[cursor] === 0x3b) {
      if (cursor !== b.length - 1 || !frames) throw Error('GIF 文件无效')
      return { width: word(6), height: word(8), frames, durationMs, loop }
    }
    if (b[cursor] === 0x21) {
      if (b[cursor + 1] === 0xf9) {
        if (b[cursor + 2] !== 4 || b[cursor + 7] !== 0) throw Error('GIF 帧数据无效')
        delay = word(cursor + 4) * 10
      }
      if (
        b[cursor + 1] === 0xff &&
        b[cursor + 2] === 11 &&
        ['NETSCAPE2.0', 'ANIMEXTS1.0'].includes(text(cursor + 3, 11)) &&
        b[cursor + 14] === 3 &&
        b[cursor + 15] === 1
      )
        loop = word(cursor + 16)
      cursor = skip(cursor + 2)
    } else if (b[cursor] === 0x2c && cursor + 10 < b.length) {
      const packed = b[cursor + 9]!
      cursor = skip(cursor + 11 + (packed & 128 ? 3 * 2 ** ((packed & 7) + 1) : 0))
      frames++
      durationMs += delay
      delay = 0
    } else throw Error('GIF 文件尚未完整加载')
  }
  throw Error('GIF 文件尚未完整加载')
}
