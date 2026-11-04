/** Public search only: broad candidate recall followed by weighted lexical/typo ranking. */
export interface SearchField {
  text: string | null | undefined
  weight: number
}
const normalize = (value: string) =>
  value
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\p{P}\p{Z}\p{C}]/gu, '')
export function publicSearchPlan(query: string) {
  const words =
    query
      .normalize('NFKC')
      .toLowerCase()
      .match(/[\p{Script=Han}]+|[\p{L}\p{N}]+/gu) || []
  const full = normalize(query),
    recall = new Set<string>(words)
  if (full) recall.add(full)
  for (const word of words) {
    recall.add(word)
    const chars = Array.from(word)
    for (let i = 0; i < chars.length - 1; i++) recall.add(chars[i]! + chars[i + 1]!)
    if (chars.length <= 4) for (const char of chars) recall.add(char)
  }
  const primary = [...new Set([full, ...words])].filter(Boolean),
    extra = [...recall].filter((term) => term && !primary.includes(term)),
    room = Math.max(0, 48 - primary.length)
  const sampled =
    extra.length <= room
      ? extra
      : Array.from(
          { length: room },
          (_, i) => extra[Math.round((i * (extra.length - 1)) / Math.max(1, room - 1))]!,
        )
  return { full, words: [...new Set(words)], recall: [...primary, ...sampled] }
}
/** Damerau-Levenshtein against the best contiguous span, without requiring the rest of a field. */
function substringDistance(query: string, text: string) {
  const a = Array.from(query),
    b = Array.from(text)
  let previous = Array.from({ length: a.length + 1 }, (_, i) => i),
    earlier = previous,
    best = a.length
  for (let i = 1; i <= b.length; i++) {
    const current = [0]
    for (let j = 1; j <= a.length; j++) {
      let value = Math.min(
        previous[j]! + 1,
        current[j - 1]! + 1,
        previous[j - 1]! + (a[j - 1] === b[i - 1] ? 0 : 1),
      )
      if (i > 1 && j > 1 && a[j - 1] === b[i - 2] && a[j - 2] === b[i - 1])
        value = Math.min(value, earlier[j - 2]! + 1)
      current.push(value)
    }
    best = Math.min(best, current[a.length]!)
    if (best === 0) return 0
    earlier = previous
    previous = current
  }
  return best
}
function scorePlan(plan: ReturnType<typeof publicSearchPlan>, fields: SearchField[]) {
  if (!plan.full || !plan.words.length) return 0
  const grams = plan.recall.filter((term) => Array.from(term).length === 2),
    matched = new Set<string>()
  let score = 0
  for (const field of fields) {
    if (!field.text) continue
    const text = normalize(field.text)
    if (!text) continue
    let value = text === plan.full ? 1200 : text.includes(plan.full) ? 600 : 0
    for (const word of plan.words) {
      if (text.includes(word)) {
        value += 180
        matched.add(word)
      } else {
        const length = Array.from(word).length
        if (length >= 2 && length <= 16) {
          const distance = substringDistance(word, text),
            allowed = length <= 5 ? 1 : Math.min(2, Math.floor(length * 0.25))
          if (distance <= allowed) value += 65 * (1 - distance / length)
        }
      }
    }
    value += grams.filter((gram) => text.includes(gram)).length * 14
    score += value * field.weight
  }
  return score + (matched.size / plan.words.length) * 80
}
export function publicSearchScore(query: string, fields: SearchField[]) {
  return scorePlan(publicSearchPlan(query), fields)
}
export function rankPublicSearch<T>(
  items: T[],
  query: string,
  fields: (item: T) => SearchField[],
  limit: number,
) {
  const plan = publicSearchPlan(query)
  return items
    .map((item, index) => ({ item, index, score: scorePlan(plan, fields(item)) }))
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, limit)
    .map((row) => row.item)
}
