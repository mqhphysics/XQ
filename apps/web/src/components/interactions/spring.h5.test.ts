import assert from 'node:assert/strict'
import test from 'node:test'

import { applyOrder } from './follow-order.h5.ts'
import {
  SPRING,
  draggedSlotOffset,
  itemShift,
  moveItem,
  reorderTargetIndex,
  springSettled,
  stepSpring,
  type ItemBox,
} from './spring.h5.ts'

const boxes: ItemBox[] = [
  { id: 'a', top: 0, height: 40 },
  { id: 'b', top: 48, height: 40 },
  { id: 'c', top: 96, height: 40 },
]

test('drag center picks the slot whose midpoint it has crossed', () => {
  assert.equal(reorderTargetIndex(boxes, 0, 20), 0)
  assert.equal(reorderTargetIndex(boxes, 0, 48 + 21), 1)
  assert.equal(reorderTargetIndex(boxes, 0, 96 + 21), 2)
  assert.equal(reorderTargetIndex(boxes, 2, 96), 2)
  assert.equal(reorderTargetIndex(boxes, 2, 47), 1)
  assert.equal(reorderTargetIndex(boxes, 2, 10), 0)
})

test('neighbours slide by one stride and the dragged row lands on the new slot', () => {
  assert.equal(itemShift(1, 0, 2, boxes), -48)
  assert.equal(itemShift(2, 0, 2, boxes), -48)
  assert.equal(itemShift(0, 0, 2, boxes), 0)
  assert.equal(draggedSlotOffset(boxes, 0, 2), 96)

  assert.equal(itemShift(0, 2, 0, boxes), 48)
  assert.equal(itemShift(1, 2, 0, boxes), 48)
  assert.equal(draggedSlotOffset(boxes, 2, 0), -96)
  assert.deepEqual(moveItem(['a', 'b', 'c'], 0, 2), ['b', 'c', 'a'])
  assert.deepEqual(moveItem(['a', 'b', 'c'], 2, 0), ['c', 'a', 'b'])
})

test('uneven rows shift by the dragged row stride, not the neighbour stride', () => {
  const uneven: ItemBox[] = [
    { id: 'a', top: 0, height: 60 },
    { id: 'b', top: 68, height: 80 },
    { id: 'c', top: 156, height: 40 },
  ]
  assert.equal(itemShift(1, 0, 2, uneven), -68)
  assert.equal(itemShift(2, 0, 2, uneven), -68)
  assert.equal(itemShift(0, 2, 0, uneven), 48)
  assert.equal(itemShift(1, 2, 0, uneven), 48)
  assert.equal(draggedSlotOffset(uneven, 2, 0), -156)
})

test('settle spring reaches the slot with a small overshoot', () => {
  let value = 0
  let velocity = 0
  let overshot = false
  const target = 48
  for (let frame = 0; frame < 90; frame += 1) {
    const next = stepSpring(
      value,
      velocity,
      target,
      1 / 60,
      SPRING.settle.stiffness,
      SPRING.settle.damping,
    )
    value = next.value
    velocity = next.velocity
    if (value > target + 0.5) overshot = true
  }
  assert.equal(overshot, true)
  assert.equal(springSettled(value, velocity, target), true)
})

test('saved follow order keeps new ids and drops ones that are gone', () => {
  const items = [{ id: 'c' }, { id: 'a' }, { id: 'b' }]
  assert.deepEqual(
    applyOrder(items, ['b', 'a', 'missing']).map((item) => item.id),
    ['b', 'a', 'c'],
  )
  assert.deepEqual(applyOrder(items, []).map((item) => item.id), ['c', 'a', 'b'])
})
