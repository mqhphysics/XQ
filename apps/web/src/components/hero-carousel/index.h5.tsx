import { View } from '@tarojs/components'
import { useEffect, useRef, useState } from 'react'

import matchPhoto from '../../assets/home-visual/home-campus-action.webp'
import huddlePhoto from '../../assets/home-visual/home-team-huddle.webp'
import celebrationPhoto from '../../assets/home-visual/home-team-celebration.webp'

import './index.h5.scss'

export interface HeroPhoto {
  src: string
  alt: string
  position?: string
}

const defaultPhotos: readonly HeroPhoto[] = [
  { src: matchPhoto, alt: '校园足球比赛中的带球瞬间', position: 'center 50%' },
  { src: huddlePhoto, alt: '队员们叠手为比赛加油', position: 'center 48%' },
  { src: celebrationPhoto, alt: '队员们一起庆祝比赛', position: 'center 43%' },
]

export function HeroCarousel({
  photos = defaultPhotos,
  onActiveChange,
  onSelect,
}: {
  photos?: readonly HeroPhoto[]
  onActiveChange?: (index: number) => void
  onSelect?: (index: number) => void
}) {
  const [desktop, setDesktop] = useState(() => window.matchMedia('(min-width: 721px)').matches)
  const [reducedMotion, setReducedMotion] = useState(
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  )
  const [visible, setVisible] = useState(!document.hidden)
  const [inView, setInView] = useState(true)
  const [paused, setPaused] = useState(false)
  const [hovered, setHovered] = useState(false)
  const [focused, setFocused] = useState(false)
  const [index, setIndex] = useState(0)
  const [animated, setAnimated] = useState(true)
  const region = useRef<HTMLElement>(null)
  const total = photos.length
  const activeIndex = total ? index % total : 0

  useEffect(() => {
    onActiveChange?.(activeIndex)
  }, [activeIndex, onActiveChange])

  useEffect(() => {
    const size = window.matchMedia('(min-width: 721px)')
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)')
    const updateSize = () => setDesktop(size.matches)
    const updateMotion = () => setReducedMotion(motion.matches)
    const updateVisibility = () => setVisible(!document.hidden)
    size.addEventListener('change', updateSize)
    motion.addEventListener('change', updateMotion)
    document.addEventListener('visibilitychange', updateVisibility)
    return () => {
      size.removeEventListener('change', updateSize)
      motion.removeEventListener('change', updateMotion)
      document.removeEventListener('visibilitychange', updateVisibility)
    }
  }, [])

  useEffect(() => {
    const element = region.current
    if (!element || !desktop) return
    const observer = new IntersectionObserver(([entry]) =>
      setInView(entry?.isIntersecting ?? false),
    )
    observer.observe(element)
    return () => observer.disconnect()
  }, [desktop])

  useEffect(() => {
    if (
      !desktop ||
      total < 2 ||
      reducedMotion ||
      !visible ||
      !inView ||
      paused ||
      hovered ||
      focused
    )
      return
    const timer = window.setTimeout(() => {
      setAnimated(true)
      setIndex((current) => (current < total ? current + 1 : 1))
    }, 5000)
    return () => window.clearTimeout(timer)
  }, [desktop, total, reducedMotion, visible, inView, paused, hovered, focused, index])

  useEffect(() => {
    if (animated) return
    let secondFrame = 0
    const frame = window.requestAnimationFrame(() => {
      secondFrame = window.requestAnimationFrame(() => setAnimated(true))
    })
    return () => {
      window.cancelAnimationFrame(frame)
      window.cancelAnimationFrame(secondFrame)
    }
  }, [animated])

  useEffect(() => {
    if (index > total) {
      setAnimated(false)
      setIndex(0)
    }
  }, [index, total])

  if (!desktop || total === 0) {
    const photo = photos[activeIndex]
    if (!onSelect || !photo) {
      return (
        <View aria-hidden="true" className="experience-hero__media">
          <View className="experience-hero__illustration" />
        </View>
      )
    }
    return (
      <button
        type="button"
        className="experience-hero__media experience-hero__media--announcement"
        aria-label={photo.alt}
        onClick={() => onSelect(activeIndex)}
      >
        <img src={photo.src} alt="" />
      </button>
    )
  }

  const slides = total > 1 ? [...photos, photos[0]!] : photos
  const label = onSelect ? '赛事公告' : '校园足球照片'
  return (
    <section
      ref={region}
      className="experience-hero__media hero-carousel"
      aria-label={label}
      aria-roledescription="轮播图"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false)
      }}
    >
      <div
        className={`hero-carousel__track ${animated && !reducedMotion ? 'hero-carousel__track--animated' : ''}`}
        style={{ transform: `translate3d(-${index * 100}%, 0, 0)` }}
        onTransitionEnd={(event) => {
          if (event.target === event.currentTarget && index === total) {
            setAnimated(false)
            setIndex(0)
          }
        }}
      >
        {slides.map((photo, position) => {
          const slideIndex = position % total
          const slideLabel = `${photo.alt}，${slideIndex + 1} / ${total}`
          const image = (
            <img
              src={photo.src}
              alt={onSelect ? '' : photo.alt}
              style={{ objectPosition: photo.position ?? 'center' }}
              decoding="async"
              draggable={false}
            />
          )
          if (!onSelect) {
            return (
              <div
                className="hero-carousel__slide"
                key={`${photo.src}:${position}`}
                aria-hidden={position !== activeIndex}
                role="group"
                aria-label={`${slideIndex + 1} / ${total}`}
                aria-roledescription="照片"
              >
                {image}
              </div>
            )
          }
          return (
            <button
              type="button"
              className="hero-carousel__slide"
              key={`${photo.src}:${position}`}
              aria-hidden={position !== index}
              aria-label={slideLabel}
              tabIndex={position === index ? 0 : -1}
              onClick={() => onSelect(slideIndex)}
            >
              {image}
            </button>
          )
        })}
      </div>
      {total > 1 && (
        <div className="hero-carousel__controls">
          <div className="hero-carousel__dots" aria-label={onSelect ? '选择公告' : '选择照片'}>
            {photos.map((photo, position) => (
              <button
                type="button"
                className={`hero-carousel__dot ${position === activeIndex ? 'hero-carousel__dot--active' : ''}`}
                key={`${photo.src}:${position}`}
                aria-label={`第 ${position + 1} 张：${photo.alt}`}
                aria-current={position === activeIndex ? 'true' : undefined}
                onClick={(event) => {
                  setAnimated(event.detail !== 0)
                  setIndex(position)
                }}
              />
            ))}
          </div>
          {!reducedMotion && (
            <button
              type="button"
              className="hero-carousel__pause"
              aria-label={
                paused
                  ? onSelect
                    ? '播放公告轮播'
                    : '播放照片轮播'
                  : onSelect
                    ? '暂停公告轮播'
                    : '暂停照片轮播'
              }
              onClick={() => setPaused((current) => !current)}
            >
              {paused ? '播放' : '暂停'}
            </button>
          )}
        </div>
      )}
    </section>
  )
}
