import { spawn } from 'node:child_process'
import process from 'node:process'
import console from 'node:console'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

// Nest validation and OpenAPI require the same decorator metadata as production.
const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
process.env.POST_MEDIA_DIRECTORY ??= resolve(appRoot, '../../../XQ-data/media/posts')
process.env.AVATAR_MEDIA_DIRECTORY ??= resolve(appRoot, '../../../XQ-data/media/avatars')
process.env.MEDIA_ASSETS_DIRECTORY ??= resolve(appRoot, '../../../XQ-data/media/managed')
const require = createRequire(resolve(appRoot, 'package.json'))
let server
let stopping = false
let restart = Promise.resolve()

function launch(args, stdio = 'inherit') {
  return spawn(process.execPath, args, { cwd: appRoot, stdio, windowsHide: true })
}
async function stopServer() {
  if (!server || server.exitCode !== null || server.signalCode !== null) return
  const child = server
  await new Promise((resolveExit) => {
    child.once('exit', resolveExit)
    child.kill()
  })
}
async function rebuildReady() {
  await stopServer()
  if (stopping) return
  const copy = launch(['scripts/copy-prisma-engine.mjs', 'dist/generated/prisma'])
  const copied = await new Promise((resolveExit) => copy.once('exit', resolveExit))
  if (copied !== 0 || stopping) return
  server = launch(['dist/main.js'])
  server.on('error', () => console.error('API_DEV_SERVER_START_FAILED'))
}

const compiler = launch(
  [
    require.resolve('typescript/bin/tsc'),
    '-p',
    'tsconfig.build.json',
    '--watch',
    '--preserveWatchOutput',
    '--pretty',
    'false',
    '--locale',
    'en',
  ],
  ['ignore', 'pipe', 'inherit'],
)
let pending = ''
compiler.stdout.on('data', (chunk) => {
  process.stdout.write(chunk)
  pending += chunk.toString()
  const lines = pending.split(/\r?\n/)
  pending = lines.pop() ?? ''
  if (lines.some((line) => /Found 0 errors\. Watching for file changes\./.test(line))) {
    restart = restart.then(rebuildReady).catch(() => console.error('API_DEV_RESTART_FAILED'))
  }
})
compiler.on('error', () => {
  console.error('API_DEV_COMPILER_START_FAILED')
  void shutdown(1)
})
compiler.on('exit', (code) => {
  if (!stopping) void shutdown(code || 1)
})

async function shutdown(code) {
  if (stopping) return
  stopping = true
  compiler.kill()
  await restart
  await stopServer()
  process.exit(code)
}
process.on('SIGINT', () => void shutdown(0))
process.on('SIGTERM', () => void shutdown(0))
