import assert from 'node:assert/strict'
import test from 'node:test'

import { tournamentHeroSlides } from './home-announcements.ts'

test('hero slides keep one image for each tournament announcement', () => {
  const slides = tournamentHeroSlides([
    { id: 'cup', title: '绿茵杯进行中', body: '半决赛', imageUrl: '/cup.webp' },
    { id: 'semi', title: '半决赛还差一场', body: '2:1', imageUrl: '/semi.webp' },
    { id: 'final', title: '决赛档期已排定', body: '9 月 14 日', imageUrl: '/final.webp' },
    { id: 'extra', title: '更多', body: '不会进入首屏', imageUrl: '/extra.webp' },
  ])

  assert.deepEqual(
    slides.map((slide) => slide.id),
    ['cup', 'semi', 'final'],
  )
})

test('a tournament announcement without an image stays in the hero copy', () => {
  const slides = tournamentHeroSlides([
    { id: 'text', title: '绿茵杯进行中', body: '半决赛', imageUrl: null },
  ])
  assert.equal(slides[0]?.id, 'text')
})

test('imaged tournament announcements are not mixed with imageless ones', () => {
  const slides = tournamentHeroSlides([
    { id: 'photo', title: '绿茵杯进行中', body: '半决赛', imageUrl: '/cup.webp' },
    { id: 'text', title: '无图', body: '不进轮播', imageUrl: null },
  ])
  assert.deepEqual(
    slides.map((slide) => slide.id),
    ['photo'],
  )
})
