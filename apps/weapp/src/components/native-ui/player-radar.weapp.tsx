import { Button, Canvas, Image, Text, View } from '@tarojs/components'
import Taro, { useDidHide, useDidShow } from '@tarojs/taro'
import { useContext, useEffect, useId, useState } from 'react'
import { useNativePanelVisible } from '../native-navigation/panel-context.weapp'
import { NativeDetailActiveContext } from '../../features/native-navigation/detail-context.weapp'
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
  const panelVisible = useNativePanelVisible(),
    detailVisible = useContext(NativeDetailActiveContext)
  const [appVisible, setAppVisible] = useState(true)
  useDidShow(() => setAppVisible(true))
  useDidHide(() => setAppVisible(false))
  const drawing = active && panelVisible && detailVisible && appVisible
  const info = useNativeViewport()
  const [failed, setFailed] = useState(false)
  const [preview, setPreview] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  const values = radarValues(abilities)
  const key = values.map((a) => `${a.key}:${a.value}`).join('|')
  useEffect(() => {
    if (!drawing || values.length < 3) return
    setFailed(false)
    let alive = true
    let timer: ReturnType<typeof setTimeout> | undefined
    const draw = (attempt = 0) => {
      const query = Taro.createSelectorQuery()
      query.select('#' + id).fields({ node: true, size: true })
      // The inline player page adds a custom-component boundary inside the hub swiper.
      query.select('.native-player-detail >>> #' + id).fields({ node: true, size: true })
      query.select('#' + id + '-plot').boundingClientRect()
      query.select('.native-player-detail >>> #' + id + '-plot').boundingClientRect()
      query.exec((results: Array<{ node?: Taro.Canvas; width: number; height: number } | null>) => {
        if (!alive) return
        const field = results.find((r) => r?.node)
        const plot = results.slice(2).find((r) => r?.width && r.height)
        if (!field?.node || !plot?.width || !plot.height) {
          if (attempt < 6) timer = setTimeout(() => draw(attempt + 1), 80)
          else {
            console.warn(
              'Player radar layout unavailable',
              JSON.stringify(
                results.map((r) => ({ node: !!r?.node, width: r?.width, height: r?.height })),
              ),
            )
            setFailed(true)
          }
          return
        }
        const shape = radarGeometry(abilities, plot.width, plot.height)
        if (!shape) {
          setFailed(true)
          return
        }
        try {
          const node = field.node,
            ratio = info.pixelRatio || 1
          node.width = Math.round(plot.width * ratio)
          node.height = Math.round(plot.height * ratio)
          const ctx = node.getContext('2d') as CanvasRenderingContext2D
          ctx.scale(ratio, ratio)
          ctx.clearRect(0, 0, plot.width, plot.height)
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
                ? plot.width - 8
                : a.align === 'left'
                  ? plot.width - textWidth - 8
                  : plot.width - textWidth / 2 - 8
            ctx.fillText(text, Math.max(left, Math.min(right, a.labelPoint.x)), a.labelPoint.y)
          }
          // A visible native Canvas can cover RootPortal drawers. Keep the PNG in memory instead.
          setPreview(node.toDataURL('image/png', 1))
        } catch (issue) {
          console.warn(
            'Player radar drawing failed',
            issue instanceof Error ? issue.message : 'canvas error',
          )
          setFailed(true)
        }
      })
    }
    timer = setTimeout(() => draw(), 60)
    return () => {
      alive = false
      clearTimeout(timer)
    }
  }, [key, drawing, id, info.windowWidth, info.pixelRatio, attempt])
  const shown = values.length >= 3
  useEffect(() => {
    Taro.nextTick(measureNativeContent)
  }, [shown, preview, drawing])
  if (!shown) return null
  return (
    <View id={id + '-plot'} className="native-player-radar">
      <Canvas id={id} type="2d" className="native-player-radar__canvas" />
      {!preview && !failed && <Text className="native-note">正在绘制能力图…</Text>}
      {failed && (
        <Button className="native-button" onClick={() => setAttempt((value) => value + 1)}>
          重新加载能力图
        </Button>
      )}
      {preview && (
        <Image
          className="native-player-radar__image"
          src={preview}
          mode="aspectFit"
          onLoad={measureNativeContent}
          aria-label={values.map((a) => `${a.label}${a.value}`).join('，')}
        />
      )}
    </View>
  )
}
