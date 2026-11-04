/** Preserve rendered frames while discarding comments, application metadata and trailing bytes. */
export function sanitizeLoopingGif(source: Buffer): Buffer {
  if (source.length < 13 || !/^GIF8[79]a$/.test(source.toString('ascii', 0, 6)))
    throw new Error('Invalid GIF header')
  const headerEnd = 13 + (source[10]! & 0x80 ? 3 * 2 ** ((source[10]! & 7) + 1) : 0)
  if (headerEnd > source.length) throw new Error('Truncated GIF palette')
  const header = Buffer.from(source.subarray(0, headerEnd))
  header.write('GIF89a', 0, 'ascii')
  const parts: Buffer[] = [
    header,
    Buffer.from([0x21, 0xff, 11, ...Buffer.from('NETSCAPE2.0', 'ascii'), 3, 1, 0, 0, 0]),
  ]
  const endBlocks = (start: number) => {
    let offset = start
    while (offset < source.length) {
      const size = source[offset++]!
      if (!size) return offset
      offset += size
    }
    throw new Error('Truncated GIF data')
  }
  let cursor = headerEnd
  while (cursor < source.length) {
    const start = cursor
    if (source[cursor] === 0x3b) {
      parts.push(Buffer.from([0x3b]))
      return Buffer.concat(parts)
    }
    if (source[cursor] === 0x21) {
      const label = source[cursor + 1]
      cursor = endBlocks(cursor + 2)
      if (label === 0xf9) {
        if (cursor - start !== 8 || source[start + 2] !== 4)
          throw new Error('Invalid GIF graphics control')
        parts.push(source.subarray(start, cursor))
      }
    } else if (source[cursor] === 0x2c && cursor + 10 < source.length) {
      const packed = source[cursor + 9]!
      const palette = packed & 0x80 ? 3 * 2 ** ((packed & 7) + 1) : 0
      cursor = endBlocks(cursor + 10 + palette + 1)
      parts.push(source.subarray(start, cursor))
    } else throw new Error('Invalid GIF block')
  }
  throw new Error('Missing GIF trailer')
}
