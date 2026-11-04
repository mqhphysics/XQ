import type { INestApplication } from '@nestjs/common'
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger'
import type { NestExpressApplication } from '@nestjs/platform-express'
import type { NextFunction, Request, Response } from 'express'

import { ApiExceptionFilter } from './common/api-exception.filter'
import { compressResponse } from './common/http-performance'
import { requestIdMiddleware } from './common/request-id.middleware'
import { RequestLoggingInterceptor } from './common/request-logging.interceptor'
import { createValidationPipe } from './common/validation'

export function configureApp(app: INestApplication): void {
  app.setGlobalPrefix('api')
  const httpApp = app as NestExpressApplication
  httpApp.set('etag', 'strong')
  httpApp.useBodyParser('json', { limit: '26mb' })
  app.use(compressResponse)
  app.use((request: Request, response: Response, next: NextFunction) => {
    if (/^\/api\/public(?:\/|$)/i.test(request.path)) {
      response.vary('X-Organization-Id')
      response.vary('X-Dev-Organization-Id')
    }
    const publicRead = request.method === 'GET' && /^\/api\/public(?:\/|$)/i.test(request.path)
    if (publicRead && request.headers.authorization) {
      // Viewer-aware public reads (home, team dashboards…): never shared, but the client's own
      // copy may be revalidated with If-None-Match, so an unchanged body costs a bodyless 304.
      response.setHeader('Cache-Control', 'private, no-cache')
      response.vary('Authorization')
    } else if (
      request.headers.authorization ||
      /^\/api\/(?:auth|me|admin|captain|messages|reports)(?:\/|$)/i.test(request.path)
    ) {
      response.setHeader('Cache-Control', 'private, no-store')
      response.vary('Authorization')
      // Private API consumers expect fresh JSON rather than a cached 304 body.
      delete request.headers['if-none-match']
      delete request.headers['if-modified-since']
    } else if (publicRead) {
      // Anonymous public reads: a short shared freshness window plus stale-while-revalidate,
      // so browsers (and any CDN in front of the API) answer repeats instantly and refresh in
      // the background; the strong ETag keeps every revalidation a cheap 304.
      response.setHeader('Cache-Control', 'public, max-age=15, stale-while-revalidate=300')
    }
    next()
  })
  app.enableCors({
    origin: corsOriginMatcher(resolveCorsOrigins()),
    allowedHeaders: [
      'authorization',
      'content-type',
      'idempotency-key',
      'x-organization-id',
      'x-dev-organization-id',
      'x-dev-role',
      'x-dev-user-id',
      'x-request-id',
      'x-request-source',
      'if-none-match',
    ],
    exposedHeaders: ['ETag'],
    // Cache preflights (Chrome caps at 2 h) so each API call is not preceded by an OPTIONS RTT.
    maxAge: 7200,
  })
  app.use(requestIdMiddleware)
  app.useGlobalPipes(createValidationPipe())
  app.useGlobalFilters(new ApiExceptionFilter())
  app.useGlobalInterceptors(new RequestLoggingInterceptor())

  // Public API docs are a development aid; production keeps them off unless explicitly enabled.
  if (process.env.NODE_ENV === 'production' && process.env.API_DOCS_ENABLED !== 'true') return

  const swaggerConfig = new DocumentBuilder()
    .setTitle('晓球 API')
    .setDescription('晓球平台 REST API')
    .setVersion(process.env.APP_VERSION ?? '0.1.0')
    .addBearerAuth()
    .build()
  const document = SwaggerModule.createDocument(app, swaggerConfig)

  SwaggerModule.setup('api/docs', app, document, {
    jsonDocumentUrl: 'api/openapi.json',
  })
}

/**
 * Exact origins plus subdomain wildcards such as `https://*.xiaoqiu-beta.pages.dev`
 * (Cloudflare Pages preview deployments). A wildcard matches one or more subdomain
 * labels only — never the bare domain, other schemes, ports or lookalike suffixes.
 */
export function corsOriginMatcher(entries: string[]): (string | RegExp)[] {
  return entries.map((entry) => {
    const wildcard = /^(https?):\/\/\*\.([a-z0-9.-]+)$/i.exec(entry)
    if (!wildcard) return entry
    const [, scheme, domain] = wildcard
    const escaped = domain!.replace(/[.]/g, '\\.')
    return new RegExp(`^${scheme}:\\/\\/(?:[a-z0-9-]+\\.)+${escaped}$`, 'i')
  })
}

export function resolveCorsOrigins(): string[] {
  const configuredOrigins = process.env.CORS_ORIGINS?.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)

  if (configuredOrigins?.length) {
    return configuredOrigins
  }

  return [
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    'http://localhost:5174',
    'http://127.0.0.1:5174',
    'http://localhost:10086',
    'http://127.0.0.1:10086',
    'http://localhost:3000',
    'http://127.0.0.1:3000',
  ]
}
