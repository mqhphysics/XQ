import { brotliCompress, constants as zlibConstants, gzip } from 'node:zlib'

import type { NextFunction, Request, Response } from 'express'

const COMPRESSIBLE = /json|text|javascript|xml|svg/

export function compressResponse(request: Request, response: Response, next: NextFunction): void {
  const accept = String(request.headers['accept-encoding'] || '')
  const encoding = accept.includes('br') ? 'br' : accept.includes('gzip') ? 'gzip' : ''
  if (!encoding || request.method === 'HEAD') {
    next()
    return
  }
  const end = response.end.bind(response)
  // Streaming handlers keep their original write/backpressure path. Only complete JSON/text
  // responses supplied to end() are compressed, using zlib's asynchronous worker pool.
  response.end = ((chunk: unknown, ...rest: unknown[]) => {
    const callback = [chunk, ...rest].find((item) => typeof item === 'function') as
      | (() => void)
      | undefined
    response.end = end
    const type = String(response.getHeader('Content-Type') || '')
    if (response.headersSent || !chunk || typeof chunk === 'function' || !COMPRESSIBLE.test(type))
      return end(chunk as never, ...(rest as []))
    const body = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk))
    const skip =
      response.statusCode === 204 ||
      response.statusCode === 304 ||
      response.getHeader('Content-Encoding') ||
      body.length < 1024 ||
      !COMPRESSIBLE.test(type)
    if (skip) return end(body, callback)
    const done = (error: Error | null, payload: Buffer) => {
      if (response.destroyed) return
      if (error) {
        end(body, callback)
        return
      }
      const vary = String(response.getHeader('Vary') || '')
      response.setHeader('Content-Encoding', encoding)
      response.setHeader(
        'Vary',
        vary.toLowerCase().includes('accept-encoding')
          ? vary
          : [vary, 'Accept-Encoding'].filter(Boolean).join(', '),
      )
      response.removeHeader('Content-Length')
      end(payload, callback)
    }
    if (encoding === 'br')
      brotliCompress(body, { params: { [zlibConstants.BROTLI_PARAM_QUALITY]: 4 } }, done)
    else gzip(body, done)
    return response
  }) as Response['end']
  next()
}
