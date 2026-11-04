import assert from 'node:assert/strict'
import test from 'node:test'
import { WELCOME_COPY, computeFlight, isUsableTarget, splitQuoted } from './welcome.logic.h5.ts'

const viewport = { width: 1440, height: 900 }
const card = { left: 460, top: 200, width: 520, height: 500 }

test('welcome copy matches the approved text exactly', () => {
  assert.equal(WELCOME_COPY.title, '欢迎来到晓球')
  assert.equal(WELCOME_COPY.subtitle, '这里记录我们学校的每一场校园足球。')
  assert.deepEqual(
    WELCOME_COPY.bullets.map((bullet) => bullet.text),
    [
      '赛程、比分和积分榜都在「赛程」「数据」里，右上角可以切换杯赛和男子组、女子组。',
      '选一支主队，它的下一场比赛会出现在首页。',
      '在「绿茵动态」里发图、评论，留下场边的瞬间。',
      '微信小程序正在开发中，你的信息将会在小程序中同步。',
    ],
  )
  assert.equal(WELCOME_COPY.footer, '现在是内部测试阶段，遇到问题欢迎随时反馈。')
  assert.equal(WELCOME_COPY.hint, '点击任意处继续')
})

test('splitQuoted keeps every character and marks section names', () => {
  const first = WELCOME_COPY.bullets[0]!.text
  const parts = splitQuoted(first)
  assert.equal(parts.map((part) => part.text).join(''), first)
  assert.deepEqual(
    parts.filter((part) => part.quoted).map((part) => part.text),
    ['「赛程」', '「数据」'],
  )
  assert.deepEqual(splitQuoted('没有引号'), [{ text: '没有引号', quoted: false }])
})

test('flies into a visible announcement label', () => {
  const target = { left: 24, top: 640, width: 120, height: 44 }
  const flight = computeFlight(card, target, viewport)
  assert.equal(flight.toTarget, true)
  assert.equal(flight.dx, 24 + 60 - (460 + 260))
  assert.equal(flight.dy, 640 + 22 - (200 + 250))
  assert.ok(flight.scale > 0 && flight.scale <= 0.2)
})

test('falls back to top centre when the bar is hidden or off screen', () => {
  for (const target of [
    null,
    { left: 0, top: 0, width: 0, height: 0 },
    { left: 24, top: 1200, width: 120, height: 44 },
  ]) {
    assert.equal(isUsableTarget(target, viewport), false)
    const flight = computeFlight(card, target, viewport)
    assert.equal(flight.toTarget, false)
    assert.equal(flight.dx, 0)
    assert.ok(flight.dy < 0)
  }
})
