import { brotliCompressSync, constants as zlibConstants, gzipSync } from 'node:zlib'

import type { NextFunction, Request, Response } from 'express'

const COMPRESSIBLE = /json|text|javascript|xml|svg/

export function compressResponse(request: Request, response: Response, next: NextFunction): void {
  const accept = String(request.headers['accept-encoding'] || '')
  const encoding = accept.includes('br') ? 'br' : accept.includes('gzip') ? 'gzip' : ''
  if (!encoding || request.method === 'HEAD') {
    next()
    return
  }
  const chunks: Buffer[] = []
  const write = response.write.bind(response)
  const end = response.end.bind(response)
  response.write = ((chunk: unknown, ...rest: unknown[]) => {
    if (chunk) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)))
    const callback = rest.find((item) => typeof item === 'function') as (() => void) | undefined
    callback?.()
    return true
  }) as Response['write']
  response.end = ((chunk: unknown, ...rest: unknown[]) => {
    if (chunk && typeof chunk !== 'function') {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)))
    }
    const callback = rest.find((item) => typeof item === 'function') as (() => void) | undefined
    const body = Buffer.concat(chunks)
    const type = String(response.getHeader('Content-Type') || '')
    const skip =
      response.statusCode === 204 ||
      response.statusCode === 304 ||
      response.getHeader('Content-Encoding') ||
      body.length < 1024 ||
      !COMPRESSIBLE.test(type)
    response.write = write
    response.end = end
    if (skip) return end(body, callback)
    const payload =
      encoding === 'br'
        ? brotliCompressSync(body, { params: { [zlibConstants.BROTLI_PARAM_QUALITY]: 4 } })
        : gzipSync(body)
    const vary = String(response.getHeader('Vary') || '')
    response.setHeader('Content-Encoding', encoding)
    response.setHeader('Vary', vary.includes('Accept-Encoding') ? vary : [vary, 'Accept-Encoding'].filter(Boolean).join(', '))
    response.removeHeader('Content-Length')
    return end(payload, callback)
  }) as Response['end']
  next()
}
