import assert from 'node:assert/strict'
import { test } from 'node:test'
import { trainLightGCN, graphScore } from './lightgcn'
import { rankFeed, addInterest, type FeedPost } from './ranking'
test('LightGCN actually learns BPR and favours the unseen item liked by a matching neighbour', () => {
  const model = trainLightGCN(
    [
      { userId: 'a', postId: 'one', weight: 3 },
      { userId: 'a', postId: 'two', weight: 3 },
      { userId: 'b', postId: 'one', weight: 3 },
      { userId: 'b', postId: 'two', weight: 3 },
      { userId: 'b', postId: 'three', weight: 3 },
      { userId: 'c', postId: 'four', weight: 3 },
      { userId: 'c', postId: 'five', weight: 3 },
    ],
    { epochs: 140 },
  )
  assert.equal(model.loss.length, 140)
  assert.ok(model.loss.at(-1)! < model.loss[0]! * 0.7)
  assert.ok(graphScore(model, 'a', 'three')! > graphScore(model, 'a', 'four')!)
  assert.equal(graphScore(model, 'new-user', 'one'), undefined)
  assert.ok(Object.values(model.posts).flat().every(Number.isFinite))
})
const now = Date.parse('2026-10-26T08:00:00Z')
const post = (id: string, patch: Partial<FeedPost> = {}): FeedPost => ({
  id,
  type: 'COMMUNITY',
  title: null,
  body: '',
  publishedAt: new Date(now - 3600000).toISOString(),
  author: { id: 'person-' + id },
  team: null,
  tags: [],
  imageUrl: null,
  likeCount: 0,
  commentCount: 0,
  ...patch,
})
const rank = (posts: FeedPost[]) =>
  rankFeed(posts, { interest: new Map(), seen: new Set(), seed: 'fixed', now })
test('ordinary fresh official bulletins get time priority without any importance flag', () => {
  const fresh = post('fresh', { type: 'OFFICIAL', body: '比赛刚刚结束，双方各得一分。' }),
    old = post('old', {
      ...fresh,
      id: 'old',
      publishedAt: new Date(now - 14 * 86400000).toISOString(),
    })
  assert.equal(rank([old, fresh])[0]!.id, 'fresh')
})
test('distinct rich photos by one author are not capped just because that author posts often', () => {
  const photos = [0, 1, 2, 3].map((i) =>
    post('photo' + i, {
      author: { id: 'same' },
      imageUrl: '/different-photo-' + i,
      body: '这是一条有照片的校园足球故事，记录队友的配合与训练。',
    }),
  )
  const spam = post('empty', { body: '哈哈', author: { id: 'other' } })
  assert.deepEqual(
    new Set(
      rank([...photos, spam])
        .slice(0, 4)
        .map((p) => p.id),
    ),
    new Set(photos.map((p) => p.id)),
  )
})
test('repeated empty posts from one author are interleaved with another author', () => {
  const spam = [0, 1, 2].map((i) =>
      post('s' + i, { author: { id: 'same' }, body: '哈哈哈哈', likeCount: 50 }),
    ),
    other = post('other', { body: '今天训练了传接球与跑位，有几点收获想和大家交流。' })
  assert.ok(
    rank([...spam, other])
      .slice(0, 2)
      .some((p) => p.id === 'other'),
  )
})
test('a matching interest ranks above unrelated content and a new batch favours unread posts', () => {
  const a = post('a', { tags: [{ kind: 'TOPIC', label: '门将训练' }], body: '门将训练扑救' }),
    b = post('b', { tags: [{ kind: 'TOPIC', label: '跑步' }], body: '日常跑步' })
  const interest = new Map()
  addInterest(interest, a, 3)
  assert.equal(rankFeed([b, a], { interest, seen: new Set(), seed: 'x', now })[0]!.id, 'a')
  assert.equal(
    rankFeed([a, b], { interest: new Map(), seen: new Set(['a']), seed: 'x', now })[0]!.id,
    'b',
  )
})

test('explicit manual content is preferred to equally complete ordinary automated content', () => {
  const a = post('human', { body: '校园足球训练日记' }),
    b = post('system', { body: '校园足球训练日记' })
  assert.equal(
    rankFeed([b, a], {
      interest: new Map(),
      seen: new Set(),
      seed: 'x',
      now,
      sources: { human: 'USER', system: 'SYSTEM' },
    })[0]!.id,
    'human',
  )
})

test('a graph with no trainable negative examples never supplies random initial embeddings as recommendations', () => {
  const model = trainLightGCN([
    { userId: 'only', postId: 'one', weight: 1 },
    { userId: 'only', postId: 'two', weight: 1 },
  ])
  assert.equal(model.loss.length, 0)
  assert.equal(graphScore(model, 'only', 'one'), undefined)
})

test('training can start with one reader and known unread catalog posts', () => {
  const model = trainLightGCN([{ userId: 'new', postId: 'one', weight: 1 }], {
    itemIds: ['one', 'two', 'three'],
  })
  assert.ok(model.loss.length > 0)
  assert.ok(graphScore(model, 'new', 'one')! > graphScore(model, 'new', 'two')!)
})

test('team membership is a weaker signal than deliberate interest and never hides timely campus news', () => {
  const teamPost = post('team', { team: { id: 'own-team' }, body: '球队训练与传接球练习。' })
  const notice = post('notice', { type: 'OFFICIAL', body: '今日赛程已经公布，欢迎大家前来观赛。' })
  const affiliation = new Map([['team:own-team', 3]])
  assert.equal(rankFeed([teamPost, notice], { interest: new Map(), affiliation, seen: new Set(), seed: 'x', now })[0]!.id, 'notice')
  const interest = new Map()
  addInterest(interest, teamPost, 3)
  assert.equal(rankFeed([teamPost, notice], { interest, affiliation, seen: new Set(), seed: 'x', now })[0]!.id, 'team')
})
