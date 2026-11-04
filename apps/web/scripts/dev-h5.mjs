// `dev:h5` is the webpack watch compiler: unminified, no content hashes, no long-lived cache.
// Production navigation measurements use `npm run build:h5` and then `npm run serve:h5`.
import { spawn, spawnSync } from 'node:child_process'
import console from 'node:console'
import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import net from 'node:net'
import { dirname, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(resolve(appRoot, 'package.json'))
const port = 3000
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

const repoRoot = resolve(appRoot, '../..')
console.log('构建管理中心，供网站 /admin/ 使用')
// Windows cannot execute npm.cmd directly through spawnSync (EINVAL).
// Run npm's JavaScript entry with Node so paths never pass through a shell.
const windows = process.platform === 'win32'
const npmFromEnvironment = process.env.npm_execpath
const npmCli = npmFromEnvironment && /[\\/]npm-cli\.js$/i.test(npmFromEnvironment)
  ? npmFromEnvironment
  : resolve(dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js')
if (windows && !existsSync(npmCli)) {
  console.error('无法找到 npm 启动文件，请确认 Node.js 和 npm 安装完整。')
  process.exit(1)
}
const adminBuild = spawnSync(
  windows ? process.execPath : 'npm',
  [
    ...(windows ? [npmCli] : []),
    '--prefix', resolve(repoRoot, 'apps/admin-web'), 'run', 'build', '--', '--base', '/admin/',
  ],
  {
    cwd: repoRoot,
    stdio: 'inherit',
    env: {
      ...process.env,
      VITE_API_BASE_URL: process.env.VITE_API_BASE_URL || 'http://127.0.0.1:3001',
      VITE_ORGANIZATION_ID:
        process.env.VITE_ORGANIZATION_ID || '00000000-0000-4000-8000-000000000001',
      VITE_H5_SESSION_BRIDGE: process.env.VITE_H5_SESSION_BRIDGE || '1',
      VITE_LOCAL_SHORT_PASSWORDS: process.env.VITE_LOCAL_SHORT_PASSWORDS || '0',
    },
  },
)
if (adminBuild.status !== 0) {
  if (adminBuild.error) console.error(adminBuild.error.message)
  console.error('管理中心构建失败，已停止网站启动。')
  process.exit(adminBuild.status ?? 1)
}

console.log('晓球日常网站：http://127.0.0.1:3000/（固定地址，不自动打开浏览器）')
const cli = resolve(dirname(require.resolve('@tarojs/cli/package.json')), 'bin/taro')
const child = spawn(
  process.execPath,
  [cli, 'build', '--type', 'h5', '--watch', '--port', String(port)],
  {
    cwd: appRoot,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  },
)
let pending = '',
  rejectedPort = false
child.stdout.on('data', (chunk) => {
  process.stdout.write(chunk)
  pending = (pending + chunk.toString()).slice(-2000)
  // Taro changes ports automatically. Catch a race after the preflight check.
  if (!rejectedPort && pending.includes('自动切换到空闲端口')) {
    rejectedPort = true
    console.error('端口3000在启动期间被占用，已停止额外预览。请复用日常网站或关闭旧服务后重试。')
    child.kill()
  }
})
child.stderr.on('data', (chunk) => process.stderr.write(chunk))
child.on('error', () => {
  console.error('晓球H5开发服务启动失败。')
  process.exitCode = 1
})
child.on('exit', (code) => {
  process.exitCode = rejectedPort ? 1 : (code ?? 0)
})
process.on('SIGINT', () => child.kill())
process.on('SIGTERM', () => child.kill())
