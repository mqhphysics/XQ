/** Change only GIF loop metadata. Image descriptors, palettes and compressed pixels stay intact. */
export function loopGifForever(input: ArrayBuffer): ArrayBuffer {
  const bytes = new Uint8Array(input)
  const text = (start: number, length: number) =>
    String.fromCharCode(...bytes.subarray(start, start + length))
  if (bytes.length < 13 || !['GIF87a', 'GIF89a'].includes(text(0, 6))) return input
  const start = 13 + (bytes[10]! & 0x80 ? 3 * 2 ** ((bytes[10]! & 7) + 1) : 0)
  if (start > bytes.length) return input
  const blocksEnd = (offset: number) => {
    let cursor = offset
    while (cursor < bytes.length) {
      const size = bytes[cursor++]!
      if (!size) return cursor
      cursor += size
    }
    return -1
  }
  let cursor = start
  while (cursor < bytes.length) {
    const marker = bytes[cursor]!
    if (marker === 0x3b) break
    if (marker === 0x21) {
      if (
        bytes[cursor + 1] === 0xff &&
        bytes[cursor + 2] === 11 &&
        ['NETSCAPE2.0', 'ANIMEXTS1.0'].includes(text(cursor + 3, 11)) &&
        bytes[cursor + 14] === 3 &&
        bytes[cursor + 15] === 1 &&
        cursor + 18 < bytes.length
      ) {
        if (bytes[cursor + 16] === 0 && bytes[cursor + 17] === 0) return input
        const result = bytes.slice()
        result[cursor + 16] = 0
        result[cursor + 17] = 0
        return result.buffer
      }
      cursor = blocksEnd(cursor + 2)
    } else if (marker === 0x2c && cursor + 10 < bytes.length) {
      const packed = bytes[cursor + 9]!
      const palette = packed & 0x80 ? 3 * 2 ** ((packed & 7) + 1) : 0
      cursor = blocksEnd(cursor + 10 + palette + 1)
    } else return input
    if (cursor < 0) return input
  }
  const extension = new Uint8Array([
    0x21,
    0xff,
    11,
    ...Array.from('NETSCAPE2.0', (c) => c.charCodeAt(0)),
    3,
    1,
    0,
    0,
    0,
  ])
  const result = new Uint8Array(bytes.length + extension.length)
  result.set(bytes.subarray(0, start))
  result.set(extension, start)
  result.set(bytes.subarray(start), start + extension.length)
  return result.buffer
}
