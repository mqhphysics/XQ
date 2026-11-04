export interface CropSource {
  width: number
  height: number
}
export interface CropPosition {
  zoom: number
  x: number
  y: number
}
export function imageCrop(source: CropSource, ratio: number, position: CropPosition) {
  const width = Math.min(source.width, source.height * ratio) / Math.max(1, position.zoom)
  const height = Math.min(source.height, width / ratio)
  return {
    width,
    height,
    x: Math.max(0, source.width - width) * Math.max(0, Math.min(1, position.x)),
    y: Math.max(0, source.height - height) * Math.max(0, Math.min(1, position.y)),
  }
}
