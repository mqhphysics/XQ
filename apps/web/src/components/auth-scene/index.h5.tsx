import { useEffect, useRef, useState } from 'react'

import { createParticleField, type ParticleField } from './particle-field.h5'

export function AuthScene({ source }: { source: string }) {
  const hostRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [phase, setPhase] = useState<'loading' | 'ready' | 'static' | 'fallback'>('loading')

  useEffect(() => {
    const host = hostRef.current
    const canvas = canvasRef.current
    if (!host || !canvas) return
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)')
    const precisePointer = window.matchMedia('(hover: hover) and (pointer: fine)')
    const image = new Image()
    let field: ParticleField | null = null
    let disposed = false

    const updateDiagnostics = () => {
      if (!field || disposed) return
      const stats = field.getStats()
      host.dataset.particleCount = String(stats.particleCount)
      host.dataset.displacement = stats.maxDisplacement.toFixed(2)
      host.dataset.fps = stats.fps.toFixed(1)
      host.dataset.engineState = stats.state
    }
    const resize = () => {
      const bounds = host.getBoundingClientRect()
      field?.resize(bounds.width, bounds.height)
      updateDiagnostics()
    }
    const start = () => {
      if (disposed) return
      field?.destroy()
      field = null
      resize()
      if (motion.matches) {
        setPhase('static')
        host.dataset.engineState = 'reduced-motion'
        host.dataset.particleCount = '0'
        host.dataset.displacement = '0'
        return
      }
      if (!image.complete || !image.naturalWidth) return
      field = createParticleField(canvas, image, {
        maxParticles: 24000,
        onReady: () => {
          if (!disposed) setPhase('ready')
        },
        onError: () => {
          if (!disposed) setPhase('fallback')
        },
      })
      resize()
      updateDiagnostics()
    }
    const move = (event: PointerEvent) => {
      if (!precisePointer.matches || event.pointerType !== 'mouse') return
      const bounds = host.getBoundingClientRect()
      field?.setPointer(event.clientX - bounds.left, event.clientY - bounds.top, true)
    }
    const leave = () => field?.setPointer(0, 0, false)
    const failure = () => {
      if (!disposed) setPhase('fallback')
    }
    const observer = new ResizeObserver(resize)
    observer.observe(host)
    host.addEventListener('pointermove', move, { passive: true })
    host.addEventListener('pointerleave', leave)
    window.addEventListener('blur', leave)
    motion.addEventListener('change', start)
    image.addEventListener('load', start)
    image.addEventListener('error', failure)
    const diagnosticTimer = window.setInterval(updateDiagnostics, 180)
    image.src = source
    if (image.complete) start()
    return () => {
      disposed = true
      field?.destroy()
      window.clearInterval(diagnosticTimer)
      observer.disconnect()
      host.removeEventListener('pointermove', move)
      host.removeEventListener('pointerleave', leave)
      window.removeEventListener('blur', leave)
      motion.removeEventListener('change', start)
      image.removeEventListener('load', start)
      image.removeEventListener('error', failure)
    }
  }, [source])

  return (
    <div ref={hostRef} className="art-login__scene" data-scene-phase={phase} aria-hidden="true">
      <img className="art-login__scene-image" src={source} alt="" draggable={false} />
      <canvas ref={canvasRef} className="art-login__scene-canvas" />
      <svg className="art-login__scene-lettering" viewBox="0 0 1448 1086" aria-hidden="true">
        <text x="710" y="265" textAnchor="middle">
          CCNU
        </text>
      </svg>
    </div>
  )
}
