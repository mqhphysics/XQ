import { Canvas, Image, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useEffect, useId, useState } from 'react'
import { useNativeViewport } from '../../features/native-navigation/viewport.weapp'
import { measureNativeContent } from '../native-navigation/content-pager.weapp'
import { radarGeometry, radarValues, type PlayerAbilities } from './player-radar.logic'
import './player-radar.weapp.scss'

export function NativePlayerRadar({
  abilities,
  active,
}: {
  abilities: PlayerAbilities
  active: boolean
}) {
  const id = `player-radar-${useId().replace(/[^a-z0-9]/gi, '')}`
  const info = useNativeViewport()
  const [failed, setFailed] = useState(false)
  const [preview, setPreview] = useState<string | null>(null)
  const values = radarValues(abilities)
  const key = values.map((a) => `${a.key}:${a.value}`).join('|')
  useEffect(() => {
    if (!active || values.length < 3) return
    setFailed(false)
    let alive = true
    let timer: ReturnType<typeof setTimeout> | undefined
    const draw = (attempt = 0) => {
      const query = Taro.createSelectorQuery()
      query.select('#' + id).fields({ node: true, size: true })
      query.select('.native-player-radar >>> #' + id).fields({ node: true, size: true })
      query.exec((results: Array<{ node?: Taro.Canvas; width: number; height: number } | null>) => {
        if (!alive) return
        const field = results.find((r) => r?.node && r.width > 0 && r.height > 0)
        if (!field?.node) {
          if (attempt < 2) timer = setTimeout(() => draw(attempt + 1), 80)
          else setFailed(true)
          return
        }
        const shape = radarGeometry(abilities, field.width, field.height)
        if (!shape) {
          setFailed(true)
          return
        }
        try {
          const node = field.node,
            ratio = info.pixelRatio || 1
          node.width = Math.round(field.width * ratio)
          node.height = Math.round(field.height * ratio)
          const ctx = node.getContext('2d') as CanvasRenderingContext2D
          ctx.scale(ratio, ratio)
          ctx.clearRect(0, 0, field.width, field.height)
          ctx.lineJoin = 'round'
          const polygon = (points: Array<{ x: number; y: number }>) => {
            ctx.beginPath()
            points.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)))
            ctx.closePath()
          }
          for (const level of [1, 0.75, 0.5, 0.25]) {
            polygon(
              shape.axes.map((a) => ({
                x: shape.center.x + (a.end.x - shape.center.x) * level,
                y: shape.center.y + (a.end.y - shape.center.y) * level,
              })),
            )
            ctx.fillStyle = level === 1 ? '#f1f6ef' : '#f8faf6'
            ctx.fill()
            ctx.strokeStyle = '#d4e1d0'
            ctx.lineWidth = 1
            ctx.stroke()
          }
          ctx.strokeStyle = '#d4e1d0'
          for (const a of shape.axes) {
            ctx.beginPath()
            ctx.moveTo(shape.center.x, shape.center.y)
            ctx.lineTo(a.end.x, a.end.y)
            ctx.stroke()
          }
          polygon(shape.axes.map((a) => a.point))
          ctx.fillStyle = 'rgba(43, 117, 77, 0.20)'
          ctx.fill()
          ctx.strokeStyle = '#32784f'
          ctx.lineWidth = 2
          ctx.stroke()
          for (const a of shape.axes) {
            ctx.beginPath()
            ctx.arc(a.point.x, a.point.y, 3, 0, Math.PI * 2)
            ctx.fillStyle = '#32784f'
            ctx.fill()
            ctx.strokeStyle = '#ffffff'
            ctx.lineWidth = 1.5
            ctx.stroke()
            ctx.font = '500 13px sans-serif'
            ctx.textAlign = a.align
            ctx.textBaseline = 'middle'
            ctx.fillStyle = '#31543e'
            const text = `${a.label} ${Number.isInteger(a.value) ? a.value : Number(a.value.toFixed(1))}`
            const textWidth = ctx.measureText(text).width
            const left =
              a.align === 'left' ? 8 : a.align === 'right' ? textWidth + 8 : textWidth / 2 + 8
            const right =
              a.align === 'right'
                ? field.width - 8
                : a.align === 'left'
                  ? field.width - textWidth - 8
                  : field.width - textWidth / 2 - 8
            ctx.fillText(text, Math.max(left, Math.min(right, a.labelPoint.x)), a.labelPoint.y)
          }
          // A visible native Canvas can cover RootPortal drawers. Keep the PNG in memory instead.
          setPreview(node.toDataURL('image/png', 1))
        } catch {
          setFailed(true)
        }
      })
    }
    timer = setTimeout(() => draw(), 60)
    return () => {
      alive = false
      clearTimeout(timer)
    }
  }, [key, active, id, info.windowWidth, info.pixelRatio])
  const shown = values.length >= 3 && !failed
  useEffect(() => {
    Taro.nextTick(measureNativeContent)
  }, [shown])
  if (!shown) return null
  return (
    <View className="native-player-radar">
      <Canvas id={id} type="2d" className="native-player-radar__canvas" />
      {preview && (
        <Image
          className="native-player-radar__image"
          src={preview}
          mode="aspectFit"
          aria-label={values.map((a) => `${a.label}${a.value}`).join('，')}
        />
      )}
    </View>
  )
}
