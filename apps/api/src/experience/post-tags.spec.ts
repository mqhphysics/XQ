import assert from 'node:assert/strict'
import test from 'node:test'
import { normalizePostTags, postTagFingerprint } from './post-tags'

test('post tags normalize visible topics, deduplicate without losing display order', () => {
  const tags = normalizePostTags([
    { kind: 'TOPIC', label: ' #ＦＯＯ ' },
    { kind: 'TOPIC', label: 'foo' },
    { kind: 'TOPIC', label: '训练日常' },
  ])
  assert.deepEqual(
    tags.map((tag) => [tag.label, tag.key, tag.position]),
    [
      ['FOO', 'TOPIC:foo', 0],
      ['训练日常', 'TOPIC:训练日常', 1],
    ],
  )
})

test('entity tags use stable IDs and preserve different same-name targets', () => {
  const first = '11111111-1111-4111-8111-111111111111'
  const second = '22222222-2222-4222-8222-222222222222'
  const tags = normalizePostTags([
    { kind: 'TEAM', targetId: first, label: '同名队伍' },
    { kind: 'TEAM', targetId: second, label: '同名队伍' },
    { kind: 'PLAYER', targetId: first, label: '同名队伍' },
  ])
  assert.equal(tags.length, 3)
  assert.equal(tags[0]?.teamId, first)
  assert.equal(tags[2]?.playerId, first)
  assert.ok(
    tags.every((tag) => tag.label === ''),
    'entity display names must be resolved by the server',
  )
})

test('post tags reject empty, invisible, overlong, invalid-target and over-limit input', () => {
  for (const label of ['', '  # ', 'a\nsecret', 'a\u200b', 'a'.repeat(31)])
    assert.throws(() => normalizePostTags([{ kind: 'TOPIC', label }]))
  assert.throws(() => normalizePostTags([{ kind: 'TEAM', label: '无法用文字冒充队伍' }]))
  assert.throws(() =>
    normalizePostTags([
      { kind: 'TOPIC', label: '标签', targetId: '11111111-1111-4111-8111-111111111111' },
    ]),
  )
  assert.throws(() =>
    normalizePostTags(
      Array.from({ length: 11 }, (_, index) => ({ kind: 'TOPIC' as const, label: `${index}` })),
    ),
  )
})

test('idempotent post fingerprints change when tag target, label or order changes', () => {
  const tags = normalizePostTags([
    { kind: 'TOPIC', label: '训练' },
    { kind: 'TOPIC', label: '比赛' },
  ])
  assert.notEqual(postTagFingerprint(tags), postTagFingerprint([...tags].reverse()))
  assert.notEqual(
    postTagFingerprint(tags),
    postTagFingerprint(normalizePostTags([{ kind: 'TOPIC', label: '日常' }])),
  )
})

test('renaming an entity does not change an idempotent tag target', () => {
  assert.equal(
    postTagFingerprint([{ key: 'TEAM:11111111-1111-4111-8111-111111111111', label: '旧队名' }]),
    postTagFingerprint([{ key: 'TEAM:11111111-1111-4111-8111-111111111111', label: '新队名' }]),
  )
})
