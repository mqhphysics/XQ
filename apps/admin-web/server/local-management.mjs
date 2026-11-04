import { createRequire } from 'node:module'
import process from 'node:process'
import { createHash } from 'node:crypto'
import { URL, fileURLToPath, pathToFileURL } from 'node:url'
import { resolve } from 'node:path'

// The local management module shares the database and normal Bearer sessions.
// Existing public and V2 endpoints still use the already running API.
export function localManagementPlugin(options) {
  const repository = resolve(fileURLToPath(new URL('../../../', import.meta.url)))
  const apiRoot = resolve(repository, 'apps/api')
  const requireApi = createRequire(resolve(apiRoot, 'package.json'))
  let application
  let initializing
  let closePromise
  async function initialize() {
    if (application) return application
    if (initializing) return initializing
    initializing = (async () => {
      process.env.DATABASE_URL = options.databaseUrl
      process.env.ADMIN_PUBLIC_MEDIA_ORIGIN = 'http://127.0.0.1:5173'
      process.env.ADMIN_LEGACY_REPOSITORY = options.legacyRepository
      process.env.PUBLIC_API_BASE_URL = options.publicApiBaseUrl
      const { NestFactory } = requireApi('@nestjs/core')
      const [
        { AdminCenterModule },
        { configureApp },
        { LocalOwnerAccessService },
        { PrismaService },
      ] = await Promise.all([
        import(pathToFileURL(resolve(apiRoot, 'dist/admin-center/admin-center.module.js')).href),
        import(pathToFileURL(resolve(apiRoot, 'dist/app.setup.js')).href),
        import(
          pathToFileURL(resolve(apiRoot, 'dist/admin-center/local-owner-access.service.js')).href
        ),
        import(pathToFileURL(resolve(apiRoot, 'dist/database/prisma.service.js')).href),
      ])
      const app = await NestFactory.create(AdminCenterModule, {
        logger: false,
        abortOnError: false,
      })
      try {
        configureApp(app)
        await app.init()
        const prisma = app.get(PrismaService)
        await prisma.$queryRaw`SELECT 1`
        let ownerLoginName = options.ownerLoginName
        if (!ownerLoginName && options.ownerUserId) {
          const owner = await prisma.user.findUnique({
            where: { id: options.ownerUserId },
            select: { loginNameNormalized: true },
          })
          ownerLoginName = owner?.loginNameNormalized || ''
        }
        application = {
          app,
          handler: app.getHttpAdapter().getInstance(),
          access: app.get(LocalOwnerAccessService),
          ownerLoginName,
        }
        return application
      } catch (error) {
        await app.close()
        throw error
      }
    })().finally(() => {
      initializing = undefined
    })
    return initializing
  }
  function install(server) {
    server.httpServer?.once('close', () => {
      closePromise ??= (async () => {
        const ready = application ?? (await initializing?.catch(() => undefined))
        await ready?.app.close()
        application = undefined
      })()
    })
    server.middlewares.use(async (request, response, next) => {
      const pathname = new URL(request.url ?? '/', 'http://127.0.0.1').pathname
      const desktopRoute =
        pathname === '/__admin-center/status' || pathname === '/__admin-center/session'
      if (
        !desktopRoute &&
        !/^\/api\/admin\/center(?:\/|$)/i.test(pathname) &&
        !/^\/api\/media(?:\/|$)/i.test(pathname)
      )
        return next()
      response.setHeader('Cache-Control', 'private, no-store')
      try {
        const origin = `http://${request.headers.host}`
        if (!['127.0.0.1:5173', 'localhost:5173'].includes(request.headers.host ?? '')) {
          response.statusCode = 403
          response.end('Forbidden host')
          return
        }
        const ready = await initialize()
        if (!desktopRoute) return ready.handler(request, response, next)
        response.setHeader('Content-Type', 'application/json; charset=utf-8')
        if (pathname === '/__admin-center/status' && request.method === 'GET') {
          response.end(
            JSON.stringify({
              ready: true,
              singleOwner:
                options.enabled && options.development && process.env.NODE_ENV !== 'production',
              mode: 'local-management',
              workspaceFingerprint: createHash('sha256')
                .update(repository.toLowerCase())
                .digest('hex')
                .slice(0, 16),
            }),
          )
          return
        }
        if (pathname !== '/__admin-center/session' || request.method !== 'POST') {
          response.statusCode = 405
          response.end(JSON.stringify({ message: '请求方式不支持' }))
          return
        }
        const credential = await ready.access.enter(
          { ...options, ownerLoginName: ready.ownerLoginName, origin },
          {
            address: request.socket.remoteAddress,
            host: request.headers.host,
            origin: request.headers.origin,
            fetchSite: request.headers['sec-fetch-site'],
          },
        )
        response.end(JSON.stringify(credential))
      } catch (error) {
        const status = error?.getStatus?.() ?? 503
        const payload = error?.getResponse?.()
        response.statusCode = status
        response.setHeader('Content-Type', 'application/json; charset=utf-8')
        response.end(
          JSON.stringify({
            message:
              payload?.message ??
              '本机管理服务尚未就绪，请使用项目根目录的管理中心启动文件准备服务。',
          }),
        )
      }
    })
  }
  return { name: 'xiaoqiu-local-management', configureServer: install }
}
