import assert from 'node:assert/strict'
import test from 'node:test'
import {
  guideAccountRect,
  guideAudience,
  guideSectionOrder,
  guideSteps,
} from './flow.logic.weapp.ts'

test('first-use guide walks home, schedule, me and ends on 主队 next to 添加关注', () => {
  assert.deepEqual([...guideSectionOrder], ['home', 'schedule', 'me', 'team'])
  for (const [role, linked] of [
    ['student', false],
    ['player', true],
    ['captain', false],
    ['captain', true],
  ] as const) {
    const steps = guideSteps(role, linked)
    const sections = steps.map((step) => guideSectionOrder.indexOf(step.section))
    assert.ok(sections.every((value) => value >= 0))
    assert.ok(sections.every((value, index) => index === 0 || value >= sections[index - 1]!))
    assert.deepEqual([...new Set(steps.map((step) => step.section))], [...guideSectionOrder])
    assert.ok(steps.every((step) => step.section !== 'data'))
    assert.equal(steps[0]?.id, 'home-account')
    assert.equal(steps.at(-1)?.action, 'finish')
    assert.equal(steps.at(-1)?.section, 'team')
    assert.equal(steps.at(-1)?.selector, '#native-guide-team-menu')
    assert.equal(steps.at(-1)?.title, '点这里添加关注，也可以先随便逛逛')
    assert.equal(steps.filter((step) => step.action === 'finish').length, 1)
    assert.ok(
      steps.every(
        (step) =>
          step.button &&
          step.page &&
          step.title &&
          step.selector.split(',').some((part) => part.trim().startsWith('#native-guide-')),
      ),
    )
    assert.ok(steps.every((step) => !step.scroll || step.section === 'home'))
    assert.ok(steps.every((step) => !step.focus || step.selector === `#${step.focus}`))
    assert.equal(new Set(steps.map((step) => step.id)).size, steps.length)
    for (const [index, step] of steps.entries()) {
      const next = steps[index + 1]
      if (step.action === 'next' && next && next.section !== step.section)
        assert.match(step.button, /^下一页：/)
    }
    /* About 8–10 cards for a student, more for players and captains. */
    assert.ok(steps.length >= 8 && steps.length <= 20)
  }
  const student = guideSteps('student')
  assert.equal(student.length, 11)
  /* The UGC feed is no longer a stop; one step frames 赛事公告 and the 平台公告 bar together. */
  assert.ok(student.every((step) => !step.selector.includes('home-feed')))
  assert.deepEqual(
    student.filter((step) => step.also).map((step) => [step.selector, ...step.also!]),
    [['#native-guide-home-hero', '#native-guide-home-notice']],
  )
  assert.ok(student.every((step) => step.action === 'next' || step.action === 'finish'))
  assert.deepEqual(
    guideSteps('player')
      .filter((step) => step.action !== 'next')
      .map((step) => step.action),
    ['player', 'edit', 'back', 'finish'],
  )
  /* Players see how to manage avatar, background and self-evaluation in their profile editor. */
  assert.deepEqual(
    guideSteps('player')
      .filter((step) => step.page === '编辑球员资料')
      .map((step) => step.selector),
    ['#native-guide-player-avatar', '#native-guide-player-cover', '#native-guide-player-ratings'],
  )
  /* Captains who are also players get the player steps first, then the captain steps. */
  assert.deepEqual(
    guideSteps('captain', true)
      .filter((step) => step.action !== 'next')
      .map((step) => step.action),
    ['player', 'edit', 'back', 'manage', 'back', 'finish'],
  )
  assert.deepEqual(
    guideSteps('captain')
      .filter((step) => step.action !== 'next')
      .map((step) => step.action),
    ['manage', 'back', 'finish'],
  )
  /* A 'back' step returns from the detail page straight into the next tab (主队). */
  const captain = guideSteps('captain')
  const back = captain.findIndex((step) => step.action === 'back')
  assert.equal(captain[back + 1]?.navigationTarget, 'team')
  assert.equal(guideSteps('player').length, student.length + 5)
  assert.equal(guideSteps('captain', true).length, student.length + 7)
  assert.equal(guideSteps('player').at(-2)?.id, 'team-follow')
  assert.equal(guideAudience({}, []), 'student')
  assert.equal(guideAudience({ linkedPlayer: { id: 'p' } }, []), 'player')
  assert.equal(guideAudience({ linkedPlayer: { id: 'p' } }, [{ id: 't' }]), 'captain')
})

test('account step falls back next to the capsule on wide windows and top-left on phones', () => {
  const capsule = { left: 1000 }
  assert.deepEqual(
    guideAccountRect({ top: 4, rowHeight: 56, wide: true, capsule, windowWidth: 1100 }),
    { left: 1000 - 12 - 32, top: 16, width: 32, height: 32 },
  )
  const phone = guideAccountRect({
    top: 48,
    rowHeight: 32,
    wide: false,
    capsule: { left: 281 },
    windowWidth: 375,
  })
  assert.equal(phone.left, 14)
  assert.equal(phone.width, 42)
  assert.equal(phone.top, 43)
})

test('every page change waits on its destination navigation before switching', () => {
  for (const role of ['student', 'player', 'captain'] as const) {
    const steps = guideSteps(role)
    assert.equal(steps.filter((step) => step.navigationTarget).length, 3)
    steps.forEach((step, i) => {
      if (step.navigationTarget) {
        assert.equal(step.section, steps[i - 1]!.section)
        assert.equal(steps[i + 1]!.section, step.navigationTarget)
        assert.equal(step.selector, '#native-guide-nav-' + step.navigationTarget)
        assert.equal(step.action, 'next')
      }
    })
  }
})
