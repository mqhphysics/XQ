import { createHash, randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { Worker } from 'node:worker_threads'
import {
  Inject,
  Injectable,
  HttpException,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common'
import { PrismaService } from '../database/prisma.service'
import { AuthService } from '../auth/auth.service'
import { ExperienceService } from '../experience/experience.service'
import { addInterest, rankFeed, type Interest } from './ranking'
import type { GraphEdge, GraphModel } from './lightgcn'
import type { FeedEventsDto, FeedQueryDto } from './feed.dto'

type State = {
  at: number
  edges: GraphEdge[]
  model?: GraphModel
  refresh?: Promise<void>
  training?: Promise<void>
  signature?: string
  version?: string
  trainedAt?: string
  durationMs?: number
}
type Batch = {
  owner: string
  tournamentId: string
  ids: string[]
  until: number
  algorithm: string
  modelState: 'READY' | 'TRAINING' | 'COLD'
  modelVersion: string | null
}
@Injectable()
export class FeedService implements OnModuleDestroy, OnModuleInit {
  private readonly logger = new Logger(FeedService.name)
  private readonly states = new Map<string, State>()
  private readonly batches = new Map<string, Batch>()
  private readonly workers = new Set<Worker>()
  private trainingTail = Promise.resolve()
  private closed = false
  private retentionTimer?: ReturnType<typeof setInterval>
  constructor(
    @Inject(PrismaService) private readonly db: PrismaService,
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(ExperienceService) private readonly experience: ExperienceService,
  ) {}
  onModuleInit() {
    this.retentionTimer = setInterval(() => void this.pruneEvents(), 6 * 3600000)
    this.retentionTimer.unref()
    void this.pruneEvents()
  }
  private async pruneEvents() {
    try {
      await this.db.postFeedEvent.deleteMany({
        where: { createdAt: { lt: new Date(Date.now() - 90 * 86400000) } },
      })
    } catch (error) {
      this.logger.warn('Feed event retention cleanup failed')
    }
  }
  async onModuleDestroy() {
    this.closed = true
    if (this.retentionTimer) clearInterval(this.retentionTimer)
    await Promise.all([...this.workers].map((worker) => worker.terminate()))
  }
  private async signals(
    key: string,
    organizationId: string,
    ids: string[],
    authors: Record<string, string | null>,
  ): Promise<State> {
    let state = this.states.get(key)
    const signature = createHash('sha256')
      .update([...ids].sort().join('|'))
      .digest('hex')
    if (state && state.signature !== signature) {
      delete state.model
      state.at = 0
      state.signature = signature
    }
    if (state?.refresh) {
      await state.refresh
      return state
    }
    if (state?.training) return state
    if (state && Date.now() - state.at < 120000) return state
    if (!state) {
      state = { at: 0, edges: [], signature }
      this.states.set(key, state)
    }
    const current = state
    const load = async () => {
      const since = new Date(Date.now() - 90 * 86400000),
        where = {
          organizationId,
          postId: { in: ids },
          createdAt: { gte: since },
          user: { status: 'ACTIVE' as const },
        }
      const [likes, favorites, comments, reads] = await Promise.all([
        this.db.postLike.findMany({
          where,
          select: { userId: true, postId: true },
          take: 12000,
          orderBy: { createdAt: 'desc' },
        }),
        this.db.postFavorite.findMany({
          where,
          select: { userId: true, postId: true },
          take: 12000,
          orderBy: { createdAt: 'desc' },
        }),
        this.db.postComment.findMany({
          where: { ...where, hiddenAt: null },
          select: { userId: true, postId: true },
          take: 12000,
          orderBy: { createdAt: 'desc' },
        }),
        this.db.postFeedEvent.findMany({
          where: { ...where, kind: 'READ', durationMs: { gte: 3000 } },
          select: { userId: true, postId: true },
          take: 12000,
          orderBy: { createdAt: 'desc' },
        }),
      ])
      const unique = (rows: Array<{ userId: string; postId: string }>, weight: number) => [
        ...new Map(rows.map((row) => [row.userId + '|' + row.postId, { ...row, weight }])).values(),
      ]
      current.edges = [
        ...unique(likes, 3),
        ...unique(favorites, 5),
        ...unique(comments, 4),
        ...unique(reads, 1),
        ...Object.entries(authors)
          .filter((entry): entry is [string, string] => !!entry[1])
          .map(([postId, userId]) => ({ postId, userId, weight: 1.5 })),
      ]
      current.at = Date.now()
      if (process.env.FEED_RECOMMENDER !== 'content' && current.edges.length && ids.length > 1) {
        const edges = current.edges
        const train = () =>
          new Promise<void>((resolve) => {
            if (this.closed) return resolve()
            const started = performance.now()
            const worker = new Worker(join(__dirname, 'lightgcn.worker.js'), {
              workerData: { edges, itemIds: ids },
            })
            this.workers.add(worker)
            let settled = false
            const done = () => {
              if (settled) return
              settled = true
              this.workers.delete(worker)
              resolve()
            }
            worker.once('message', (model: GraphModel) => {
              if (current.signature === signature) {
                current.model = model
                current.version = createHash('sha256')
                  .update(JSON.stringify(edges))
                  .digest('hex')
                  .slice(0, 16)
                current.trainedAt = new Date().toISOString()
                current.durationMs = Math.round(performance.now() - started)
                this.logger.log(
                  JSON.stringify({
                    event: 'FEED_MODEL_TRAINED',
                    scope: key,
                    version: current.version,
                    samples: model.edges,
                    epochs: model.loss.length,
                    lossStart: model.loss[0],
                    lossEnd: model.loss.at(-1),
                    durationMs: current.durationMs,
                  }),
                )
              }
              done()
            })
            worker.once('error', (error) => {
              this.logger.warn(
                'LightGCN training failed: ' +
                  (error instanceof Error ? error.message : 'worker error'),
              )
              done()
            })
            worker.once('exit', done)
          })
        const training = this.trainingTail.then(train)
        current.training = training
        this.trainingTail = training
          .catch((error) => this.logger.warn('Feed training queue failed'))
          .then(() => {})
        void training
          .finally(() => {
            if (current.training === training) delete current.training
          })
          .catch(() => {})
      }
      while (this.states.size > 16) {
        const oldest = this.states.keys().next().value as string
        this.states.delete(oldest)
      }
    }
    current.refresh = load()
    try {
      await current.refresh
    } finally {
      delete current.refresh
    }
    return current
  }
  async get(organizationId: string, authorization: string | undefined, query: FeedQueryDto) {
    const session = await this.auth.getSession(authorization)
    if (session && session.organizationId !== organizationId)
      throw new HttpException('组织与账号不匹配', 403)
    const owner = organizationId + ':' + (session?.userId ?? 'guest'),
      batch = query.batchId ? this.batches.get(query.batchId) : undefined
    if (query.batchId && (!batch || batch.until < Date.now()))
      throw new HttpException('这批动态已过期，请换一批', 410)
    if (batch && batch.owner !== owner) throw new HttpException('无权读取这批动态', 403)
    const pool = await this.experience.recommendationPool(
      organizationId,
      session?.userId,
      query.tournamentId ?? batch?.tournamentId,
      query.competitionId || query.seasonId
        ? { competitionDefinitionId: query.competitionId, seasonId: query.seasonId }
        : undefined,
      batch?.ids,
    )
    if (batch && batch.tournamentId !== pool.tournamentId)
      throw new HttpException('动态所属赛事已变化', 409)
    let selected = batch,
      batchId = query.batchId
    if (!selected) {
      const viewerWhere = {
        organizationId,
        userId: session?.userId ?? '00000000-0000-4000-8000-000000000000',
        postId: { in: pool.posts.map((p) => p.id) },
      }
      const [
        state,
        seenRows,
        preferences,
        follows,
        personalLikes,
        personalFavorites,
        personalComments,
        memberships,
      ] = await Promise.all([
        this.signals(
          organizationId + ':' + pool.tournamentId,
          organizationId,
          pool.posts.map((p) => p.id),
          Object.fromEntries(
            Object.entries(pool.authors).filter(([id]) => pool.sources[id] === 'USER'),
          ),
        ),
        session
          ? this.db.postFeedEvent.findMany({
              where: {
                organizationId,
                userId: session.userId,
                createdAt: { gte: new Date(Date.now() - 48 * 3600000) },
              },
              select: { postId: true, kind: true, durationMs: true },
              take: 2000,
              orderBy: { createdAt: 'desc' },
            })
          : [],
        session
          ? this.db.userTeamPreference.findMany({
              where: { organizationId, userId: session.userId },
              select: { teamId: true, isPrimary: true },
            })
          : [],
        session
          ? this.db.userPlayerFollow.findMany({
              where: { organizationId, userId: session.userId },
              select: { playerProfileId: true },
            })
          : [],
        session ? this.db.postLike.findMany({ where: viewerWhere, select: { postId: true } }) : [],
        session
          ? this.db.postFavorite.findMany({ where: viewerWhere, select: { postId: true } })
          : [],
        session
          ? this.db.postComment.findMany({
              where: { ...viewerWhere, hiddenAt: null },
              select: { postId: true },
              distinct: ['postId'],
            })
          : [],
        session
          ? this.db.teamMembership.findMany({
              where: {
                organizationId,
                status: 'ACTIVE',
                OR: [
                  { userId: session.userId },
                  ...(session.user.linkedPlayer
                    ? [{ playerProfileId: session.user.linkedPlayer.id }]
                    : []),
                ],
              },
              select: { teamId: true },
              take: 30,
            })
          : [],
      ])
      if (
        session &&
        !state.training &&
        !state.model?.users[session.userId] &&
        (personalLikes.length ||
          personalFavorites.length ||
          personalComments.length ||
          seenRows.some((event) => event.kind === 'READ' && event.durationMs >= 3000) ||
          Object.entries(pool.authors).some(
            ([id, author]) => author === session.userId && pool.sources[id] === 'USER',
          ))
      ) {
        state.at = 0
        await this.signals(
          organizationId + ':' + pool.tournamentId,
          organizationId,
          pool.posts.map((p) => p.id),
          Object.fromEntries(
            Object.entries(pool.authors).filter(([id]) => pool.sources[id] === 'USER'),
          ),
        )
      }
      const interest: Interest = new Map()
      const affiliation: Interest = new Map()
      for (const preference of preferences)
        interest.set('team:' + preference.teamId, preference.isPrimary ? 12 : 6)
      for (const follow of follows) interest.set('tag:PLAYER:' + follow.playerProfileId, 6)
      for (const member of memberships) affiliation.set('team:' + member.teamId, 3)
      for (const role of session?.user.roles ?? [])
        if (role.scopeType === 'TEAM' && role.scopeId) affiliation.set('team:' + role.scopeId, 4)
      const postMap = new Map(pool.posts.map((p) => [p.id, p]))
      const histories = [
        ...personalLikes.map((e) => ({ ...e, weight: 3 })),
        ...personalFavorites.map((e) => ({ ...e, weight: 5 })),
        ...personalComments.map((e) => ({ ...e, weight: 4 })),
        ...seenRows
          .filter((e) => e.kind === 'READ' && e.durationMs >= 3000)
          .map((e) => ({ ...e, weight: 1 })),
      ]
      for (const post of pool.posts)
        if (pool.authors[post.id] === session?.userId && pool.sources[post.id] === 'USER')
          addInterest(interest, post, 1.5)
      const interestSeen = new Set<string>()
      for (const edge of histories) {
        const key = edge.postId + ':' + edge.weight
        if (interestSeen.has(key)) continue
        interestSeen.add(key)
        const post = postMap.get(edge.postId)
        if (post) addInterest(interest, post, edge.weight)
      }
      batchId = randomUUID()
      const model = process.env.FEED_RECOMMENDER === 'content' ? undefined : state.model
      const items = rankFeed(pool.posts, {
        interest,
        affiliation,
        seen: new Set(seenRows.map((e) => e.postId)),
        seenAuthors: new Set(
          seenRows.flatMap((e) => (pool.authors[e.postId] ? [pool.authors[e.postId]!] : [])),
        ),
        userId: session?.userId,
        model,
        seed: query.refresh ?? batchId,
        sources: pool.sources,
        graphConfidence:
          Math.min(
            1,
            new Set(state.edges.filter((e) => e.userId === session?.userId).map((e) => e.postId))
              .size / 3,
          ) * Math.min(1, Object.keys(model?.users ?? {}).length / 3),
      })
      selected = {
        owner,
        tournamentId: pool.tournamentId,
        ids: items.map((p) => p.id),
        until: Date.now() + 15 * 60000,
        algorithm:
          process.env.FEED_RECOMMENDER === 'content' ? 'interest-v1' : 'interest+lightgcn-bpr-v1',
        modelState:
          model?.users[session?.userId ?? ''] && model.loss.length
            ? 'READY'
            : state.training
              ? 'TRAINING'
              : 'COLD',
        modelVersion: model?.loss.length ? (state.version ?? null) : null,
      }
      this.batches.set(batchId, selected)
      for (const [id, item] of this.batches) if (item.until < Date.now()) this.batches.delete(id)
      while (this.batches.size > 500)
        this.batches.delete(this.batches.keys().next().value as string)
    }
    const cursor = query.cursor ?? 0,
      page = selected.ids.slice(cursor, cursor + 12),
      map = new Map(pool.posts.map((p) => [p.id, p]))
    return {
      items: page.flatMap((id) => (map.has(id) ? [map.get(id)!] : [])),
      batchId: batchId!,
      tournamentId: pool.tournamentId,
      nextCursor: cursor + 12 < selected.ids.length ? cursor + 12 : null,
      algorithm: selected.algorithm,
      modelState: selected.modelState,
      modelVersion: selected.modelVersion,
    }
  }
  async record(authorization: string | undefined, body: FeedEventsDto) {
    const session = await this.auth.requireSession(authorization),
      owner = session.organizationId + ':' + session.userId
    for (const event of body.events) {
      const batch = event.batchId ? this.batches.get(event.batchId) : undefined
      if (batch && batch.owner !== owner) throw new HttpException('无权写入这批动态的浏览记录', 403)
    }
    const submitted = body.events.filter(
      (event) =>
        !event.batchId ||
        (this.batches.get(event.batchId)?.owner === owner &&
          this.batches.get(event.batchId)!.until >= Date.now() &&
          this.batches.get(event.batchId)!.ids.includes(event.postId)),
    )
    const visible = await this.db.post.findMany({
        where: {
          id: { in: submitted.map((e) => e.postId) },
          organizationId: session.organizationId,
          status: 'PUBLISHED',
        },
        select: { id: true },
      }),
      ids = new Set(visible.map((p) => p.id))
    const result = await this.db.postFeedEvent.createMany({
      skipDuplicates: true,
      data: submitted
        .filter((event) => ids.has(event.postId))
        .map((event) => ({
          organizationId: session.organizationId,
          userId: session.userId,
          postId: event.postId,
          clientEventId: event.eventId,
          batchId: event.batchId ?? null,
          kind: event.kind,
          durationMs: event.durationMs,
        })),
    })
    if (
      result.count &&
      submitted.some((event) => event.kind === 'READ' && event.durationMs >= 3000)
    ) {
      for (const [key, state] of this.states)
        if (key.startsWith(session.organizationId + ':') && !state.model?.users[session.userId])
          state.at = 0
    }
    return { accepted: result.count }
  }
}
