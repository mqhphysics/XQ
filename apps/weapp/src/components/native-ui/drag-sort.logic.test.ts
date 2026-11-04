import assert from 'node:assert/strict'
import test from 'node:test'
import {
  clampDragOffset,
  dragShift,
  dragFrame,
  dragTargetIndex,
  estimateRowRects,
  moveIndex,
  pickRowRects,
  rowSelectorCandidates,
  settleOffset,
} from './drag-sort.logic.ts'

const rects = [0, 1, 2, 3].map((i) => ({ top: i * 60, bottom: i * 60 + 50, height: 50 }))

test('finds the slot by crossing neighbour midpoints', () => {
  assert.equal(dragTargetIndex(rects, 0, 25), 0)
  assert.equal(dragTargetIndex(rects, 0, 86), 1)
  assert.equal(dragTargetIndex(rects, 0, 200), 2)
  assert.equal(dragTargetIndex(rects, 0, 205), 3)
  assert.equal(dragTargetIndex(rects, 3, 25), 0)
  assert.equal(dragTargetIndex(rects, 3, 20), 0)
  assert.equal(dragTargetIndex(rects, 2, 140), 2)
})
test('shifts rows between from and over by one row step', () => {
  assert.equal(dragShift(rects, 1, 0, 2), -60)
  assert.equal(dragShift(rects, 3, 0, 2), 0)
  assert.equal(dragShift(rects, 1, 3, 1), 60)
  assert.equal(dragShift(rects, 0, 3, 1), 0)
})
test('clamps and settles inside the list', () => {
  assert.equal(clampDragOffset(rects, 1, -500), -60)
  assert.equal(clampDragOffset(rects, 1, 500), 120)
  assert.equal(settleOffset(rects, 0, 2), 120)
  assert.equal(settleOffset(rects, 3, 1), -120)
})
test('moves items without mutating input', () => {
  const items = ['a', 'b', 'c']
  assert.deepEqual(moveIndex(items, 0, 2), ['b', 'c', 'a'])
  assert.deepEqual(items, ['a', 'b', 'c'])
  assert.deepEqual(moveIndex(items, 5, 0), items)
})

/* Regression (0.7.9/0.7.10): the hub's 关注管理 rows live in a dialog that Taro renders inside its
 * `comp` custom component, so the page-scoped selectAll returned [] in the simulator. The hook
 * then kept rects = [], every frame resolved to over === from and release never reordered. */
test('a page-scoped query that misses dialog rows still yields a reorder via the >>> candidate', () => {
  const items = ['郭斌', '谭邦', '程巍华']
  const measured = [0, 1, 2].map((i) => ({ top: 306 + i * 54, bottom: 360 + i * 54, height: 54 }))
  const candidates = rowSelectorCandidates('.native-hub-sort-list .native-hub-sort-row')
  assert.deepEqual(candidates, [
    '.native-hub-sort-list .native-hub-sort-row',
    '.native-dialog >>> .native-hub-sort-list .native-hub-sort-row',
    '.native-main-root >>> .native-hub-sort-list .native-hub-sort-row',
  ])
  /* Old behaviour: only the page-scoped result, which is empty -> no slot change. */
  assert.equal(pickRowRects([[]], items.length), null)
  assert.equal(dragFrame([], 0, 130).over, 0)
  /* New behaviour: the >>> result is picked and a 130px drag lands row 0 in slot 2. */
  const rects = pickRowRects([[], measured, measured], items.length)
  assert.deepEqual(rects, measured)
  const frame = dragFrame(rects!, 0, 130)
  assert.equal(frame.over, 2)
  assert.deepEqual(moveIndex(items, 0, frame.over), ['谭邦', '程巍华', '郭斌'])
})

test('ignores partial or null results when picking measured rows', () => {
  const two = rects.slice(0, 2)
  assert.equal(pickRowRects([two, null, undefined], 4), null)
  assert.deepEqual(pickRowRects([two, rects], 4), rects)
  assert.equal(pickRowRects(null, 4), null)
})

test('estimated slots still let a drop land when nothing can be measured', () => {
  const estimated = estimateRowRects(3, 1, 400, 56)
  assert.equal(estimated[1]!.top + estimated[1]!.height / 2, 400)
  assert.equal(dragFrame(estimated, 1, 60).over, 2)
  assert.equal(dragFrame(estimated, 1, -60).over, 0)
  assert.equal(dragFrame(estimated, 1, 10).over, 1)
})

test('unequal heights and subpixel bounds let a middle row exchange with both end rows', () => {
  const rows = [
    { top: 0.1, bottom: 40.1, height: 40 },
    { top: 40.1, bottom: 120.1, height: 80 },
    { top: 120.1, bottom: 160.1, height: 40 },
  ]
  assert.equal(dragFrame(rows, 1, -40).over, 0)
  assert.equal(dragFrame(rows, 1, 40).over, 2)
  assert.deepEqual(moveIndex(['a', 'b', 'c'], 1, dragFrame(rows, 1, -200).over), ['b', 'a', 'c'])
})
