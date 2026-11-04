import { graphScore, type GraphModel } from './lightgcn'
export interface FeedPost {
  id: string
  type: string
  title: string | null
  body: string
  publishedAt: string
  author: { id: string }
  team: { id: string } | null
  tags: Array<{ kind: string; label: string; targetId?: string | null }>
  imageUrls?: string[]
  imageUrl: string | null
  likeCount: number
  commentCount: number
}
export type Interest = Map<string, number>
const clamp = (v: number) => Math.max(0, Math.min(1, v))
export function contentFeatures(post: FeedPost): Interest {
  const values: Interest = new Map(),
    add = (key: string, value: number) => values.set(key, (values.get(key) ?? 0) + value)
  for (const tag of post.tags) {
    add('tag:' + tag.kind + ':' + (tag.targetId || tag.label), 3)
    if (tag.kind === 'TEAM' && tag.targetId) add('team:' + tag.targetId, 4)
  }
  if (post.team) add('team:' + post.team.id, 4)
  add('author:' + post.author.id, 1.5)
  const text = (post.title ?? '') + post.body,
    words = text.toLowerCase().match(/[a-z0-9]{2,}|[\u4e00-\u9fff]{2,}/g) ?? []
  const tokens = new Set<string>()
  for (const word of words)
    if (/^[\u4e00-\u9fff]/.test(word))
      for (let i = 0; i < word.length - 1 && tokens.size < 220; i++)
        tokens.add(word.slice(i, i + 2))
    else tokens.add(word)
  for (const token of tokens) add('text:' + token, 0.3)
  return values
}
export function addInterest(interest: Interest, post: FeedPost, weight: number) {
  for (const [key, value] of contentFeatures(post))
    interest.set(key, (interest.get(key) ?? 0) + weight * value)
}
function similarity(a: Interest, b: Interest) {
  let dot = 0,
    normA = 0,
    normB = 0
  for (const [key, value] of a) {
    dot += value * (b.get(key) ?? 0)
    normA += value * value
  }
  for (const value of b.values()) normB += value * value
  return normA && normB ? dot / Math.sqrt(normA * normB) : 0
}
export function completeness(post: FeedPost) {
  const text = post.body.replace(/\s/g, ''),
    unique = new Set([...text]).size
  return clamp(
    0.1 +
      Math.min(0.5, text.length / 220) * Math.min(1, unique / 30) +
      (post.imageUrls?.length || post.imageUrl ? 0.35 : 0),
  )
}
function redundant(a: FeedPost, b: FeedPost, cache: Map<string, Set<string>>) {
  if (a.author.id !== b.author.id) return false
  const imagesA = a.imageUrls?.join('|') || a.imageUrl || '',
    imagesB = b.imageUrls?.join('|') || b.imageUrl || ''
  if (imagesA !== imagesB) return false
  const shingles = (post: FeedPost) => {
    const found = cache.get(post.id)
    if (found) return found
    const text = (post.title ?? '') + post.body
    const clean = text.replace(/[\s\p{P}]/gu, '')
    const result = new Set(
      Array.from({ length: Math.max(1, clean.length - 2) }, (_, i) => clean.slice(i, i + 3)),
    )
    cache.set(post.id, result)
    return result
  }
  const aa = shingles(a),
    bb = shingles(b)
  let overlap = 0
  for (const c of aa) if (bb.has(c)) overlap++
  return overlap / Math.max(1, new Set([...aa, ...bb]).size) > 0.85
}
function jitter(id: string, seed: string) {
  let hash = 2166136261
  for (const c of seed + id) hash = Math.imul(hash ^ c.charCodeAt(0), 16777619)
  return (hash >>> 0) / 4294967296
}
export function rankFeed<T extends FeedPost>(
  posts: T[],
  input: {
    interest: Interest
    affiliation?: Interest
    seen: Set<string>
    seenAuthors?: Set<string>
    userId?: string | undefined
    model?: GraphModel | undefined
    seed: string
    now?: number
    sources?: Record<string, string>
    graphConfidence?: number
  },
): T[] {
  const qualities = new Map(posts.map((post) => [post.id, completeness(post)])),
    duplicateTokens = new Map<string, Set<string>>()
  const now = input.now ?? Date.now(),
    scores = posts.map((p) => graphScore(input.model, input.userId, p.id)),
    known = scores.filter((n): n is number => n !== undefined),
    mean = known.reduce((a, b) => a + b, 0) / Math.max(1, known.length),
    sd = Math.sqrt(known.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, known.length))
  const remaining = posts.map((post, i) => {
    const age = Math.max(0, (now - Date.parse(post.publishedAt)) / 3600000),
      official = post.type === 'OFFICIAL',
      fresh = Math.exp(-age / (official ? 24 : 72)),
      graph = scores[i]
    const relevance =
      1.8 * similarity(contentFeatures(post), input.interest) +
      (input.affiliation ? 0.25 * similarity(contentFeatures(post), input.affiliation) : 0) +
      (graph === undefined || sd < 1e-8
        ? 0
        : 0.8 * (input.graphConfidence ?? 1) * clamp(0.5 + ((graph - mean) / sd) * 0.25))
    const timeliness = official ? 0.2 + 0.8 * fresh : 1
    const score =
      relevance * timeliness +
      fresh * (official ? 1.3 : 0.55) +
      qualities.get(post.id)! * 0.4 +
      (input.sources?.[post.id] === 'USER'
        ? 0.22
        : input.sources?.[post.id] === 'SYSTEM' && !official
          ? -0.2
          : 0) +
      Math.log1p(Math.max(0, post.likeCount) + Math.max(0, post.commentCount) * 2) *
        0.08 *
        timeliness -
      (input.seen.has(post.id) ? 0.55 : 0) +
      (!input.seen.has(post.id) && input.seenAuthors && !input.seenAuthors.has(post.author.id)
        ? 0.1
        : 0) +
      jitter(post.id, input.seed) * 0.12
    return { post, score }
  })
  const ordered: T[] = []
  while (remaining.length) {
    let best = 0,
      high = -Infinity
    for (let i = 0; i < remaining.length; i++) {
      const item = remaining[i]!,
        recent = ordered.slice(-5),
        duplicate = recent.some((p) => redundant(p, item.post, duplicateTokens)),
        lowInfo = qualities.get(item.post.id)! < 0.3,
        lowAuthor = lowInfo
          ? recent.filter((p) => p.author.id === item.post.author.id && qualities.get(p.id)! < 0.3)
              .length
          : 0
      const score = item.score - (duplicate ? 1.1 : 0) - lowAuthor * 0.45
      if (score > high) {
        high = score
        best = i
      }
    }
    ordered.push(remaining.splice(best, 1)[0]!.post)
  }
  return ordered
}
