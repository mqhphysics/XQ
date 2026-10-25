import { Canvas, Image, Text, View } from '@tarojs/components'
import type { CanvasTouchEvent } from '@tarojs/components/types/common'
import Taro, { useDidHide, useDidShow, useReady } from '@tarojs/taro'
import { useEffect, useRef, useState } from 'react'
import sceneSource from '../../assets/login-art/stadium-particle-plate.weapp.png'
import brandMark from '../../assets/home-visual/brand-mark.png'
import { canvasTouchPosition } from './touch-field.logic'
import {
  createNativeParticleField,
  readSceneImagePixels,
  type SceneCanvas,
  type SceneStats,
} from './particle-field.weapp'

export function NativeAuthScene({
  layoutKey,
  active = true,
  interactive = true,
}: {
  layoutKey: string
  active?: boolean
  interactive?: boolean
}) {
  const engine = useRef<ReturnType<typeof createNativeParticleField> | null>(null)
  const bounds = useRef({ left: 0, top: 0 })
  const mounted = useRef(true)
  const interactiveNow = useRef(interactive)
  interactiveNow.current = interactive
  const initializing = useRef(false)
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const finger = useRef<number | null>(null)
  const [stats, setStats] = useState<SceneStats>({
    particles: 0,
    displacement: 0,
    state: 'loading',
  })
  const [ready, setReady] = useState(false)
  const sourcePath = sceneSource.startsWith('/') ? sceneSource : `/${sceneSource}`
  const diagnostic = useRef({ resource: '检查中', state: '加载中' })
  const pitchDebug = Taro.getCurrentInstance().router?.params.pitchDebug === '1'
  const measure = (attempt = 0) => {
    if (!active || !interactive || initializing.current) return
    Taro.createSelectorQuery()
      .select('#native-auth-canvas')
      .fields({ node: true, size: true, rect: true }, (result) => {
        const node = result as unknown as {
          node?: SceneCanvas
          width?: number
          height?: number
          left?: number
          top?: number
        }
        if (!mounted.current || !interactiveNow.current) return
        if (!node.node || !node.width || !node.height) {
          if (attempt < 4) retryTimer.current = setTimeout(() => measure(attempt + 1), 60)
          return
        }
        bounds.current = { left: node.left ?? 0, top: node.top ?? 0 }
        if (engine.current) {
          engine.current.resize(node.width, node.height)
          return
        }
        initializing.current = true
        const canvas = node.node,
          width = node.width,
          height = node.height
        const image = canvas.createImage()
        image.onload = () => {
          if (!mounted.current || !interactiveNow.current) {
            initializing.current = false
            return
          }
          try {
            const pixels = readSceneImagePixels(canvas, image)
            engine.current = createNativeParticleField(
              canvas,
              image,
              pixels,
              width,
              height,
              Taro.getWindowInfo().pixelRatio,
              (next) => {
                if (mounted.current) {
                  setStats(next)
                  diagnostic.current.state = next.state
                  if (next.state === 'fallback') setReady(false)
                }
              },
            )
            setReady(true)
          } catch (error) {
            console.warn('Native login canvas failed to initialize', error)
            setStats({ particles: 0, displacement: 0, state: 'fallback' })
            diagnostic.current.state = '画布初始化失败'
          }
          initializing.current = false
        }
        image.onerror = () => {
          if (mounted.current) {
            initializing.current = false
            setStats({ particles: 0, displacement: 0, state: 'fallback' })
            diagnostic.current.state = '画布图片加载失败'
          }
        }
        image.src = sourcePath
      })
      .exec()
  }
  useReady(measure)
  useEffect(() => {
    if (!pitchDebug) return
    void Taro.getImageInfo({ src: sourcePath }).then(
      (info) => {
        diagnostic.current.resource = `${info.width}×${info.height}`
      },
      (error: { errMsg?: string }) => {
        diagnostic.current.resource = error.errMsg || '图片读取失败'
      },
    )
    const diagnosticTimer = setTimeout(() => {
      if (!mounted.current) return
      let artSize = '未找到',
        canvasSize = '未找到'
      const query = Taro.createSelectorQuery()
      query.select('.native-auth-scene__art').boundingClientRect((rect) => {
        const area = rect as { width?: number; height?: number } | null
        if (area) artSize = `${Math.round(area.width || 0)}×${Math.round(area.height || 0)}`
      })
      query.select('#native-auth-canvas').boundingClientRect((rect) => {
        const area = rect as { width?: number; height?: number } | null
        if (area) canvasSize = `${Math.round(area.width || 0)}×${Math.round(area.height || 0)}`
      })
      query.exec(() => {
        if (!mounted.current) return
        void Taro.showModal({
          title: '球场显示检查',
          content: `图片：${diagnostic.current.resource}\n球场区域：${artSize}\n画布区域：${canvasSize}\n动画：${diagnostic.current.state}`,
          showCancel: false,
        })
      })
    }, 2500)
    return () => clearTimeout(diagnosticTimer)
  }, [pitchDebug, sourcePath])
  useEffect(() => {
    Taro.nextTick(measure)
  }, [layoutKey, active, interactive])
  useEffect(() => {
    if (!interactive) {
      engine.current?.destroy()
      engine.current = null
      setReady(false)
    }
  }, [interactive])
  useEffect(() => {
    engine.current?.setVisible(active)
  }, [active])
  useEffect(
    () => () => {
      mounted.current = false
      if (retryTimer.current) clearTimeout(retryTimer.current)
      engine.current?.destroy()
    },
    [],
  )
  useDidHide(() => engine.current?.setVisible(false))
  useDidShow(() => engine.current?.setVisible(active))
  const touch = (event: CanvasTouchEvent) => {
    const point = event.touches.find(
      (item) => finger.current === null || item.identifier === finger.current,
    )
    if (!point) return
    const position = canvasTouchPosition(point, bounds.current)
    if (!position) return
    finger.current = point.identifier
    engine.current?.setPointer(position[0], position[1], true)
  }
  const release = () => {
    finger.current = null
    engine.current?.setPointer(0, 0, false)
  }
  return (
    <View
      className="native-auth-scene"
      data-scene-state={stats.state}
      data-particles={stats.particles}
      data-displacement={stats.displacement}
    >
      <View className="native-auth-scene__brand">
        <Image className="native-auth-scene__mark" src={brandMark} mode="aspectFit" />
        <Text>晓球</Text>
      </View>
      <View className="native-auth-scene__art">
        {(!ready || !interactive) && (
          <Image
            className="native-auth-scene__image"
            src={sourcePath}
            mode="widthFix"
            onLoad={(event) => console.info('XQ_PITCH_IMAGE_LOADED', JSON.stringify(event.detail))}
            onError={(event) => console.warn('XQ_PITCH_IMAGE_ERROR', event.detail.errMsg)}
          />
        )}
        {interactive && (
          <Canvas
            id="native-auth-canvas"
            canvasId="native-auth-canvas"
            className="native-auth-scene__canvas"
            style={`opacity:${ready ? 1 : 0};`}
            type="2d"
            disableScroll
            onTouchStart={touch}
            onTouchMove={touch}
            onTouchEnd={release}
            onTouchCancel={release}
          />
        )}
      </View>
    </View>
  )
}
