// Serves the production H5 build from dist/ on 127.0.0.1:3000.
// Hashed JS/CSS are immutable. index.html is not cached. Responses are gzip or brotli.
import console from 'node:console'
import { existsSync, statSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import http from 'node:http'
import net from 'node:net'
import { extname, join, normalize, resolve, sep } from 'node:path'
import process from 'node:process'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { brotliCompressSync, gzipSync, constants as zlibConstants } from 'node:zlib'

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const dist = resolve(appRoot, 'dist')
const port = 3000
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
}

const probe = net.createServer()
try {
  const occupied = await new Promise((ready, reject) => {
    const connection = net.connect({ port, host: '127.0.0.1' })
    connection.once('connect', () => {
      connection.destroy()
      ready(true)
    })
    connection.once('error', (error) =>
      error.code === 'ECONNREFUSED' ? ready(false) : reject(error),
    )
    connection.setTimeout(1500, () => {
      connection.destroy()
      reject(new Error('Port check timed out'))
    })
  })
  if (occupied) throw Object.assign(new Error('Port occupied'), { code: 'EADDRINUSE' })
  await new Promise((ready, reject) => {
    probe.once('error', reject)
    probe.listen({ port, host: '127.0.0.1', exclusive: true }, ready)
  })
  await new Promise((closed) => probe.close(closed))
} catch (error) {
  console.error(
    error.code === 'EADDRINUSE'
      ? '晓球网站端口3000已被占用。请使用 http://127.0.0.1:3000/；先关闭旧服务再重启，不会另开预览端口。'
      : '无法检查晓球网站端口3000，请检查本机网络配置。',
  )
  process.exit(1)
}

if (!existsSync(join(dist, 'index.html'))) {
  console.error('缺少生产构建。请先在 apps/mini-program 执行 npm run build:h5。')
  process.exit(1)
}

function fileFor(urlPath) {
  const pathname = decodeURIComponent(urlPath.split('?')[0] || '/')
  const relative = normalize(pathname).replace(/^(\.\.(\/|\\|$))+/, '')
  const candidate = join(dist, relative)
  if (!candidate.startsWith(dist + sep) && candidate !== dist) return join(dist, 'index.html')
  if (existsSync(candidate) && statSync(candidate).isFile()) return candidate
  return join(dist, 'index.html')
}

function cacheControl(file) {
  if (file.endsWith(`${sep}index.html`)) return 'no-cache'
  if (/\.[a-f0-9]{8}\.(js|css)$/.test(file)) return 'public, max-age=31536000, immutable'
  return 'public, max-age=3600'
}

const server = http.createServer(async (request, response) => {
  try {
    const file = fileFor(request.url || '/')
    const body = await readFile(file)
    const type = types[extname(file)] || 'application/octet-stream'
    const accept = String(request.headers['accept-encoding'] || '')
    const compressible = /^text\/|javascript|json|svg|xml/.test(type)
    let payload = body
    let encoding = ''
    if (compressible && body.length >= 1024) {
      if (accept.includes('br')) {
        payload = brotliCompressSync(body, {
          params: { [zlibConstants.BROTLI_PARAM_QUALITY]: 5 },
        })
        encoding = 'br'
      } else if (accept.includes('gzip')) {
        payload = gzipSync(body)
        encoding = 'gzip'
      }
    }
    response.writeHead(200, {
      'content-type': type,
      'content-length': payload.length,
      'cache-control': cacheControl(file),
      ...(encoding ? { 'content-encoding': encoding, vary: 'Accept-Encoding' } : {}),
    })
    response.end(payload)
  } catch {
    response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' })
    response.end('未找到')
  }
})

server.listen(port, '127.0.0.1', () => {
  console.log(`晓球生产 H5 http://127.0.0.1:${port}/  （${dist}）`)
})
