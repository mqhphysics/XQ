export interface GraphEdge {
  userId: string
  postId: string
  weight: number
}
export interface GraphModel {
  users: Record<string, number[]>
  posts: Record<string, number[]>
  loss: number[]
  edges: number
}

/** LightGCN with three normalised propagation layers, averaged embeddings and BPR gradients. */
export function trainLightGCN(
  input: GraphEdge[],
  options: { dimensions?: number; epochs?: number; seed?: number; itemIds?: string[] } = {},
): GraphModel {
  const dimensions = options.dimensions ?? 24,
    layers = 3,
    epochs = options.epochs ?? 70
  let seed = options.seed ?? 20261026
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
    return seed / 4294967296
  }
  const add = (matrix: Float64Array, index: number, value: number) => {
    matrix[index] = matrix[index]! + value
  }
  const combined = new Map<string, GraphEdge>()
  for (const edge of input)
    if (edge.weight > 0) {
      const key = edge.userId + '|' + edge.postId
      combined.set(key, {
        ...edge,
        weight: Math.min(12, (combined.get(key)?.weight ?? 0) + edge.weight),
      })
    }
  const edges = [...combined.values()]
  const userIds = [...new Set(edges.map((e) => e.userId))].sort(),
    postIds = [...new Set([...edges.map((e) => e.postId), ...(options.itemIds ?? [])])].sort()
  const users = new Map(userIds.map((id, i) => [id, i])),
    posts = new Map(postIds.map((id, i) => [id, i + userIds.length]))
  const degrees = new Float64Array(userIds.length + postIds.length),
    positive = new Map<number, Set<number>>()
  const links = edges.map((edge) => {
    const u = users.get(edge.userId)!,
      p = posts.get(edge.postId)!
    add(degrees, u, edge.weight)
    add(degrees, p, edge.weight)
    if (!positive.has(u)) positive.set(u, new Set())
    positive.get(u)!.add(p)
    return { u, p, weight: edge.weight, norm: 0 }
  })
  for (const link of links) link.norm = link.weight / Math.sqrt(degrees[link.u]! * degrees[link.p]!)
  const propagate = (matrix: Float64Array) => {
    const out = new Float64Array(matrix.length)
    for (const e of links)
      for (let d = 0; d < dimensions; d++) {
        add(out, e.u * dimensions + d, e.norm * matrix[e.p * dimensions + d]!)
        add(out, e.p * dimensions + d, e.norm * matrix[e.u * dimensions + d]!)
      }
    return out
  }
  const averageLayers = (base: Float64Array) => {
    let step = base
    const out = new Float64Array(base.length)
    for (let layer = 0; layer <= layers; layer++) {
      for (let i = 0; i < out.length; i++) add(out, i, step[i]! / (layers + 1))
      if (layer < layers) step = propagate(step)
    }
    return out
  }
  const dot = (matrix: Float64Array, a: number, b: number) => {
    let result = 0
    for (let d = 0; d < dimensions; d++)
      result += matrix[a * dimensions + d]! * matrix[b * dimensions + d]!
    return result
  }
  let embedding: Float64Array = Float64Array.from(
    { length: degrees.length * dimensions },
    () => (random() - 0.5) * 0.4,
  )
  const loss: number[] = []
  if (postIds.length > 1)
    for (let epoch = 0; epoch < epochs; epoch++) {
      const output = averageLayers(embedding),
        gradient = new Float64Array(embedding.length)
      let objective = 0,
        totalWeight = 0
      for (const e of links) {
        if (positive.get(e.u)!.size >= postIds.length) continue
        let negative = userIds.length + Math.floor(random() * postIds.length),
          attempt = 0
        while (positive.get(e.u)!.has(negative) && attempt++ < postIds.length * 2)
          negative = userIds.length + Math.floor(random() * postIds.length)
        if (positive.get(e.u)!.has(negative)) continue
        const delta = dot(output, e.u, e.p) - dot(output, e.u, negative),
          weight = Math.sqrt(e.weight)
        const g = -weight / (1 + Math.exp(Math.min(50, delta)))
        objective += weight * Math.log1p(Math.exp(Math.max(-50, -delta)))
        totalWeight += weight
        for (let d = 0; d < dimensions; d++) {
          const u = e.u * dimensions + d,
            p = e.p * dimensions + d,
            n = negative * dimensions + d
          add(gradient, u, g * (output[p]! - output[n]!))
          add(gradient, p, g * output[u]!)
          add(gradient, n, -g * output[u]!)
        }
      }
      if (!totalWeight) break
      loss.push(objective / totalWeight)
      // Symmetric A: backpropagation to E0 is mean_k A^k dEfinal, including k=0.
      const baseGradient = averageLayers(gradient),
        rate = 2.5 / Math.sqrt(1 + epoch / 40)
      embedding = Float64Array.from(
        embedding,
        (value, i) => value - rate * (baseGradient[i]! / totalWeight + 0.0001 * value),
      )
    }
  const output = averageLayers(embedding)
  return {
    users: Object.fromEntries(
      userIds.map((id, i) => [id, Array.from(output.slice(i * dimensions, (i + 1) * dimensions))]),
    ),
    posts: Object.fromEntries(
      postIds.map((id, i) => [
        id,
        Array.from(
          output.slice((i + userIds.length) * dimensions, (i + userIds.length + 1) * dimensions),
        ),
      ]),
    ),
    loss,
    edges: edges.length,
  }
}
export function graphScore(
  model: GraphModel | undefined,
  userId: string | undefined,
  postId: string,
): number | undefined {
  if (!model?.loss.length) return undefined
  const user = userId && model?.users[userId],
    post = model?.posts[postId]
  if (!user || !post) return undefined
  return user.reduce((sum, value, i) => sum + value * post[i]!, 0)
}
