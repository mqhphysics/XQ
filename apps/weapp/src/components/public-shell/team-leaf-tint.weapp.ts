/** Recolor palette bytes; optionally speed up frame delays without changing the geometry. */
export function tintLeafGif(input: Uint8Array, color: string, playbackRate = 1): Uint8Array {
  if (!/^#[a-f\d]{6}$/i.test(color) || input[0] !== 71 || input[1] !== 73 || input[2] !== 70)
    throw new Error('Invalid team ornament')
  const bytes = input.slice()
  const channels = [1, 3, 5].map((offset) => parseInt(color.slice(offset, offset + 2), 16))
  const palette = (start: number, packed: number) => {
    const colors = 2 ** ((packed & 7) + 1)
    for (let index = 0; index < colors; index++)
      for (let channel = 0; channel < 3; channel++)
        bytes[start + index * 3 + channel] = channels[channel]!
    return start + colors * 3
  }
  const blocksEnd = (start: number) => {
    let at = start
    while (at < bytes.length && bytes[at]) at += bytes[at]! + 1
    return at + 1
  }
  let at = 13
  let elapsed = 0
  if (bytes[10]! & 128) at = palette(at, bytes[10]!)
  while (at < bytes.length) {
    if (bytes[at] === 59) return bytes
    if (bytes[at] === 33) {
      if (bytes[at + 1] === 249 && bytes[at + 2] === 4 && playbackRate > 0 && playbackRate !== 1) {
        const delay = bytes[at + 4]! + bytes[at + 5]! * 256
        const next = Math.max(
          2,
          Math.round((elapsed + delay) / playbackRate) - Math.round(elapsed / playbackRate),
        )
        bytes[at + 4] = next & 255
        bytes[at + 5] = next >> 8
        elapsed += delay
      }
      at = blocksEnd(at + 2)
    } else if (bytes[at] === 44) {
      const packed = bytes[at + 9]!
      at += 10
      if (packed & 128) at = palette(at, packed)
      at = blocksEnd(at + 1)
    } else throw new Error('Invalid team ornament frame')
  }
  throw new Error('Incomplete team ornament')
}
